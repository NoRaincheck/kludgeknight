/**
 * Allowlist of WebHID interfaces Kludge Knight can configure.
 *
 * Entries double as `requestDevice()` filters and as matchers for
 * `getDevices()` rescans, so both paths stay in sync.
 */

/**
 * Configuration protocol spoken on an interface.
 * - 'rk-legacy': 9-buffer feature-report protocol (VID 0x258a boards)
 * - 'via': QMK VIA raw-HID protocol, 32-byte input/output reports
 */
export type DeviceProtocol = 'rk-legacy' | 'via';

export interface SupportedInterface {
  vendorId: number;
  usagePage: number;
  usage: number;
  protocol: DeviceProtocol;
}

export const SUPPORTED_INTERFACES: SupportedInterface[] = [
  {
    // Legacy Royal Kludge configuration interface
    // (Generic Desktop / System Control)
    vendorId: 0x258a,
    usagePage: 0x0001,
    usage: 0x0080,
    protocol: 'rk-legacy',
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
    protocol: 'via',
  },
];

export interface HidCollectionLike {
  usagePage?: number;
  usage?: number;
}

/**
 * Find the allowlist entry matching a HID device, if any.
 */
export function matchSupportedInterface(
  vendorId: number,
  collections: readonly HidCollectionLike[]
): SupportedInterface | undefined {
  return SUPPORTED_INTERFACES.find(
    (filter) =>
      vendorId === filter.vendorId &&
      collections.some(
        (col) => col.usagePage === filter.usagePage && col.usage === filter.usage
      )
  );
}

/**
 * Check whether a HID device exposes one of the supported interfaces.
 */
export function isSupportedDevice(
  vendorId: number,
  collections: readonly HidCollectionLike[]
): boolean {
  return matchSupportedInterface(vendorId, collections) !== undefined;
}
