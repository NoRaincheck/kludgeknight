/**
 * VIA protocol driver for QMK-based RK keyboards (e.g. the Westberry-based
 * R87Pro, VID 0x342D). Generic: works for any VIA device given its key slots.
 *
 * Command IDs from QMK `quantum/via.h` (VIA_PROTOCOL_VERSION 0x000D).
 * Transport: 32-byte raw-HID output reports (report ID 0) on the vendor
 * collection (e.g. FF60:0061), with the echoed 32-byte input report as
 * the response.
 */

import type { FirmwareCode } from '../types/keycode';
import { firmwareToQmkCode } from '../types/keycode';
import type { StandardLightingSettings } from './LightingCodec';
import { rgbToHsv } from '../utils/colorConversion';
import { ViaCommandError, ViaTimeoutError, ViaUnsupportedKeyError } from '../errors/KludgeKnightErrors';

/** One remappable key: buffer index + default code + QMK matrix position. */
export interface ViaKeySlot {
  bIndex: number;
  defaultFw: FirmwareCode;
  row: number;
  col: number;
}

const REPORT_ID = 0;
const PACKET_SIZE = 32;
const RESPONSE_TIMEOUT_MS = 1500;

// VIA command IDs (QMK quantum/via.h)
const CMD_GET_PROTOCOL_VERSION = 0x01;
const CMD_GET_KEYCODE = 0x04;
const CMD_SET_KEYCODE = 0x05;
const CMD_CUSTOM_SET_VALUE = 0x07;
const CMD_CUSTOM_SAVE = 0x09;
const CMD_GET_LAYER_COUNT = 0x11;
const CMD_UNHANDLED = 0xff;

// QMK rgb_matrix channel and value IDs (quantum/via.h)
const CHANNEL_RGB_MATRIX = 0x03;
const RGB_MATRIX_BRIGHTNESS = 0x01;
const RGB_MATRIX_EFFECT = 0x02;
const RGB_MATRIX_EFFECT_SPEED = 0x03;
const RGB_MATRIX_COLOR = 0x04;

export class ViaProtocolTranslator {
  private device: HIDDevice;
  private slots: ViaKeySlot[];
  private layer: number;
  private qmkEffectIds: Set<number> | undefined;

  /**
   * @param device - Opened HIDDevice exposing the VIA raw-HID collection
   * @param slots - Key slots aligned with the keyboard config (matrix positions)
   * @param layer - VIA layer to read/write (layer 0 = base)
   * @param qmkEffectIds - Known QMK effect IDs for lighting (from via.json);
   *   when omitted, lighting commands are rejected by the caller
   */
  constructor(device: HIDDevice, slots: ViaKeySlot[], layer = 0, qmkEffectIds?: number[]) {
    this.device = device;
    this.slots = slots;
    this.layer = layer;
    this.qmkEffectIds = qmkEffectIds !== undefined ? new Set(qmkEffectIds) : undefined;
  }

  /**
   * Check whether a mode index is a known QMK effect ID for this board.
   */
  hasEffect(qmkEffectId: number): boolean {
    return this.qmkEffectIds?.has(qmkEffectId) ?? false;
  }

  /**
   * Send a VIA command and await the echoed input report.
   */
  private async roundTrip(command: number, payload: number[] = []): Promise<Uint8Array> {
    const packet = new Uint8Array(PACKET_SIZE);
    packet[0] = command;
    packet.set(payload.slice(0, PACKET_SIZE - 1), 1);

    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.device.removeEventListener('inputreport', onInputReport);
        reject(new ViaTimeoutError(command));
      }, RESPONSE_TIMEOUT_MS);

      const onInputReport = (event: HIDInputReportEvent) => {
        if (event.reportId !== REPORT_ID) {
          return;
        }
        const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
        // The device replaces byte 0 with 0xFF when it cannot handle a command
        if (data[0] === CMD_UNHANDLED) {
          clearTimeout(timer);
          this.device.removeEventListener('inputreport', onInputReport);
          reject(new ViaCommandError(command, 'not handled by device'));
          return;
        }
        if (data[0] !== command) {
          return;
        }
        clearTimeout(timer);
        this.device.removeEventListener('inputreport', onInputReport);
        resolve(data);
      };

      this.device.addEventListener('inputreport', onInputReport);

      this.device.sendReport(REPORT_ID, packet).catch((error: unknown) => {
        clearTimeout(timer);
        this.device.removeEventListener('inputreport', onInputReport);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  /**
   * Read the VIA protocol version (e.g. 0x000D).
   */
  async getProtocolVersion(): Promise<number> {
    const response = await this.roundTrip(CMD_GET_PROTOCOL_VERSION);
    return (response[1] << 8) | response[2];
  }

  /**
   * Read the number of dynamic keymap layers.
   */
  async getLayerCount(): Promise<number> {
    const response = await this.roundTrip(CMD_GET_LAYER_COUNT);
    return response[1];
  }

  /**
   * Read the QMK keycode at a matrix position on the active layer.
   */
  async getKeycode(row: number, col: number, layer = this.layer): Promise<number> {
    const response = await this.roundTrip(CMD_GET_KEYCODE, [layer, row, col]);
    return (response[4] << 8) | response[5];
  }

  /**
   * Write a QMK keycode at a matrix position on the active layer.
   */
  async setKeycode(row: number, col: number, keycode: number, layer = this.layer): Promise<void> {
    await this.roundTrip(CMD_SET_KEYCODE, [layer, row, col, (keycode >> 8) & 0xff, keycode & 0xff]);
  }

  /**
   * Write the full keymap (custom mappings over KB.ini defaults) to the active layer.
   * Slots whose code has no QMK equivalent (e.g. the Fn default) are left
   * untouched unless explicitly remapped, in which case ViaUnsupportedKeyError
   * is thrown.
   */
  async sendProfile(mappings: Map<number, FirmwareCode>): Promise<void> {
    for (const slot of this.slots) {
      const custom = mappings.get(slot.bIndex);
      const fw = custom ?? slot.defaultFw;
      const qmk = firmwareToQmkCode(fw);
      if (qmk === undefined) {
        if (custom !== undefined) {
          throw new ViaUnsupportedKeyError(fw, slot.bIndex);
        }
        // Unmappable default (e.g. Fn): leave the device's own keycode alone
        continue;
      }
      await this.setKeycode(slot.row, slot.col, qmk);
    }
  }

  /**
   * Apply standard lighting settings to the QMK RGB matrix.
   * Precondition: settings.modeIndex must be a known QMK effect ID
   * (see hasEffect); the caller rejects anything else.
   * Legacy random-color and sleep settings have no VIA equivalent and are ignored.
   */
  async sendStandardLighting(settings: StandardLightingSettings): Promise<void> {
    const brightness = Math.round((settings.brightness / 5) * 255);
    const speed = Math.round(((settings.speed - 1) / 4) * 255);

    await this.roundTrip(CMD_CUSTOM_SET_VALUE, [CHANNEL_RGB_MATRIX, RGB_MATRIX_BRIGHTNESS, brightness]);
    await this.roundTrip(CMD_CUSTOM_SET_VALUE, [CHANNEL_RGB_MATRIX, RGB_MATRIX_EFFECT, settings.modeIndex]);
    await this.roundTrip(CMD_CUSTOM_SET_VALUE, [CHANNEL_RGB_MATRIX, RGB_MATRIX_EFFECT_SPEED, speed]);
    if (!settings.randomColor) {
      const { h, s } = rgbToHsv(settings.color.r, settings.color.g, settings.color.b);
      const hue = Math.round((h / 360) * 255) % 256;
      const sat = Math.round(s * 255);
      await this.roundTrip(CMD_CUSTOM_SET_VALUE, [CHANNEL_RGB_MATRIX, RGB_MATRIX_COLOR, hue, sat]);
    }
    // Persist so settings survive replugging (matches legacy behavior)
    await this.roundTrip(CMD_CUSTOM_SAVE, [CHANNEL_RGB_MATRIX]);
  }
}
