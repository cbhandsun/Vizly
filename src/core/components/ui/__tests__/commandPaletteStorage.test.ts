import { beforeEach, describe, expect, it } from 'vitest';
import {
  COMMAND_PALETTE_RECENT_STORAGE_KEY,
  COMMAND_PALETTE_USAGE_STORAGE_KEY,
  bumpCommandUsage,
  bumpRecentCommandId,
  coerceCommandUsage,
  coerceRecentCommandIds,
  isSafeCommandId,
  readCommandUsage,
  readRecentCommandIds,
} from '../commandPaletteStorage';

describe('commandPaletteStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('validates command ids', () => {
    expect(isSafeCommandId('op:shortcuts')).toBe(true);
    expect(isSafeCommandId('diagram/wms-v2')).toBe(true);
    expect(isSafeCommandId('')).toBe(false);
    expect(isSafeCommandId('x'.repeat(161))).toBe(false);
    expect(isSafeCommandId('bad id with spaces')).toBe(false);
    expect(isSafeCommandId('<script>')).toBe(false);
  });

  it('coerces usage maps with bounded counts and entries', () => {
    const usage = coerceCommandUsage({
      'op:a': 3.8,
      'op:b': -1,
      'bad id': 9,
      'op:c': 5000,
      ...Object.fromEntries(Array.from({ length: 240 }, (_, index) => [`op:${index}`, index + 1])),
    });

    expect(usage['op:c']).toBe(1000);
    expect(usage['op:239']).toBe(240);
    expect(usage).not.toHaveProperty('bad id');
    expect(usage).not.toHaveProperty('op:b');
    expect(Object.keys(usage)).toHaveLength(200);
  });

  it('reads and bumps usage safely from localStorage', () => {
    localStorage.setItem(COMMAND_PALETTE_USAGE_STORAGE_KEY, '{broken');
    expect(readCommandUsage()).toEqual({});

    bumpCommandUsage('op:run');
    bumpCommandUsage('op:run');
    bumpCommandUsage('bad id');

    expect(readCommandUsage()).toEqual({ 'op:run': 2 });
  });

  it('coerces and persists recent command ids', () => {
    expect(coerceRecentCommandIds(['op:a', 'bad id', 'op:a', 'diagram/x'], 3)).toEqual(['op:a', 'diagram/x']);

    localStorage.setItem(COMMAND_PALETTE_RECENT_STORAGE_KEY, JSON.stringify(['op:old', '<bad>']));
    expect(bumpRecentCommandId('op:new')).toEqual(['op:new', 'op:old']);
    expect(bumpRecentCommandId('op:old')).toEqual(['op:old', 'op:new']);
    expect(bumpRecentCommandId('bad id')).toEqual(['op:old', 'op:new']);

    for (let index = 0; index < 25; index += 1) {
      bumpRecentCommandId(`op:${index}`);
    }
    expect(readRecentCommandIds()).toHaveLength(20);
    expect(readRecentCommandIds()[0]).toBe('op:24');
  });

  it('handles malformed recent storage', () => {
    localStorage.setItem(COMMAND_PALETTE_RECENT_STORAGE_KEY, '{broken');
    expect(readRecentCommandIds()).toEqual([]);
  });
});
