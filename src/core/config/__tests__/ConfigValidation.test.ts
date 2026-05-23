import { describe, expect, it } from 'vitest';
import {
  combineValidators,
  validateConfigBatch,
  validateConfigValue,
  validators,
  type ConfigSchema,
} from '../ConfigValidation';

describe('ConfigValidation validators', () => {
  it('validates and sanitizes strings', () => {
    const required = validators.string.required();
    const color = validators.string.color();
    const url = validators.string.url();

    expect(required.validate('  name  ')).toBe(true);
    expect(required.sanitize?.('  name  ')).toBe('name');
    expect(required.validate('   ')).toBe('字符串不能为空');
    expect(validators.string.minLength(3).validate('ab')).toBe('字符串长度不能少于 3 个字符');
    expect(validators.string.maxLength(3).validate('abcd')).toBe('字符串长度不能超过 3 个字符');
    expect(validators.string.pattern(/^viz/).validate('vizly')).toBe(true);
    expect(validators.string.pattern(/^viz/, 'bad prefix').validate('ly')).toBe('bad prefix');
    expect(validators.string.oneOf(['light', 'dark']).validate('auto')).toBe('值必须是以下之一: light, dark');
    expect(color.validate('#ABC')).toBe(true);
    expect(color.validate('rgb(1, 2, 3)')).toBe(true);
    expect(color.validate('not-color')).toBe('颜色格式不正确，支持 HEX、RGB、RGBA 格式');
    expect(color.sanitize?.('#ABCDEF')).toBe('#abcdef');
    expect(url.validate('https://example.com')).toBe(true);
    expect(url.validate('nope')).toBe('URL 格式不正确');
  });

  it('validates and sanitizes numbers', () => {
    expect(validators.number.required().validate(Number.NaN)).toBe('必须是有效数字');
    expect(validators.number.min(2).validate(1)).toBe('数值不能小于 2');
    expect(validators.number.max(2).validate(3)).toBe('数值不能大于 2');
    expect(validators.number.range(1, 3).validate(4)).toBe('数值必须在 1 到 3 之间');
    expect(validators.number.integer().validate(1.2)).toBe('必须是整数');
    expect(validators.number.integer().sanitize?.(1.6)).toBe(2);
    expect(validators.number.positive().validate(0)).toBe('必须是正数');
    expect(validators.number.percentage().validate(101)).toBe('百分比必须在 0 到 100 之间');
  });

  it('validates booleans, objects, and arrays', () => {
    expect(validators.boolean.required().validate(false)).toBe(true);
    expect(validators.boolean.required().validate('true' as never)).toBe('必须是布尔值');
    expect(validators.boolean.required().sanitize?.('non-empty' as never)).toBe(true);

    expect(validators.object.required().validate({})).toBe(true);
    expect(validators.object.required().validate([] as never)).toBe('必须是对象');
    expect(validators.object.hasKeys(['id', 'name']).validate({ id: 1 })).toBe('缺少必需的键: name');

    const shape = validators.object.shape({
      name: validators.string.required(),
      count: validators.number.integer(),
    });
    expect(shape.validate({ name: 'ok', count: 2 })).toBe(true);
    expect(shape.validate({ name: '', count: 1.2 })).toBe('name: 字符串不能为空; count: 必须是整数');
    expect(shape.sanitize?.({ name: '  ok  ', count: 1.6 })).toEqual({ name: 'ok', count: 2 });

    expect(validators.array.required().validate([])).toBe(true);
    expect(validators.array.required().validate({} as never)).toBe('必须是数组');
    expect(validators.array.minLength(2).validate([1])).toBe('数组长度不能少于 2');
    expect(validators.array.maxLength(1).validate([1, 2])).toBe('数组长度不能超过 1');
    expect(validators.array.items(validators.number.integer()).validate([1, 2.5])).toBe('[1]: 必须是整数');
    expect(validators.array.items(validators.number.integer()).sanitize?.([1.2, 2.8])).toEqual([1, 3]);
  });

  it('combines validators and applies sanitizers in order', () => {
    const validator = combineValidators(
      validators.string.required(),
      validators.string.maxLength(5),
    );

    expect(validator.validate(' ok ')).toBe(true);
    expect(validator.validate('toolong')).toBe('字符串长度不能超过 5 个字符');
    expect(validator.sanitize?.(' ok ')).toBe('ok');
  });
});

describe('ConfigValidation helpers', () => {
  const schemas: ConfigSchema[] = [
    {
      key: 'name',
      type: 'string',
      defaultValue: 'vizly',
      description: 'Name',
      validator: validators.string.required(),
    },
    {
      key: 'size',
      type: 'number',
      defaultValue: 10,
      description: 'Size',
      validator: validators.number.range(1, 20),
    },
  ];

  it('validates individual config values and preserves unknown keys', () => {
    expect(validateConfigValue('name', '  Vizly  ', schemas)).toEqual({
      isValid: true,
      sanitizedValue: 'Vizly',
    });
    expect(validateConfigValue('size', 30, schemas)).toEqual({
      isValid: false,
      error: '数值必须在 1 到 20 之间',
    });
    expect(validateConfigValue('unknown', 'value', schemas)).toEqual({
      isValid: true,
      sanitizedValue: 'value',
    });
  });

  it('validates config batches and separates errors from sanitized values', () => {
    expect(validateConfigBatch({ name: '  Vizly  ', size: 99, extra: true }, schemas)).toEqual({
      isValid: false,
      errors: { size: '数值必须在 1 到 20 之间' },
      sanitizedConfigs: { name: 'Vizly', extra: true },
    });
  });
});
