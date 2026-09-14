import { describe, expect, test } from 'bun:test';
import { firmwareToQmkCode, parseVK } from './keycode';

describe('parseVK', () => {
  test('uses nonzero firmware fallback from KB.ini placeholder keys', () => {
    const keyInfo = parseVK('0x01', '0x06000100');

    expect(keyInfo).toBeDefined();
    expect(keyInfo?.fw).toBe(0x06000100);
  });

  test('still skips placeholder keys when no firmware fallback exists', () => {
    expect(parseVK('0x01', '0x00')).toBeUndefined();
  });
});

describe('firmwareToQmkCode', () => {
  test('shifts regular keys from HID usage (A, Space, Enter, arrows)', () => {
    expect(firmwareToQmkCode(0x0400)).toBe(0x04); // A
    expect(firmwareToQmkCode(0x2c00)).toBe(0x2c); // Space
    expect(firmwareToQmkCode(0x2800)).toBe(0x28); // Enter
    expect(firmwareToQmkCode(0x5200)).toBe(0x52); // Up
    expect(firmwareToQmkCode(0x5800)).toBe(0x58); // Num Enter
  });

  test('maps modifier bit flags to QMK modifiers', () => {
    expect(firmwareToQmkCode(0x010000)).toBe(0xe0); // Left Ctrl
    expect(firmwareToQmkCode(0x020000)).toBe(0xe1); // Left Shift
    expect(firmwareToQmkCode(0x040000)).toBe(0xe2); // Left Alt
    expect(firmwareToQmkCode(0x080000)).toBe(0xe3); // Left Win
    expect(firmwareToQmkCode(0x100000)).toBe(0xe4); // Right Ctrl
    expect(firmwareToQmkCode(0x200000)).toBe(0xe5); // Right Shift
    expect(firmwareToQmkCode(0x400000)).toBe(0xe6); // Right Alt
    expect(firmwareToQmkCode(0x800000)).toBe(0xe7); // Right Win
  });

  test('maps media and system codes', () => {
    expect(firmwareToQmkCode(0x010000e2)).toBe(0x7f); // Mute
    expect(firmwareToQmkCode(0x010000e9)).toBe(0x80); // Volume Up
    expect(firmwareToQmkCode(0x010000ea)).toBe(0x81); // Volume Down
    expect(firmwareToQmkCode(0x010000cd)).toBe(0x88); // Play/Pause
    expect(firmwareToQmkCode(0x01000192)).toBe(0xfa); // Calculator
  });

  test('returns undefined for Fn, legacy macros, and placeholders', () => {
    expect(firmwareToQmkCode(0xb000)).toBeUndefined(); // Fn
    expect(firmwareToQmkCode(0x010400)).toBeUndefined(); // Select All macro
    expect(firmwareToQmkCode(0)).toBeUndefined(); // Unknown placeholder
  });
});
