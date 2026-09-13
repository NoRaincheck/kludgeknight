import { describe, expect, test } from 'bun:test';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { parseViaKeymap } from './viaKeymap';

describe('parseViaKeymap', () => {
  test('accepts a valid document', () => {
    const via = parseViaKeymap(
      { layers: 2, rows: 2, cols: 2, keys: [[0, 0], [1, 1]] },
      'e48e'
    );
    expect(via.layers).toBe(2);
    expect(via.keys).toHaveLength(2);
  });

  test('rejects duplicate matrix positions', () => {
    expect(() =>
      parseViaKeymap({ layers: 1, rows: 2, cols: 2, keys: [[0, 0], [0, 0]] }, 'e48e')
    ).toThrow(/duplicate/);
  });

  test('rejects positions outside the matrix', () => {
    expect(() =>
      parseViaKeymap({ layers: 1, rows: 2, cols: 2, keys: [[0, 0], [2, 0]] }, 'e48e')
    ).toThrow(/exceeds/);
  });

  test('rejects invalid layers', () => {
    expect(() =>
      parseViaKeymap({ layers: 0, rows: 2, cols: 2, keys: [[0, 0]] }, 'e48e')
    ).toThrow(/layers/);
  });
});

describe('via.json sidecars', () => {
  test('every via.json has one matrix position per KB.ini key', async () => {
    const devDir = join(process.cwd(), 'public', 'rk', 'Dev');
    const dirs = await readdir(devDir);

    let checked = 0;
    for (const dir of dirs) {
      let viaJson: string;
      try {
        viaJson = await readFile(join(devDir, dir, 'via.json'), 'utf-8');
      } catch {
        continue; // Legacy board without a VIA matrix map
      }
      const via = parseViaKeymap(JSON.parse(viaJson) as unknown, dir);

      const kbIni = await readFile(join(devDir, dir, 'KB.ini'), 'utf-8');
      const keyCount = kbIni.split('\n').filter((line) => /^K\d+=/.test(line)).length;

      expect(via.layers).toBeGreaterThan(0);
      expect(via.keys).toHaveLength(keyCount);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('E48E knob (K88, last key) sits at matrix [3,14]', async () => {
    const devDir = join(process.cwd(), 'public', 'rk', 'Dev', 'E48E');
    const viaJson = JSON.parse(await readFile(join(devDir, 'via.json'), 'utf-8')) as unknown;
    const via = parseViaKeymap(viaJson, 'e48e');

    expect(via.keys[via.keys.length - 1]).toEqual({ row: 3, col: 14 });
  });
});
