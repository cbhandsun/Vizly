/**
 * 配置验证系统
 * 提供各种配置验证器和数据清理器
 */

export type ConfigValidationResult = true | string;

export interface ConfigValidator<T = unknown> {
  validate: (value: T) => ConfigValidationResult;
  sanitize?: (value: T) => T;
}

export interface ConfigSchema<T = unknown> {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue: T;
  description?: string;
  validator?: ConfigValidator<T>;
  group?: string;
  tags?: string[];
}

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

// 基础验证器
export const validators = {
  /**
   * 字符串验证器
   */
  string: {
    required: (): ConfigValidator<string> => ({
      validate: (value: string) => {
        if (typeof value !== 'string' || value.trim().length === 0) {
          return '字符串不能为空';
        }
        return true;
      },
      sanitize: (value: string) => value.trim()
    }),

    minLength: (min: number): ConfigValidator<string> => ({
      validate: (value: string) => {
        if (typeof value !== 'string' || value.length < min) {
          return `字符串长度不能少于 ${min} 个字符`;
        }
        return true;
      }
    }),

    maxLength: (max: number): ConfigValidator<string> => ({
      validate: (value: string) => {
        if (typeof value !== 'string' || value.length > max) {
          return `字符串长度不能超过 ${max} 个字符`;
        }
        return true;
      }
    }),

    pattern: (regex: RegExp, message?: string): ConfigValidator<string> => ({
      validate: (value: string) => {
        if (typeof value !== 'string' || !regex.test(value)) {
          return message || `字符串格式不正确`;
        }
        return true;
      }
    }),

    oneOf: (options: string[]): ConfigValidator<string> => ({
      validate: (value: string) => {
        if (!options.includes(value)) {
          return `值必须是以下之一: ${options.join(', ')}`;
        }
        return true;
      }
    }),

    color: (): ConfigValidator<string> => ({
      validate: (value: string) => {
        const text = typeof value === 'string' ? value.trim() : '';
        const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        const rgbPattern = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;
        const rgbaPattern = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/;
        
        const rgbMatch = text.match(rgbPattern);
        const rgbaMatch = text.match(rgbaPattern);
        const channels = rgbMatch?.slice(1, 4) || rgbaMatch?.slice(1, 4);
        const validRgb = Boolean(channels && channels.every(channel => Number(channel) >= 0 && Number(channel) <= 255));
        const validAlpha = !rgbaMatch || Number(rgbaMatch[4]) <= 1;

        if (!hexPattern.test(text) && !(validRgb && validAlpha)) {
          return '颜色格式不正确，支持 HEX、RGB、RGBA 格式';
        }
        return true;
      },
      sanitize: (value: string) => value.toLowerCase()
    }),

    url: (): ConfigValidator<string> => ({
      validate: (value: string) => {
        try {
          const parsed = new URL(value);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return 'URL 协议不安全，仅支持 HTTP 或 HTTPS';
          }
          return true;
        } catch {
          return 'URL 格式不正确';
        }
      }
    })
  },

  /**
   * 数字验证器
   */
  number: {
    required: (): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || isNaN(value)) {
          return '必须是有效数字';
        }
        return true;
      }
    }),

    min: (min: number): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || value < min) {
          return `数值不能小于 ${min}`;
        }
        return true;
      }
    }),

    max: (max: number): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || value > max) {
          return `数值不能大于 ${max}`;
        }
        return true;
      }
    }),

    range: (min: number, max: number): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || value < min || value > max) {
          return `数值必须在 ${min} 到 ${max} 之间`;
        }
        return true;
      }
    }),

    integer: (): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          return '必须是整数';
        }
        return true;
      },
      sanitize: (value: number) => Math.round(value)
    }),

    positive: (): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || value <= 0) {
          return '必须是正数';
        }
        return true;
      }
    }),

    percentage: (): ConfigValidator<number> => ({
      validate: (value: number) => {
        if (typeof value !== 'number' || value < 0 || value > 100) {
          return '百分比必须在 0 到 100 之间';
        }
        return true;
      }
    })
  },

  /**
   * 布尔值验证器
   */
  boolean: {
    required: (): ConfigValidator<boolean> => ({
      validate: (value: boolean) => {
        if (typeof value !== 'boolean') {
          return '必须是布尔值';
        }
        return true;
      },
      sanitize: (value: boolean) => Boolean(value)
    })
  },

  /**
   * 对象验证器
   */
  object: {
    required: (): ConfigValidator<object> => ({
      validate: (value: object) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return '必须是对象';
        }
        return true;
      }
    }),

    hasKeys: (keys: string[]): ConfigValidator<PlainObject> => ({
      validate: (value: PlainObject) => {
        if (!isPlainObject(value)) return '必须是对象';
        const missingKeys = keys.filter(key => !(key in value));
        if (missingKeys.length > 0) {
          return `缺少必需的键: ${missingKeys.join(', ')}`;
        }
        return true;
      }
    }),

    shape: (schema: Record<string, ConfigValidator<unknown>>): ConfigValidator<PlainObject> => ({
      validate: (value: PlainObject) => {
        if (!isPlainObject(value)) return '必须是对象';
        const errors: string[] = [];
        
        Object.entries(schema).forEach(([key, validator]) => {
          if (key in value) {
            const result = validator.validate(value[key]);
            if (result !== true) {
              errors.push(`${key}: ${result}`);
            }
          }
        });

        if (errors.length > 0) {
          return errors.join('; ');
        }
        return true;
      },
      sanitize: (value: PlainObject) => {
        if (!isPlainObject(value)) return value;
        const sanitized = { ...value };
        
        Object.entries(schema).forEach(([key, validator]) => {
          if (key in sanitized && validator.sanitize) {
            sanitized[key] = validator.sanitize(sanitized[key]);
          }
        });

        return sanitized;
      }
    })
  },

  /**
   * 数组验证器
   */
  array: {
    required: <T = unknown>(): ConfigValidator<T[]> => ({
      validate: (value: T[]) => {
        if (!Array.isArray(value)) {
          return '必须是数组';
        }
        return true;
      }
    }),

    minLength: <T = unknown>(min: number): ConfigValidator<T[]> => ({
      validate: (value: T[]) => {
        if (!Array.isArray(value) || value.length < min) {
          return `数组长度不能少于 ${min}`;
        }
        return true;
      }
    }),

    maxLength: <T = unknown>(max: number): ConfigValidator<T[]> => ({
      validate: (value: T[]) => {
        if (!Array.isArray(value) || value.length > max) {
          return `数组长度不能超过 ${max}`;
        }
        return true;
      }
    }),

    items: <T = unknown>(itemValidator: ConfigValidator<T>): ConfigValidator<T[]> => ({
      validate: (value: T[]) => {
        if (!Array.isArray(value)) {
          return '必须是数组';
        }

        const errors: string[] = [];
        value.forEach((item, index) => {
          const result = itemValidator.validate(item);
          if (result !== true) {
            errors.push(`[${index}]: ${result}`);
          }
        });

        if (errors.length > 0) {
          return errors.join('; ');
        }
        return true;
      },
      sanitize: (value: T[]) => {
        if (!Array.isArray(value)) return value;
        
        return value.map(item => 
          itemValidator.sanitize ? itemValidator.sanitize(item) : item
        );
      }
    })
  }
};

// 组合验证器
export const combineValidators = <T>(...validators: ConfigValidator<T>[]): ConfigValidator<T> => ({
  validate: (value: T) => {
    for (const validator of validators) {
      const result = validator.validate(value);
      if (result !== true) {
        return result;
      }
    }
    return true;
  },
  sanitize: (value: T) => {
    return validators.reduce((acc, validator) => {
      return validator.sanitize ? validator.sanitize(acc) : acc;
    }, value);
  }
});

// 预定义的配置模式
export const commonSchemas: ConfigSchema[] = [
  // 主题配置
  {
    key: 'theme.mode',
    type: 'string',
    defaultValue: 'light',
    description: '主题模式',
    validator: validators.string.oneOf(['light', 'dark', 'auto']),
    group: 'theme',
    tags: ['ui', 'appearance']
  },
  {
    key: 'theme.primaryColor',
    type: 'string',
    defaultValue: '#1890ff',
    description: '主色调',
    validator: validators.string.color(),
    group: 'theme',
    tags: ['ui', 'color']
  },
  {
    key: 'theme.fontSize',
    type: 'number',
    defaultValue: 14,
    description: '字体大小',
    validator: combineValidators(
      validators.number.required(),
      validators.number.range(10, 24)
    ),
    group: 'theme',
    tags: ['ui', 'typography']
  },

  // 布局配置
  {
    key: 'layout.spacing.node',
    type: 'number',
    defaultValue: 100,
    description: '节点间距',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(500)
    ),
    group: 'layout',
    tags: ['layout', 'spacing']
  },
  {
    key: 'layout.spacing.level',
    type: 'number',
    defaultValue: 150,
    description: '层级间距',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(500)
    ),
    group: 'layout',
    tags: ['layout', 'spacing']
  },
  {
    key: 'layout.spacing.domain',
    type: 'number',
    defaultValue: 200,
    description: '域间距',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(500)
    ),
    group: 'layout',
    tags: ['layout', 'spacing']
  },

  // 性能配置
  {
    key: 'performance.enableVirtualization',
    type: 'boolean',
    defaultValue: true,
    description: '启用虚拟化渲染',
    validator: validators.boolean.required(),
    group: 'performance',
    tags: ['performance', 'optimization']
  },
  {
    key: 'performance.maxNodes',
    type: 'number',
    defaultValue: 1000,
    description: '最大节点数',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(10000)
    ),
    group: 'performance',
    tags: ['performance', 'limits']
  },
  {
    key: 'performance.batchSize',
    type: 'number',
    defaultValue: 50,
    description: '批处理大小',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(200)
    ),
    group: 'performance',
    tags: ['performance', 'batch']
  },

  // 导出配置
  {
    key: 'export.defaultFormat',
    type: 'string',
    defaultValue: 'png',
    description: '默认导出格式',
    validator: validators.string.oneOf(['png', 'jpg', 'svg', 'pdf']),
    group: 'export',
    tags: ['export', 'format']
  },
  {
    key: 'export.quality',
    type: 'number',
    defaultValue: 1.0,
    description: '导出质量',
    validator: combineValidators(
      validators.number.required(),
      validators.number.range(0.1, 3.0)
    ),
    group: 'export',
    tags: ['export', 'quality']
  },

  // 画布配置
  {
    key: 'canvas.background',
    type: 'string',
    defaultValue: '#ffffff',
    description: '画布背景色',
    validator: validators.string.color(),
    group: 'canvas',
    tags: ['canvas', 'appearance']
  },
  {
    key: 'canvas.grid.enabled',
    type: 'boolean',
    defaultValue: true,
    description: '启用网格',
    validator: validators.boolean.required(),
    group: 'canvas',
    tags: ['canvas', 'grid']
  },
  {
    key: 'canvas.grid.size',
    type: 'number',
    defaultValue: 20,
    description: '网格大小',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(100)
    ),
    group: 'canvas',
    tags: ['canvas', 'grid']
  },
  {
    key: 'canvas.zoom.min',
    type: 'number',
    defaultValue: 0.1,
    description: '最小缩放比例',
    validator: combineValidators(
      validators.number.required(),
      validators.number.positive(),
      validators.number.max(1)
    ),
    group: 'canvas',
    tags: ['canvas', 'zoom']
  },
  {
    key: 'canvas.zoom.max',
    type: 'number',
    defaultValue: 4,
    description: '最大缩放比例',
    validator: combineValidators(
      validators.number.required(),
      validators.number.min(1),
      validators.number.max(10)
    ),
    group: 'canvas',
    tags: ['canvas', 'zoom']
  },

  // 开发配置
  {
    key: 'dev.enableDebugMode',
    type: 'boolean',
    defaultValue: false,
    description: '启用调试模式',
    validator: validators.boolean.required(),
    group: 'development',
    tags: ['development', 'debug']
  },
  {
    key: 'dev.showPerformanceMetrics',
    type: 'boolean',
    defaultValue: false,
    description: '显示性能指标',
    validator: validators.boolean.required(),
    group: 'development',
    tags: ['development', 'performance']
  }
];

// 配置验证工具函数
export const validateConfigValue = <T>(
  key: string, 
  value: T, 
  schemas: ConfigSchema[] = commonSchemas
): { isValid: boolean; error?: string; sanitizedValue?: T } => {
  const schema = schemas.find(s => s.key === key);
  if (!schema?.validator) {
    return { isValid: true, sanitizedValue: value };
  }

  const validationResult = schema.validator.validate(value);
  if (validationResult !== true) {
    return { isValid: false, error: typeof validationResult === 'string' ? validationResult : '验证失败' };
  }

  const sanitizedValue = schema.validator.sanitize 
    ? schema.validator.sanitize(value) 
    : value;

  return { isValid: true, sanitizedValue };
};

// 批量验证配置
export const validateConfigBatch = (
  configs: Record<string, unknown>,
  schemas: ConfigSchema[] = commonSchemas
): { isValid: boolean; errors: Record<string, string>; sanitizedConfigs: Record<string, unknown> } => {
  const errors: Record<string, string> = {};
  const sanitizedConfigs: Record<string, unknown> = {};

  Object.entries(configs).forEach(([key, value]) => {
    const result = validateConfigValue(key, value, schemas);
    if (!result.isValid) {
      errors[key] = result.error!;
    } else {
      sanitizedConfigs[key] = result.sanitizedValue;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    sanitizedConfigs
  };
};
