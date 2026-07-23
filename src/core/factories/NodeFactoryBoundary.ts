import { cloneConfigValue, isPlainConfigObject } from '../config/ConfigValueBoundary';
import type { NodeConfig, NodeValidationResult } from './NodeFactoryTypes';

const MAX_NODE_ID_CHARS = 1024;
const MAX_DESCRIPTION_CHARS = 64 * 1024;
const MAX_COORDINATE_ABS = 10_000_000;
const MAX_NODE_DIMENSION = 100_000;

const isFiniteBoundedNumber = (value: unknown, maxAbs: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= maxAbs;

/** 验证进入 React Flow node 模型的基础字段和极端值。 */
export const validateNodeConfig = (value: unknown): NodeValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainConfigObject(value)) {
    return { isValid: false, errors: ['节点配置必须是对象'], warnings };
  }

  if (typeof value.id !== 'string' || value.id.trim().length === 0) {
    errors.push('节点ID不能为空');
  } else if (value.id.length > MAX_NODE_ID_CHARS) {
    errors.push('节点ID超过长度限制');
  } else if (!/^[a-zA-Z0-9_-]+$/.test(value.id)) {
    warnings.push('节点ID建议只包含字母、数字、下划线和连字符');
  }

  if (typeof value.description !== 'string' || value.description.trim().length === 0) {
    errors.push('节点描述不能为空');
  } else if (value.description.length > MAX_DESCRIPTION_CHARS) {
    errors.push('节点描述超过长度限制');
  }

  if (!isPlainConfigObject(value.position)) {
    errors.push('节点位置不能为空');
  } else if (
    !isFiniteBoundedNumber(value.position.x, MAX_COORDINATE_ABS) ||
    !isFiniteBoundedNumber(value.position.y, MAX_COORDINATE_ABS)
  ) {
    errors.push('节点位置必须是范围有效的有限数字');
  }

  (['width', 'height'] as const).forEach(key => {
    const dimension = value[key];
    if (dimension !== undefined && (
      !isFiniteBoundedNumber(dimension, MAX_NODE_DIMENSION) || dimension <= 0
    )) {
      errors.push(`节点${key === 'width' ? '宽度' : '高度'}必须是有效正数`);
    }
  });
  if (typeof value.width === 'number' && value.width < 50) {
    warnings.push('节点宽度过小，可能影响显示效果');
  }
  if (typeof value.height === 'number' && value.height < 30) {
    warnings.push('节点高度过小，可能影响显示效果');
  }
  if (value.zIndex !== undefined && !isFiniteBoundedNumber(value.zIndex, 1_000_000)) {
    errors.push('zIndex必须是范围有效的有限数字');
  } else if (typeof value.zIndex === 'number' && value.zIndex < 0) {
    warnings.push('负的zIndex可能导致节点被其他元素遮挡');
  }
  if (value.draggable !== undefined && typeof value.draggable !== 'boolean') {
    errors.push('draggable必须是布尔值');
  }
  ['domainClass', 'domain', 'subDomain', 'parentId', 'shape'].forEach(key => {
    if (value[key] !== undefined && (
      typeof value[key] !== 'string' || (value[key] as string).length > 4096
    )) {
      errors.push(`${key}必须是长度不超过4096的字符串`);
    }
  });
  ['style', 'data', 'metadata'].forEach(key => {
    if (value[key] !== undefined && !isPlainConfigObject(value[key])) {
      errors.push(`${key}必须是普通对象`);
    }
  });

  return { isValid: errors.length === 0, errors, warnings };
};

const cloneNodeRecord = <T extends object>(record: T): T => {
  const owned: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, nestedValue]) => {
    if (nestedValue !== undefined) {
      owned[key] = cloneConfigValue(nestedValue);
    }
  });
  return owned as T;
};

/** 获取 NodeFactory 输入中所有可变记录的所有权。 */
export const ownNodeConfigRecords = <T extends NodeConfig>(config: T): T => ({
  ...config,
  position: { ...config.position },
  ...(config.style ? { style: cloneNodeRecord(config.style) } : {}),
  ...(config.data ? { data: cloneNodeRecord(config.data) } : {}),
  ...(config.metadata ? { metadata: cloneNodeRecord(config.metadata) } : {})
}) as T;
