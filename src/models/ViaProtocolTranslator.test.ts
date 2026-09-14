import { describe, expect, test } from 'bun:test';
import { ViaProtocolTranslator, type ViaKeySlot } from './ViaProtocolTranslator';
import { ViaCommandError, ViaTimeoutError, ViaUnsupportedKeyError } from '../errors/KludgeKnightErrors';

interface MockHarness {
  device: HIDDevice;
  sent: Uint8Array[];
  respondWith: (bytes: number[]) => void;
}

function createMockDevice(): MockHarness {
  const sent: Uint8Array[] = [];
  const listeners = new Set<(event: { reportId: number; data: DataView }) => void>();

  const respondWith = (bytes: number[]) => {
    const padded = new Uint8Array(32);
    padded.set(bytes.slice(0, 32));
    const event = { reportId: 0, data: new DataView(padded.buffer) };
    for (const listener of [...listeners]) {
      listener(event);
    }
  };

  const device = {
    sendReport: async (_reportId: number, data: Uint8Array) => {
      sent.push(new Uint8Array(data));
    },
    addEventListener: (_type: string, listener: (event: never) => void) => {
      listeners.add(listener as (event: { reportId: number; data: DataView }) => void);
    },
    removeEventListener: (_type: string, listener: (event: never) => void) => {
      listeners.delete(listener as (event: { reportId: number; data: DataView }) => void);
    },
  } as unknown as HIDDevice;

  return { device, sent, respondWith };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('ViaProtocolTranslator', () => {
  test('getProtocolVersion sends 0x01 and parses big-endian version', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, []);

    const pending = translator.getProtocolVersion();
    expect(sent).toHaveLength(1);
    expect(sent[0][0]).toBe(0x01);
    expect(sent[0]).toHaveLength(32);

    respondWith([0x01, 0x00, 0x0d]);
    await expect(pending).resolves.toBe(0x000d);
  });

  test('getKeycode sends layer/row/col and parses keycode', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, []);

    const pending = translator.getKeycode(2, 3, 1);
    expect([...sent[0].slice(0, 4)]).toEqual([0x04, 1, 2, 3]);

    respondWith([0x04, 1, 2, 3, 0x00, 0x05]);
    await expect(pending).resolves.toBe(0x0005);
  });

  test('setKeycode sends layer/row/col/keycode', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, []);

    const pending = translator.setKeycode(0, 0, 0x0004);
    expect([...sent[0].slice(0, 6)]).toEqual([0x05, 0, 0, 0, 0x00, 0x04]);

    respondWith([0x05, 0, 0, 0, 0x00, 0x04]);
    await pending;
  });

  test('sendProfile writes custom mappings over defaults as QMK codes', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const slots: ViaKeySlot[] = [
      { bIndex: 0, defaultFw: 0x0400, row: 0, col: 0 }, // A
      { bIndex: 1, defaultFw: 0x0500, row: 0, col: 1 }, // B
    ];
    const translator = new ViaProtocolTranslator(device, slots);

    const pending = translator.sendProfile(new Map([[0, 0x0600]])); // remap key 0 to C
    for (let i = 0; i < slots.length; i++) {
      await tick();
      const last = sent[sent.length - 1];
      respondWith([...last.slice(0, 6)]);
    }
    await pending;

    expect(sent).toHaveLength(2);
    expect([...sent[0].slice(0, 6)]).toEqual([0x05, 0, 0, 0, 0x00, 0x06]); // C
    expect([...sent[1].slice(0, 6)]).toEqual([0x05, 0, 0, 1, 0x00, 0x05]); // B default
  });

  test('sendProfile throws for codes with no QMK equivalent', async () => {
    const { device, sent } = createMockDevice();
    const slots: ViaKeySlot[] = [{ bIndex: 0, defaultFw: 0x0400, row: 0, col: 0 }];
    const translator = new ViaProtocolTranslator(device, slots);

    await expect(translator.sendProfile(new Map([[0, 0xb000]]))).rejects.toBeInstanceOf(
      ViaUnsupportedKeyError
    );
    expect(sent).toHaveLength(0);
  });

  test('sendProfile skips untouched defaults with no QMK equivalent (Fn)', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const slots: ViaKeySlot[] = [
      { bIndex: 59, defaultFw: 0xb000, row: 5, col: 9 }, // Fn default
      { bIndex: 0, defaultFw: 0x0400, row: 0, col: 0 }, // A
    ];
    const translator = new ViaProtocolTranslator(device, slots);

    const pending = translator.sendProfile(new Map([[0, 0x0600]])); // remap key 0 to C
    await tick();
    const last = sent[sent.length - 1];
    respondWith([...last.slice(0, 6)]);
    await pending;

    // Only the remapped key is written; the Fn default is left alone
    expect(sent).toHaveLength(1);
    expect([...sent[0].slice(0, 6)]).toEqual([0x05, 0, 0, 0, 0x00, 0x06]);
  });

  test('unhandled (0xFF) responses throw ViaCommandError', async () => {
    const { device, respondWith } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, []);

    const pending = translator.getProtocolVersion();
    respondWith([0xff]);
    await expect(pending).rejects.toBeInstanceOf(ViaCommandError);
  });

  test('hasEffect reflects the known QMK effect ids', () => {
    const { device } = createMockDevice();
    expect(new ViaProtocolTranslator(device, []).hasEffect(13)).toBe(false);
    expect(new ViaProtocolTranslator(device, [], 0, [0, 13]).hasEffect(13)).toBe(true);
    expect(new ViaProtocolTranslator(device, [], 0, [0, 13]).hasEffect(7)).toBe(false);
  });

  test('sendStandardLighting sends rgb_matrix values and saves', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, [], 0, [0, 13]);

    const pending = translator.sendStandardLighting({
      modeIndex: 13,
      speed: 3, // -> 128
      brightness: 5, // -> 255
      color: { r: 255, g: 0, b: 0 }, // red -> hue 0, sat 255
      randomColor: false,
      sleep: 2, // ignored: no VIA equivalent
    });
    // brightness, effect, speed, color, save
    for (let i = 0; i < 5; i++) {
      await tick();
      const last = sent[sent.length - 1];
      respondWith([...last.slice(0, 6)]);
    }
    await pending;

    expect(sent).toHaveLength(5);
    expect([...sent[0].slice(0, 4)]).toEqual([0x07, 0x03, 0x01, 255]); // brightness
    expect([...sent[1].slice(0, 4)]).toEqual([0x07, 0x03, 0x02, 13]); // effect
    expect([...sent[2].slice(0, 4)]).toEqual([0x07, 0x03, 0x03, 128]); // speed
    expect([...sent[3].slice(0, 5)]).toEqual([0x07, 0x03, 0x04, 0, 255]); // color
    expect([...sent[4].slice(0, 2)]).toEqual([0x09, 0x03]); // save
  });

  test('sendStandardLighting skips color when randomColor is set', async () => {
    const { device, sent, respondWith } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, [], 0, [5]);

    const pending = translator.sendStandardLighting({
      modeIndex: 5,
      speed: 1,
      brightness: 0,
      color: { r: 0, g: 0, b: 0 },
      randomColor: true,
      sleep: 5,
    });
    // brightness, effect, speed, save (no color)
    for (let i = 0; i < 4; i++) {
      await tick();
      const last = sent[sent.length - 1];
      respondWith([...last.slice(0, 6)]);
    }
    await pending;

    expect(sent).toHaveLength(4);
    expect([...sent[0].slice(0, 4)]).toEqual([0x07, 0x03, 0x01, 0]);
    expect([...sent[3].slice(0, 2)]).toEqual([0x09, 0x03]);
  });

  test('missing responses throw ViaTimeoutError', async () => {
    const { device } = createMockDevice();
    const translator = new ViaProtocolTranslator(device, []);

    await expect(translator.getLayerCount()).rejects.toBeInstanceOf(ViaTimeoutError);
  }, 5000);
});
