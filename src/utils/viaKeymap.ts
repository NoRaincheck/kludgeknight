/**
 * Loader for per-keyboard VIA matrix maps (`via.json` sidecars).
 *
 * Legacy RK boards describe keys in KB.ini only. VIA boards (e.g. the
 * Westberry-based R87Pro) additionally need the QMK matrix position of
 * each key, stored in `public/rk/Dev/<PID>/via.json` with `keys[]`
 * aligned to the K1..Kn order in KB.ini.
 */

export interface ViaMatrixPosition {
  row: number;
  col: number;
}

/**
 * A QMK RGB-matrix effect from the vendor VIA definition
 * ( Lighting > Backlight > Effect dropdown ).
 */
export interface ViaEffect {
  id: number;
  name: string;
}

export interface ViaKeymap {
  layers: number;
  rows: number;
  cols: number;
  /** Matrix positions aligned with the keyboard config's keys array. */
  keys: ViaMatrixPosition[];
  /** QMK lighting effects; when non-empty these replace the legacy LedOpt modes. */
  effects: ViaEffect[];
  /** Effect id selected by default (firmware default); first effect when omitted. */
  defaultEffect?: number;
}

async function fetchViaJson(pid: string): Promise<unknown | null> {
  for (const dirCase of [pid.toUpperCase(), pid.toLowerCase()]) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}rk/Dev/${dirCase}/via.json`);
      if (response.ok) {
        return (await response.json()) as unknown;
      }
    } catch {
      // Try the next casing
    }
  }
  return null;
}

function isMatrixPosition(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [row, col] = value;
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0;
}

function isViaEffect(value: unknown): value is ViaEffect {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { id, name } = value as Record<string, unknown>;
  return Number.isInteger(id) && (id as number) >= 0 && (id as number) <= 255 &&
    typeof name === 'string' && name.length > 0;
}

/**
 * Validate a parsed via.json document. Exported for unit testing.
 * Throws when the document is malformed.
 */
export function parseViaKeymap(json: unknown, pid: string): ViaKeymap {
  if (typeof json !== 'object' || json === null) {
    throw new Error(`Invalid via.json for PID ${pid}: expected an object`);
  }

  const { layers, rows, cols, keys, effects, defaultEffect } = json as Record<string, unknown>;

  if (!Number.isInteger(layers) || (layers as number) < 1) {
    throw new Error(`Invalid via.json for PID ${pid}: layers must be a positive integer`);
  }
  if (!Number.isInteger(rows) || !Number.isInteger(cols)) {
    throw new Error(`Invalid via.json for PID ${pid}: rows/cols must be integers`);
  }
  if (!Array.isArray(keys) || keys.length === 0 || !keys.every(isMatrixPosition)) {
    throw new Error(`Invalid via.json for PID ${pid}: keys must be a non-empty array of [row, col] pairs`);
  }

  const positions: ViaMatrixPosition[] = keys.map(([row, col]) => ({ row, col }));
  const seen = new Set<string>();
  for (const [index, pos] of positions.entries()) {
    const key = `${pos.row},${pos.col}`;
    if (seen.has(key)) {
      throw new Error(`Invalid via.json for PID ${pid}: duplicate matrix position [${key}] at index ${index}`);
    }
    seen.add(key);
    if (pos.row >= (rows as number) || pos.col >= (cols as number)) {
      throw new Error(`Invalid via.json for PID ${pid}: position [${key}] exceeds ${rows}x${cols} matrix`);
    }
  }

  // Lighting effects are optional; an empty/absent list keeps legacy LedOpt modes
  let parsedEffects: ViaEffect[] = [];
  if (effects !== undefined) {
    if (!Array.isArray(effects) || !effects.every(isViaEffect)) {
      throw new Error(`Invalid via.json for PID ${pid}: effects must be an array of {id, name}`);
    }
    const ids = new Set<number>();
    for (const effect of effects) {
      if (ids.has(effect.id)) {
        throw new Error(`Invalid via.json for PID ${pid}: duplicate effect id ${effect.id}`);
      }
      ids.add(effect.id);
    }
    parsedEffects = [...effects];
  }

  let parsedDefault: number | undefined;
  if (defaultEffect !== undefined) {
    if (!Number.isInteger(defaultEffect) || !parsedEffects.some((e) => e.id === defaultEffect)) {
      throw new Error(`Invalid via.json for PID ${pid}: defaultEffect must match an effect id`);
    }
    parsedDefault = defaultEffect as number;
  }

  return {
    layers: layers as number,
    rows: rows as number,
    cols: cols as number,
    keys: positions,
    effects: parsedEffects,
    defaultEffect: parsedDefault,
  };
}

/**
 * Load and validate the VIA matrix map for a PID.
 * Returns null when the keyboard has no via.json (legacy boards).
 * Throws when via.json exists but is malformed.
 */
export async function loadViaKeymap(pid: string): Promise<ViaKeymap | null> {
  const json = await fetchViaJson(pid);
  if (!json) {
    return null;
  }

  return parseViaKeymap(json, pid);
}
