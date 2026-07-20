import { describe, expect, it } from 'vitest';
import { createNestedConfigPatch } from '../ConfigValueBoundary';

describe('createNestedConfigPatch', () => {
  it('preserves the full leaf path for layered configuration events', () => {
    expect(createNestedConfigPatch(['padding', 'horizontal'], 24)).toEqual({
      padding: { horizontal: 24 },
    });
    expect(createNestedConfigPatch(['font', 'size'], 14)).toEqual({
      font: { size: 14 },
    });
  });

  it('passes a bounded root value through when the event targets a category', () => {
    expect(createNestedConfigPatch([], { padding: { horizontal: 24 } })).toEqual({
      padding: { horizontal: 24 },
    });
  });

  it('rejects dangerous, malformed, and excessively deep paths', () => {
    expect(() => createNestedConfigPatch(['__proto__'], 'polluted')).toThrow('非法字段');
    expect(() => createNestedConfigPatch(['padding', 'bad.path'], 1)).toThrow('非法字段');
    expect(() => createNestedConfigPatch(Array.from({ length: 9 }, () => 'nested'), 1)).toThrow(
      '嵌套过深',
    );
  });

  it('sanitizes non-finite and non-serializable leaf values', () => {
    expect(() => createNestedConfigPatch(['value'], Number.POSITIVE_INFINITY)).toThrow('有限值');
    expect(() => createNestedConfigPatch(['value'], new Date())).toThrow('可序列化对象');
  });
});
