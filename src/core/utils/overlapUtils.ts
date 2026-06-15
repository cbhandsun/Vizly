import type { Node as ReactFlowNode } from '@xyflow/react'

/**
 * 全局业务节点重叠消解（函数级注释）
 * - 输入：节点集合与期望的水平/垂直最小间距（gapH/gapV）；
 * - 目标：对所有非容器类业务节点进行几何避让，保证矩形之间至少有最小间距；
 * - 策略：迭代若干轮，检测两两相交；按相交程度选择 x 或 y 方向分离，分别向两侧推开 gap；
 * - 约束：不考虑域/子域容器边界，不移动容器类节点；仅调整 position。
 */
export function resolveGlobalNodeOverlapsSimple(
  nodes: ReactFlowNode[],
  gapH: number,
  gapV: number,
  iterations: number = 3
): ReactFlowNode[] {
  const EXCLUDE = new Set(['subGroup','titleGroup','group','domain'])
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb
  const getW = (n: ReactFlowNode) => num(((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width), 0)
  const getH = (n: ReactFlowNode) => num(((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height), 0)
  const getX = (n: ReactFlowNode) => num(((n as any)?.position?.x), 0)
  const getY = (n: ReactFlowNode) => num(((n as any)?.position?.y), 0)
  const updated = nodes.map(n => ({ ...n }))
  const biz = updated.filter(n => !EXCLUDE.has(String(n.type || '')))
  const rounds = Math.max(1, Math.min(10, Math.floor(num(iterations, 3))))
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < biz.length; i++) {
      for (let j = i + 1; j < biz.length; j++) {
        const a = biz[i];
        const b = biz[j];
        const ax = getX(a), ay = getY(a), aw = getW(a), ah = getH(a)
        const bx = getX(b), by = getY(b), bw = getW(b), bh = getH(b)
        const overlapX = Math.min(ax + aw + gapH, bx + bw + gapH) - Math.max(ax - gapH, bx - gapH)
        const overlapY = Math.min(ay + ah + gapV, by + bh + gapV) - Math.max(ay - gapV, by - gapV)
        const intersects = overlapX > 0 && overlapY > 0
        if (!intersects) continue
        const sepX = Math.max(0, Math.floor(gapH))
        const sepY = Math.max(0, Math.floor(gapV))
        const centerAX = ax + aw / 2, centerAY = ay + ah / 2
        const centerBX = bx + bw / 2, centerBY = by + bh / 2
        const dx = centerAX - centerBX
        const dy = centerAY - centerBY
        const moveX = Math.abs(overlapX) >= Math.abs(overlapY)
        const signX = dx >= 0 ? 1 : -1
        const signY = dy >= 0 ? 1 : -1
        ;(a as any).position = { x: ax + (moveX ? signX * sepX : 0), y: ay + (!moveX ? signY * sepY : 0) } as any
        ;(b as any).position = { x: bx - (moveX ? signX * sepX : 0), y: by - (!moveX ? signY * sepY : 0) } as any
      }
    }
  }
  return updated
}

