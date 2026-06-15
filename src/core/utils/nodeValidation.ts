/**
 * 节点数据验证工具
 * 用于确保节点数据中的尺寸与位置是“可用的安全数值”，避免 NaN/Infinity 传播到视图与 MiniMap。
 */

/**
 * 验证并修正节点的 measured 属性
 */
/**
 * 验证并修正节点的 measured 属性
 * - 仅用于尺寸数据：宽高必须为正数
 * - 若缺失则从 `style/width,height` 或默认值创建
 */
export function validateAndFixNodeMeasured(node: any): any {
  if (!node) return node;

  // 如果没有 measured 属性，尝试从 style 或默认值创建
  if (!node.measured) {
    const width = extractValidNumber(node.style?.width || node.width, 200);
    const height = extractValidNumber(node.style?.height || node.height, 100);
    
    node.measured = { width, height };
    return node;
  }

  // 验证并修正 measured 属性中的数值
  const safeWidth = extractValidNumber(node.measured.width, 200);
  const safeHeight = extractValidNumber(node.measured.height, 100);

  node.measured = {
    ...node.measured,
    width: safeWidth,
    height: safeHeight
  };

  return node;
}

/**
 * 批量验证并修正节点数组
 */
export function validateAndFixNodes(nodes: any[]): any[] {
  if (!Array.isArray(nodes)) return [];
  // 使用完整验证，确保 position、style、measured 都是有效数字
  return nodes.map(validateCompleteNode);
}

/**
 * 从任意值中提取“正数”，用于宽高等尺寸场景
 * 注意：此函数不适用于坐标（坐标可为负值）
 */
export function extractValidNumber(value: any, defaultValue: number): number {
  // 如果是有效数字且大于0，直接返回
  if (typeof value === 'number' && !isNaN(value) && isFinite(value) && value > 0) {
    return value;
  }
  
  // 如果是字符串，尝试解析
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  
  // 返回默认值
  return defaultValue;
}

/**
 * 提取“有限数值”（允许负数与 0），用于坐标等可为负的场景
 */
export function extractFiniteNumber(value: any, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

/**
 * 验证节点位置数据
 */
export function validateNodePosition(position: any): { x: number; y: number } {
  return {
    // 允许负坐标，避免非 flow 布局被错误归零导致堆叠
    x: extractFiniteNumber(position?.x, 0),
    y: extractFiniteNumber(position?.y, 0)
  };
}

/**
 * 验证节点样式数据
 */
export function validateNodeStyle(style: any): any {
  if (!style || typeof style !== 'object') {
    return {};
  }

  const validatedStyle = { ...style };
  
  if ('width' in style) {
    // 宽度必须为正数
    validatedStyle.width = extractValidNumber(style.width, 200);
  }
  
  if ('height' in style) {
    // 高度必须为正数
    validatedStyle.height = extractValidNumber(style.height, 100);
  }

  return validatedStyle;
}

/**
 * 完整的节点数据验证
 * - 位置：采用 extractFiniteNumber 允许负坐标
 * - 样式/尺寸：保持为正数
 */
export function validateCompleteNode(node: any): any {
  if (!node) return null;

  const validatedNode = {
    ...node,
    position: validateNodePosition(node.position),
    style: validateNodeStyle(node.style)
  };

  // 确保 measured 属性有效
  return validateAndFixNodeMeasured(validatedNode);
}
