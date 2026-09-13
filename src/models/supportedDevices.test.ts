import { test, expect } from 'bun:test';
import { SUPPORTED_INTERFACES, isSupportedDevice } from './supportedDevices';

test('legacy RK config interface matches', () => {
  expect(
    isSupportedDevice(0x258a, [{ usagePage: 0x0001, usage: 0x0080 }])
  ).toBe(true);
});

test('legacy RK interface requires the System Control collection', () => {
  expect(
    isSupportedDevice(0x258a, [{ usagePage: 0x0001, usage: 0x0006 }])
  ).toBe(false);
});

test('R87Pro from issue #22 matches (VID 0x342D, FF60:0061)', () => {
  expect(
    isSupportedDevice(0x342d, [{ usagePage: 0xff60, usage: 0x0061 }])
  ).toBe(true);
});

test('Westberry vendor matches regardless of product', () => {
  expect(
    isSupportedDevice(0x342d, [{ usagePage: 0xff60, usage: 0x0061 }])
  ).toBe(true);
});

test('Westberry without the VIA collection does not match', () => {
  expect(
    isSupportedDevice(0x342d, [{ usagePage: 0x0001, usage: 0x0080 }])
  ).toBe(false);
});

test('unknown vendors never match', () => {
  expect(
    isSupportedDevice(0x046d, [{ usagePage: 0x0001, usage: 0x0080 }])
  ).toBe(false);
});

test('requestDevice filters stay in sync with the matcher', () => {
  // Every allowlist entry must be a valid WebHID filter and must match itself
  for (const filter of SUPPORTED_INTERFACES) {
    expect(filter.vendorId).toBeGreaterThan(0);
    expect(
      isSupportedDevice(filter.vendorId, [
        { usagePage: filter.usagePage, usage: filter.usage },
      ])
    ).toBe(true);
  }
});
