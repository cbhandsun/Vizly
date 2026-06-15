 
/**
 * @file 最终几何包含保障
 * @description 管线末端的域容器溢出检测 + 自动扩展 + 域宽统一。
 *   从 DomainVerticalLayoutStrategy 提取，可被所有域布局策略复用。
 */
import type { Node as ReactFlowNode } from '@xyflow/react';

const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;

/**
 * 确保所有子元素都包含在域容器内
 * - 检测子域容器和普通节点是否溢出域容器右边界
 * - 自动扩展溢出的域容器宽度
 * - 扩展后统一所有域容器的宽度
 * @param nodes 所有节点
 * @param padH 安全 padding，默认 30px
 */
export function ensureDomainContainment(nodes: ReactFlowNode[], padH: number = 30): ReactFlowNode[] {
  const titleGroups = nodes.filter(n => String(n.type || '') === 'titleGroup');
  const subGroups = nodes.filter(n => String(n.type || '') === 'subGroup');

  if (titleGroups.length === 0 || subGroups.length === 0) return nodes;

  let anyExpanded = false;

  for (const tg of titleGroups) {
    const tgX = num(((tg as any)?.position?.x), 0);
    const tgY = num(((tg as any)?.position?.y), 0);
    const tgW = num(((tg as any)?.measured?.width ?? (tg as any)?.style?.width), 0);
    const tgH = num(((tg as any)?.measured?.height ?? (tg as any)?.style?.height), 0);
    const tgRight = tgX + tgW;
    const tgBottom = tgY + tgH;

    let maxChildRight = -Infinity;

    for (const sg of subGroups) {
      const sgX = num(((sg as any)?.position?.x), 0);
      const sgY = num(((sg as any)?.position?.y), 0);
      const sgW = num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width), 0);
      const sgCenterY = sgY + num(((sg as any)?.measured?.height ?? (sg as any)?.style?.height), 0) / 2;

      // 几何包含判定：subGroup 的 Y 中心在 titleGroup 的 Y 范围内
      if (sgCenterY >= tgY && sgCenterY <= tgBottom && sgX >= tgX - 10) {
        maxChildRight = Math.max(maxChildRight, sgX + sgW);
      }
    }

    // 也检查普通节点（非容器）是否溢出
    for (const n of nodes) {
      const tp = String(n.type || '');
      if (tp === 'titleGroup' || tp === 'subGroup') continue;
      const nX = num(((n as any)?.position?.x), 0);
      const nY = num(((n as any)?.position?.y), 0);
      const nW = num(((n as any)?.measured?.width ?? (n as any)?.style?.width), 0);
      const nH = num(((n as any)?.measured?.height ?? (n as any)?.style?.height), 0);
      const nCenterY = nY + nH / 2;
      if (nCenterY >= tgY && nCenterY <= tgBottom && nX >= tgX - 10) {
        maxChildRight = Math.max(maxChildRight, nX + nW);
      }
    }

    if (isFinite(maxChildRight) && maxChildRight > tgRight) {
      const newW = Math.max(tgW, maxChildRight - tgX + padH);
      ((tg as any).style || ((tg as any).style = {})).width = newW;
      (tg as any).measured = { width: newW, height: tgH } as any;
      (tg as any).width = newW;
      anyExpanded = true;
    }
  }

  // 如果有域被扩展，重新统一所有域宽
  if (anyExpanded) {
    const maxW = Math.max(...titleGroups.map(tg => num(((tg as any)?.measured?.width ?? (tg as any)?.style?.width), 0)));
    if (isFinite(maxW) && maxW > 0) {
      for (const tg of titleGroups) {
        const curH = num(((tg as any)?.measured?.height ?? (tg as any)?.style?.height), 0);
        ((tg as any).style || ((tg as any).style = {})).width = maxW;
        (tg as any).measured = { width: maxW, height: curH } as any;
        (tg as any).width = maxW;
      }
    }
  }

  return nodes;
}
