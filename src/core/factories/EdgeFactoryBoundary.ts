import { cloneConfigValue, isPlainConfigObject } from '../config/ConfigValueBoundary';
import { EdgeType } from '../types/edgeType';
import { EdgeStyleType, type EdgeValidationResult } from './EdgeFactoryTypes';

const MAX_EDGE_ID_CHARS = 1024;
const MAX_HANDLE_ID_CHARS = 128;
const MAX_STROKE_WIDTH = 1000;

const validateEndpointId = (
  value: unknown,
  label: string,
  errors: string[]
): void => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label}节点ID不能为空`);
    return;
  }
  if (value.length > MAX_EDGE_ID_CHARS) {
    errors.push(`${label}节点ID超过长度限制`);
  }
};

/** 验证所有会进入 React Flow edge 模型的基础字段。 */
export const validateEdgeConfig = (value: unknown): EdgeValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainConfigObject(value)) {
    return { isValid: false, errors: ['边缘配置必须是对象'], warnings };
  }

  validateEndpointId(value.source, '源', errors);
  validateEndpointId(value.target, '目标', errors);

  if (typeof value.source === 'string' && value.source === value.target) {
    warnings.push('检测到自环连接，可能不是预期行为');
  }
  if (value.id !== undefined) {
    if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > MAX_EDGE_ID_CHARS) {
      errors.push('边缘ID无效或超过长度限制');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(value.id)) {
      warnings.push('边缘ID建议只包含字母、数字、下划线和连字符');
    }
  }
  if (value.strokeWidth !== undefined && (
    typeof value.strokeWidth !== 'number' || !Number.isFinite(value.strokeWidth)
  )) {
    errors.push('线条宽度必须是有限数值');
  } else if (typeof value.strokeWidth === 'number' && value.strokeWidth <= 0) {
    errors.push('线条宽度必须大于0');
  } else if (typeof value.strokeWidth === 'number' && value.strokeWidth > MAX_STROKE_WIDTH) {
    errors.push('线条宽度不能超过1000');
  }
  if (value.strokeColor !== undefined && typeof value.strokeColor !== 'string') {
    errors.push('线条颜色必须是字符串');
  } else if (typeof value.strokeColor === 'string') {
    if (value.strokeColor.length > 128) {
      errors.push('线条颜色超过长度限制');
    } else if (!/^#[0-9A-Fa-f]{6}$/.test(value.strokeColor)) {
      warnings.push('颜色格式建议使用十六进制格式（如 #FF0000）');
    }
  }
  if (value.strokeDasharray !== undefined && (
    typeof value.strokeDasharray !== 'string' || value.strokeDasharray.length > 256
  )) {
    errors.push('虚线样式必须是长度不超过256的字符串');
  }
  ['sourceHandle', 'targetHandle'].forEach(key => {
    const handle = value[key];
    if (handle !== undefined && handle !== null && (
      typeof handle !== 'string' || handle.length > MAX_HANDLE_ID_CHARS
    )) {
      errors.push(`${key}必须是长度不超过128的字符串或null`);
    }
  });
  ['style', 'data'].forEach(key => {
    if (value[key] !== undefined && !isPlainConfigObject(value[key])) {
      errors.push(`${key}必须是普通对象`);
    }
  });
  if (value.type !== undefined && !Object.values(EdgeType).includes(value.type as EdgeType)) {
    errors.push('边缘类型无效');
  }
  if (value.styleType !== undefined && !Object.values(EdgeStyleType).includes(value.styleType as EdgeStyleType)) {
    errors.push('边缘样式类型无效');
  }
  ['animated', 'markerEnd', 'markerStart'].forEach(key => {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') {
      errors.push(`${key}必须是布尔值`);
    }
  });

  return { isValid: errors.length === 0, errors, warnings };
};

const cloneEdgeRecord = (record: Record<string, unknown>): Record<string, unknown> => {
  const owned: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (value !== undefined) {
      owned[key] = cloneConfigValue(value);
    }
  });
  return owned;
};

/** 克隆可变的 style/data，忽略 React Flow 内部生成的顶层 undefined。 */
export const ownEdgeConfigRecords = <T extends object>(config: T): T => {
  const record = config as T & { style?: unknown; data?: unknown };
  if (record.style !== undefined && !isPlainConfigObject(record.style)) {
    throw new Error('style必须是普通对象');
  }
  if (record.data !== undefined && !isPlainConfigObject(record.data)) {
    throw new Error('data必须是普通对象');
  }
  return {
    ...record,
    ...(isPlainConfigObject(record.style) ? { style: cloneEdgeRecord(record.style) } : {}),
    ...(isPlainConfigObject(record.data) ? { data: cloneEdgeRecord(record.data) } : {})
  } as T;
};

/** 将历史 handle 别名规范化为节点实际注册的四个 handle。 */
export const normalizeEdgeHandleId = (handle: string | null | undefined): string | null => {
  if (handle === null || handle === undefined) return null;
  if (typeof handle !== 'string' || handle.length > MAX_HANDLE_ID_CHARS) return null;
  const raw = handle.trim().toLowerCase();
  const map: Record<string, string> = {
    t: 'top', top: 'top', up: 'top', north: 'top', upper: 'top',
    b: 'bottom', bottom: 'bottom', down: 'bottom', south: 'bottom', lower: 'bottom',
    l: 'left', left: 'left', west: 'left',
    r: 'right', right: 'right', east: 'right'
  };
  if (map[raw]) return map[raw];

  const tokens = raw.split(/[-_\s]/g).filter(Boolean);
  for (const token of tokens) {
    if (map[token]) return map[token];
  }
  const compact = raw.replace(/[^a-z]/g, '');
  if (compact.length === 2) {
    return map[compact[0]] || map[compact[1]] || null;
  }
  return null;
};
