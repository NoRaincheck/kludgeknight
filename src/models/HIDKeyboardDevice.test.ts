import { describe, expect, test } from 'bun:test';
import { HIDKeyboardDevice, type KeymapTransport } from './HIDKeyboardDevice';
import type { KeyboardConfig } from '../types/keyboard';
import type { StandardLightingSettings } from './LightingCodec';

/**
 * Transport whose methods rely on `this` (like ViaProtocolTranslator).
 * Passing an unbound method reference must still work.
 */
class StatefulTransport implements KeymapTransport {
  calls: string[] = [];

  async sendProfile(): Promise<void> {
    this.calls.push('profile');
  }

  async sendStandardLighting(): Promise<void> {
    this.calls.push('lighting');
  }
}

function createMockHIDDevice(): HIDDevice {
  return {
    vendorId: 0x342d,
    productId: 0xe48e,
    productName: 'R87Pro',
    opened: true,
    collections: [],
    open: async () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as HIDDevice;
}

function createConfig(): KeyboardConfig {
  return {
    pid: 'e48e',
    name: 'Test Board',
    keys: [],
    imageUrl: '',
    lightEnabled: true,
    rgb: true,
    lightingType: 'rgb',
    lightingModes: [
      {
        index: 13,
        name: 'Cycle Left Right',
        flags: { animation: false, speed: true, brightness: true, direction: 0, random: false, colorPicker: true },
      },
    ],
  };
}

const SETTINGS: StandardLightingSettings = {
  modeIndex: 13,
  speed: 3,
  brightness: 5,
  color: { r: 255, g: 255, b: 255 },
  randomColor: false,
  sleep: 2,
};

describe('HIDKeyboardDevice lighting', () => {
  test('setLighting keeps the transport binding (no roundTrip TypeError)', async () => {
    const transport = new StatefulTransport();
    const device = new HIDKeyboardDevice(createMockHIDDevice(), createConfig(), transport);

    await device.setLighting(SETTINGS);

    expect(transport.calls).toEqual(['lighting']);
    expect(device.lightingSettings).toEqual(SETTINGS);
  });
});
