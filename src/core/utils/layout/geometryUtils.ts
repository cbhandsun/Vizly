import type { Node as ReactFlowNode } from '@xyflow/react';
import type { Position, Rectangle } from '../../types/common';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { LayoutOptimizer } from '../../components/layout/LayoutOptimizer';

/**
 * @file 统一布局工具函数
 * @description 整合所有图表的布局计算逻辑，避免重复代码
 */

const GROUP_NODE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const finiteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const sortableNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string' || value.trim() === '') return Number.NaN;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const nodeData = (node: ReactFlowNode): Record<string, unknown> => (
  isRecord(node.data) ? node.data : {}
);

const nodeDomain = (node: ReactFlowNode): string => {
  const domain = nodeData(node).domain;
  return typeof domain === 'string' ? domain.trim() : '';
};

const nodePosition = (node: ReactFlowNode): Position => ({
  x: finiteNumber(node.position?.x, 0),
  y: finiteNumber(node.position?.y, 0),
});

const nodeWidth = (node: ReactFlowNode, fallback = 0): number => (
  finiteNumber(node.measured?.width ?? node.style?.width ?? node.width, fallback)
);

const nodeHeight = (node: ReactFlowNode, fallback = 0): number => (
  finiteNumber(node.measured?.height ?? node.style?.height ?? node.height, fallback)
);

/**
 * 辅助函数：行内节点排序（语义优先）
 * 优先级：data.sequence > data.order > x 坐标 (从左到右)
 */
export const sortNodesInRow = (nodes: ReactFlowNode[]): ReactFlowNode[] => {
  return nodes.sort((a, b) => {
    const dataA = nodeData(a);
    const dataB = nodeData(b);
    const seqA = sortableNumber(dataA.sequence ?? dataA.order);
    const seqB = sortableNumber(dataB.sequence ?? dataB.order);
    const hasSeqA = Number.isFinite(seqA);
    const hasSeqB = Number.isFinite(seqB);

    if (hasSeqA && hasSeqB) {
      return seqA - seqB;
    }
    if (hasSeqA && !hasSeqB) return -1;
    if (!hasSeqA && hasSeqB) return 1;

    // Fallback to X position (left to right)
    const ax = (a.position?.x ?? 0);
    const bx = (b.position?.x ?? 0);
    return ax - bx;
  });
};

/**
 * 计算网格布局
 * @param items 要布局的元素数组
 * @param options 布局选项
 * @returns 每个元素的位置数组
 */






// 检测线段是否与矩形相交
function _isLineIntersectingRect(
  start: Position,
  end: Position,
  rect: Rectangle
): boolean {
  // 简化的线段与矩形相交检测
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  return !(
    maxX < rect.x ||
    minX > rect.x + rect.width ||
    maxY < rect.y ||
    minY > rect.y + rect.height
  );
}





/**
 * 应用子域分组
 * @param nodes 节点列表
 * @param config 图表配置管理器
 * @returns 应用分组后的节点列表
 */
/**
 * 应用子域分组（函数级注释）
 * - 按 `node.data.subDomain` 聚合并为每个子域创建 `subGroup` 容器
 * - 可选 `whitelist` 只为指定子域生成容器，其他子域跳过
 * - 初始 children 直接按子域做合并设置，避免在布局前用几何包含导致误归属
 */

/**
 * 函数级注释：确保业务节点 measured 就绪
 * 目标：为所有非容器节点补齐 `measured.width/height` 与 `style.width/height`，容器节点保持已有 `style/measured` 一致。
 * 规则：
 * - 非容器节点：优先读取 `data.description`，否则用 `label`；宽高使用 LayoutOptimizer 同步计算；
 * - 容器节点：若 `measured` 缺失，使用 `style.width/height` 或已知尺寸回填；
 * - 写回：`style.width/height` 与 `measured` 保持一致，方便后续布局与投影。
*/
export const ensureMeasuredForNodes = (
  nodes: ReactFlowNode[]
): ReactFlowNode[] => {
  const layoutCfg = diagramConfigManager.getLayoutConfig();
  const minW = finiteNumber(layoutCfg.NODE_MIN_WIDTH, 120);
  const opt = LayoutOptimizer.getInstance();
  const updated = nodes.map(n => ({
    ...n,
    ...(n.style ? { style: { ...n.style } } : {}),
    ...(n.measured ? { measured: { ...n.measured } } : {}),
  }));
  for (let i = 0; i < updated.length; i++) {
    const n = updated[i];
    const tp = String(n.type || '');
    if (GROUP_NODE_TYPES.has(tp)) {
      const w = nodeWidth(n);
      const h = nodeHeight(n);
      n.measured = { width: w, height: h };
      if (!n.style) n.style = {};
      if (finiteNumber(n.style.width, 0) <= 0) n.style.width = w;
      if (finiteNumber(n.style.height, 0) <= 0) n.style.height = h;
      continue;
    }
    const data = nodeData(n);
    const desc = String(data.description ?? data.label ?? '').trim();
    const wCalc = opt.calculateNodeWidth(desc);
    const hCalc = opt.calculateNodeHeight(desc);
    const w = Math.max(minW, finiteNumber(wCalc, minW));
    const h = Math.max(24, finiteNumber(hCalc, 60));
    if (!n.style) n.style = {};
    n.style.width = w; n.style.height = h;
    n.measured = { width: w, height: h };
  }
  return updated;
};

/**
 * 函数级注释：语义净化子域 children
 * 目的：过滤每个子域容器的 children，保留 `subDomain` 与容器键一致的业务节点（可选校验同域），降低误归属风险。
 */

/**
 * 计算边界框
 * @param nodes 节点列表
 * @returns 边界矩形
 */
export const calculateBoundingBox = (nodes: ReactFlowNode[]): Rectangle => {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const { x, y } = nodePosition(node);
    const wBase = nodeWidth(node);
    const hBase = nodeHeight(node);
    const customStyleValue = nodeData(node).customStyle;
    const customStyle = isRecord(customStyleValue) ? customStyleValue : {};
    const borderRaw = String(customStyle.border ?? node.style?.border ?? '');
    const borderPxMatch = /([0-9]*\.?[0-9]+)px/i.exec(borderRaw);
    const borderW = borderPxMatch ? Math.max(0, Number(borderPxMatch[1])) : 0;
    const extraW = borderW * 2;
    const extraH = borderW * 2;
    const w = Math.max(0, wBase + extraW);
    const h = Math.max(0, hBase + extraH);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

/**
 * 函数级注释：应用域分组（TitleGroup）
 * - 依据节点的 `data.domain` 将节点按域分组，计算包围框并创建域容器节点；
 * - 标题来源统一使用域键（即 domain 值），避免分组标识不一致；
 * - 若同域已存在 `titleGroup` 节点，则跳过重复创建；
 * - 尺寸计算遵循 DiagramConfig.domain 的水平/垂直内边距、标题高度与安全留白配置。
 */
/**
 * 应用域分组（支持白名单）
 * 函数级注释：当提供 `whitelist` 时，仅为白名单中的域创建 titleGroup，否则为全部域创建。
 */

/**
 * 函数级注释：同点坐标散列（节点级）
 * - 目的：当一组节点的 position 出现多个完全相同坐标时，沿指定轴按最小间距均匀展开；
 * - 适用：ELK layered 或其他分层算法输出造成的“一对多/多对一”同点重叠；
 * - 参数：`axis` 为 'x' 或 'y'；`gap` 为散列步长；`tolerance` 为坐标聚类容差。
*/
export const scatterNodesAtSamePoint = (
  list: ReactFlowNode[],
  axis: 'x' | 'y',
  gap: number,
  tolerance: number = 2
): void => {
  const tol = Math.max(1, Math.floor(finiteNumber(tolerance, 2)));
  const keyOf = (p: { x: number; y: number }) => `${Math.round(p.x / tol)}:${Math.round(p.y / tol)}`;
  const buckets = new Map<string, ReactFlowNode[]>();
  for (const n of list) {
    const p = nodePosition(n);
    const k = keyOf(p);
    const arr = buckets.get(k) || [];
    arr.push(n); buckets.set(k, arr);
  }
  const step = Math.max(12, Math.floor(finiteNumber(gap, 12)));
  for (const [, arr] of buckets.entries()) {
    if (arr.length <= 1) continue;
    const pivot = nodePosition(arr[0]);
    const half = Math.floor(arr.length / 2);
    const ordered = arr.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    for (let i = 0; i < ordered.length; i++) {
      const offset = (i - half) * step;
      if (axis === 'x') {
        const ny = Math.round(nodePosition(ordered[i]).y);
        const nx = Math.round(pivot.x + offset);
        ordered[i].position = { x: nx, y: ny };
      } else {
        const nx = Math.round(nodePosition(ordered[i]).x);
        const ny = Math.round(pivot.y + offset);
        ordered[i].position = { x: nx, y: ny };
      }
    }
  }
};

/**
 * 璁＄畻鐭╁舰闆嗗悎鐨勭浉浜ゅ鏁帮紙鍑芥暟绾ф敞閲婏級
 * 用于迭代收敛判断：返回两个相邻的数量差
 */

/**
 * 璁＄畻鐭╁舰闆嗗悎鐨勭浉浜ゅ鏁帮紙鍑芥暟绾ф敞閲婏級
 * 用于迭代收敛判断：返回两个相邻的数量差
 */
export const countRectOverlaps = (
  rects: Array<{ x: number; y: number; width: number; height: number }>
): number => {
  let count = 0;
  for (let i = 0; i < rects.length; i++) {
    const a = rects[i];
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      const disjoint = a.x >= b.x + b.width || a.x + a.width <= b.x || a.y >= b.y + b.height || a.y + a.height <= b.y;
      if (!disjoint) count++;
    }
  }
  return count;
};

/**
 * 函数级注释：统计域下子域容器的重叠数量
 */

/**
 * 函数级注释：统计域内业务节点之间的重叠数量
 */
export const countNodeOverlapsByDomain = (
  nodes: ReactFlowNode[]
): number => {
  const EXCLUDE = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  let total = 0;
  const domainsSet = new Set<string>();
  for (const n of nodes) {
    const d = nodeDomain(n);
    if (d) domainsSet.add(d);
  }
  const domains = Array.from(domainsSet);
  for (const d of domains) {
    const biz = nodes.filter(n => !EXCLUDE.has(String(n.type || '')) && nodeDomain(n) === d);
    const rects = biz.map(n => ({
      ...nodePosition(n),
      width: nodeWidth(n, 240),
      height: nodeHeight(n, 120),
    }));
    total += countRectOverlaps(rects);
  }
  return total;
};

/**
 * 函数级注释：子域容器间距统一
 * 目标：在同一域内，将可见的子域容器按行分组后统一行间距，并将每行统一纵向间距的打包应用到 children 以保持同步。
 */

/**
 * 灏嗗煙鍐呯殑鑷敱鑺傜偣涓嬫帹鍒板瓙鍩熻涔嬩笅
 * - 瀵规瘡涓煙锛岃绠楄鍩熷唴鎵€鏈夊瓙鍩熷鍣ㄧ殑鏈€澶у簳杈癸紱
 * - 灏嗗悓鍩熺殑鏅€氫笟鍔¤妭鐐圭殑 y 鍧愭爣閽冲埗鍒扳€滄渶澶у簳杈?+ 鍨傜洿闂磋窛鈥濓紝閬垮厤涓庡瓙鍩熸í鎺掑甫鍙戠敓閲嶅彔銆?
 */
export const pushFreeNodesBelowSubGroupRow = (nodes: ReactFlowNode[]): ReactFlowNode[] => {
  const updated = nodes.map(n => ({ ...n }));
  const cfgFull = diagramConfigManager.getConfig();
  const cfgLayout = diagramConfigManager.getLayoutConfig();
  const padH = finiteNumber(cfgFull.domain.padding.horizontal, 24);
  const titleH = finiteNumber(cfgFull.domain.title.height, 40);
  const titleV = finiteNumber(cfgFull.domain.title.padding.vertical, 12);
  const titleSafe = finiteNumber(cfgFull.domain.title.safeGap, 16);
  const sideSafe = Math.max(0, finiteNumber(cfgFull.domain.sideSafeGap, 8));
  const vGap = finiteNumber(cfgLayout.NODE_V_GAP, 80);

  const domains = updated.filter(n => String(n.type || '') === 'titleGroup');
  for (const tg of domains) {
    const dId = nodeDomain(tg);
    if (!dId) continue;
    const { x: tx, y: ty } = nodePosition(tg);
    const tw = nodeWidth(tg);
    const innerLeft = tx + padH + sideSafe;
    const innerRight = tx + Math.max(0, tw) - padH - sideSafe;
    const innerTop = ty + titleH + titleV + titleSafe;
    const sgs = updated.filter(n => String(n.type || '') === 'subGroup' && nodeDomain(n) === dId);
    let maxBottom = innerTop;
    for (const sg of sgs) {
      const sy = nodePosition(sg).y;
      const sh = nodeHeight(sg);
      maxBottom = Math.max(maxBottom, sy + sh);
    }
    const members = updated.filter(n => {
      const tp = String(n.type || '');
      if (tp === 'titleGroup' || tp === 'subGroup') return false;
      return nodeDomain(n) === dId;
    });
    for (const m of members) {
      const { x: mx, y: my } = nodePosition(m);
      const mw = nodeWidth(m);
      const targetY = Math.max(my, maxBottom + vGap);
      const minX = innerLeft;
      const maxX = Math.max(innerLeft, innerRight - mw);
      const nx = Math.min(Math.max(mx, minX), maxX);
      m.position = { x: nx, y: targetY };
    }
  }
  return updated;
};

/**
 * 瀛愬煙瀹瑰櫒宸﹀彸鐣欑櫧鎶曞奖鏍℃锛堢粓鎬佸姞鍥猴級锛堝嚱鏁扮骇娉ㄩ噴锛?
 * 鐩爣锛氬湪鎵€鏈夊竷灞€涓庡鍣ㄥ搴︾‘瀹氬悗锛屾寜鍩熺殑鍐呴儴杈圭晫涓庡瓙鍩熷疄闄呬綅缃?瀹藉害璁＄畻宸﹀彸鐣欑櫧锛?
 *      閫氳繃 dx = (rightMargin - leftMargin)/2 杩涜涓€娆℃€у钩绉伙紝浣垮乏鍙崇暀鐧戒弗鏍肩浉绛夛紱涓嶆敼鍙樺搴︺€?
 */
