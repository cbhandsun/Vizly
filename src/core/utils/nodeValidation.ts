/**
 * 节点数据验证工具
 * 用于确保节点数据中的尺寸与位置是“可用的安全数值”，避免 NaN/Infinity 传播到视图与 MiniMap。
 */

type SafeRecord = Record<string, unknown>;
type ValidatedNodeFields = {
  position: { x: number; y: number };
  style: SafeRecord;
  measured: SafeRecord & { width: number; height: number };
};

const isRecord = (value: unknown): value is SafeRecord => (
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  )
);

/** 从任意值中提取正数，用于宽高等尺寸。 */
export function extractValidNumber(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return defaultValue;
}

/** 提取有限数值（允许负数与 0），用于坐标。 */
export function extractFiniteNumber(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultValue;
}

export function validateNodePosition(position: unknown): { x: number; y: number } {
  const record = isRecord(position) ? position : {};
  return {
    x: extractFiniteNumber(record.x, 0),
    y: extractFiniteNumber(record.y, 0),
  };
}

export function validateNodeStyle(style: unknown): SafeRecord {
  if (!isRecord(style)) return {};
  const validatedStyle: SafeRecord = { ...style };
  if ('width' in style) validatedStyle.width = extractValidNumber(style.width, 200);
  if ('height' in style) validatedStyle.height = extractValidNumber(style.height, 100);
  return validatedStyle;
}

export function validateAndFixNodeMeasured<T extends object>(node: T): T & { measured: ValidatedNodeFields['measured'] };
export function validateAndFixNodeMeasured(node: null): null;
export function validateAndFixNodeMeasured(node: undefined): undefined;
export function validateAndFixNodeMeasured(node: unknown): unknown {
  if (node == null) return node;
  if (!isRecord(node)) return null;

  const style = isRecord(node.style) ? node.style : {};
  const measuredValue = node.measured;
  const hasMeasured = isRecord(measuredValue);
  const measured: SafeRecord = isRecord(measuredValue) ? measuredValue : {};
  const width = extractValidNumber(
    measured.width,
    hasMeasured ? 200 : extractValidNumber(style.width ?? node.width, 200),
  );
  const height = extractValidNumber(
    measured.height,
    hasMeasured ? 100 : extractValidNumber(style.height ?? node.height, 100),
  );

  return {
    ...node,
    measured: { ...measured, width, height },
  };
}

export function validateCompleteNode<T extends object>(node: T): T & ValidatedNodeFields;
export function validateCompleteNode(node: null): null;
export function validateCompleteNode(node: undefined): undefined;
export function validateCompleteNode(node: unknown): unknown {
  if (node == null) return node;
  if (!isRecord(node)) return null;
  const validatedNode = {
    ...node,
    position: validateNodePosition(node.position),
    style: validateNodeStyle(node.style),
  };
  return validateAndFixNodeMeasured(validatedNode);
}

export function validateAndFixNodes<T extends object>(nodes: T[]): Array<T & ValidatedNodeFields>;
export function validateAndFixNodes(nodes: unknown): SafeRecord[];
export function validateAndFixNodes(nodes: unknown): SafeRecord[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map(node => validateCompleteNode(node))
    .filter(isRecord) as SafeRecord[];
}
