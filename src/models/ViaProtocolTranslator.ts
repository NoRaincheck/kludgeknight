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
const CMD_GET_LAYER_COUNT = 0x11;
const CMD_UNHANDLED = 0xff;

export class ViaProtocolTranslator {
  private device: HIDDevice;
  private slots: ViaKeySlot[];
  private layer: number;

  /**
   * @param device - Opened HIDDevice exposing the VIA raw-HID collection
   * @param slots - Key slots aligned with the keyboard config (matrix positions)
   * @param layer - VIA layer to read/write (layer 0 = base)
   */
  constructor(device: HIDDevice, slots: ViaKeySlot[], layer = 0) {
    this.device = device;
    this.slots = slots;
    this.layer = layer;
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
   * Write the full keymap (custom mappings over KB.ini defaults) to layer 0.
   * Throws ViaUnsupportedKeyError for codes with no QMK equivalent.
   */
  async sendProfile(mappings: Map<number, FirmwareCode>): Promise<void> {
    for (const slot of this.slots) {
      const fw = mappings.get(slot.bIndex) ?? slot.defaultFw;
      const qmk = firmwareToQmkCode(fw);
      if (qmk === undefined) {
        throw new ViaUnsupportedKeyError(fw, slot.bIndex);
      }
      await this.setKeycode(slot.row, slot.col, qmk);
    }
  }
}
