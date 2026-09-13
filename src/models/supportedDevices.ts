/**
 * Allowlist of WebHID interfaces Kludge Knight can configure.
 *
 * Entries double as `requestDevice()` filters and as matchers for
 * `getDevices()` rescans, so both paths stay in sync.
 */

export interface SupportedInterface {
  vendorId: number;
  usagePage: number;
  usage: number;
}

export const SUPPORTED_INTERFACES: SupportedInterface[] = [
  {
    // Legacy Royal Kludge configuration interface
    // (Generic Desktop / System Control)
    vendorId: 0x258a,
    usagePage: 0x0001,
    usage: 0x0080,
  },
  {
    // RK R87Pro QMK/VIA board (Westberry MCU).
    // Dump from https://github.com/vinc3m1/kludgeknight/issues/22:
    // vendorId 0x342D, productId 0xE48E, collection FF60:0061.
    // Vendor-wide: unknown PIDs are rejected later by the per-PID
    // config lookup in openDevice (UnsupportedKeyboardError).
    vendorId: 0x342d,
    usagePage: 0xff60,
    usage: 0x0061,
  },
];

export interface HidCollectionLike {
  usagePage?: number;
  usage?: number;
}

/**
 * Check whether a HID device exposes one of the supported interfaces.
 */
export function isSupportedDevice(
  vendorId: number,
  collections: readonly HidCollectionLike[]
): boolean {
  return SUPPORTED_INTERFACES.some(
    (filter) =>
      vendorId === filter.vendorId &&
      collections.some(
        (col) => col.usagePage === filter.usagePage && col.usage === filter.usage
      )
  );
}
