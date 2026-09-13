/**
 * Custom error types for Kludge Knight
 * These errors provide type-safe error handling and separation of concerns
 * between model layer (throws) and UI layer (catches and displays messages)
 */

/**
 * Thrown when WebHID API is not available (unsupported browser)
 */
export class WebHIDNotAvailableError extends Error {
  constructor() {
    super('WebHID API not available');
    this.name = 'WebHIDNotAvailableError';
  }
}

/**
 * Thrown when a keyboard model is not supported (no configuration found)
 */
export class UnsupportedKeyboardError extends Error {
  readonly pid: string;
  constructor(pid: string) {
    super(`Keyboard with PID ${pid} is not supported`);
    this.name = 'UnsupportedKeyboardError';
    this.pid = pid;
  }
}

/**
 * Thrown when user cancels the browser device picker
 * This should be caught and handled silently (no error toast)
 */
export class UserCancelledError extends Error {
  constructor() {
    super('User cancelled device selection');
    this.name = 'UserCancelledError';
  }
}

/**
 * Thrown when device.open() fails with NotAllowedError.
 * Common cause: another application has exclusive access to the device.
 */
export class DeviceOpenError extends Error {
  readonly pid: string;
  constructor(pid: string) {
    super(`Failed to open device with PID ${pid}`);
    this.name = 'DeviceOpenError';
    this.pid = pid;
  }
}

/**
 * Thrown when attempting lighting operations on a keyboard without lighting support
 */
export class LightingNotSupportedError extends Error {
  readonly keyboardName: string;
  constructor(keyboardName: string) {
    super(`Keyboard ${keyboardName} does not support lighting`);
    this.name = 'LightingNotSupportedError';
    this.keyboardName = keyboardName;
  }
}

/**
 * Thrown when attempting RGB operations on a keyboard without RGB support
 */
export class RGBNotSupportedError extends Error {
  readonly keyboardName: string;
  constructor(keyboardName: string) {
    super(`Keyboard ${keyboardName} does not support RGB lighting`);
    this.name = 'RGBNotSupportedError';
    this.keyboardName = keyboardName;
  }
}

/**
 * Thrown when a VIA command receives no input-report response in time.
 */
export class ViaTimeoutError extends Error {
  readonly command: number;
  constructor(command: number) {
    super(`VIA command 0x${command.toString(16)} timed out waiting for device response`);
    this.name = 'ViaTimeoutError';
    this.command = command;
  }
}

/**
 * Thrown when a VIA device reports a command as unhandled (0xFF).
 */
export class ViaCommandError extends Error {
  readonly command: number;
  constructor(command: number, detail: string) {
    super(`VIA command 0x${command.toString(16)} failed: ${detail}`);
    this.name = 'ViaCommandError';
    this.command = command;
  }
}

/**
 * Thrown when an RK firmware code has no QMK keycode equivalent
 * (e.g. Fn or legacy macro combos) and cannot be written to a VIA device.
 */
export class ViaUnsupportedKeyError extends Error {
  readonly firmwareCode: number;
  readonly keyIndex: number;
  constructor(firmwareCode: number, keyIndex: number) {
    super(`Firmware code 0x${firmwareCode.toString(16)} (key index ${keyIndex}) has no QMK equivalent`);
    this.name = 'ViaUnsupportedKeyError';
    this.firmwareCode = firmwareCode;
    this.keyIndex = keyIndex;
  }
}
