// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  coerceConfigValue,
  coerceTextConfigValue,
  type ConfigItem,
} from '../configurationPanelModel';

const item = (overrides: Partial<ConfigItem> = {}): ConfigItem => ({
  key: 'test',
  type: 'string',
  value: '',
  ...overrides,
});

describe('configurationPanelModel', () => {
  it('trims and bounds ordinary text values', () => {
    expect(coerceTextConfigValue(`  ${'a'.repeat(250)}  `)).toBe('a'.repeat(200));
    expect(coerceTextConfigValue(null)).toBe('');
  });

  it.each([
    '<style>{color:red}</style>',
    'url(https://example.com)',
    'expression(alert(1))',
    'javascript:alert(1)',
    'value; color: red',
  ])('rejects unsafe text syntax: %s', (value) => {
    expect(coerceTextConfigValue(value)).toBe('');
  });

  it('coerces and clamps finite numbers', () => {
    const numberItem = item({ type: 'number', value: 10, min: 0, max: 20 });

    expect(coerceConfigValue(numberItem, '15')).toBe(15);
    expect(coerceConfigValue(numberItem, 100)).toBe(20);
    expect(coerceConfigValue(numberItem, Number.NaN)).toBe(10);
    expect(coerceConfigValue(numberItem, Number.POSITIVE_INFINITY)).toBe(10);
  });

  it('ignores non-finite numeric bounds', () => {
    const numberItem = item({
      type: 'number',
      value: 5,
      min: Number.NEGATIVE_INFINITY,
      max: Number.POSITIVE_INFINITY,
    });

    expect(coerceConfigValue(numberItem, 8)).toBe(8);
  });

  it('allows only declared select options', () => {
    const selectItem = item({ type: 'select', value: 'safe', options: ['safe', 'other'] });

    expect(coerceConfigValue(selectItem, 'other')).toBe('other');
    expect(coerceConfigValue(selectItem, 'unknown')).toBe('safe');
    expect(coerceConfigValue(selectItem, null)).toBe('safe');
  });

  it('normalizes boolean values without leaking arbitrary objects', () => {
    const booleanItem = item({ type: 'boolean', value: false });

    expect(coerceConfigValue(booleanItem, 0)).toBe(false);
    expect(coerceConfigValue(booleanItem, 1)).toBe(true);
  });
});
