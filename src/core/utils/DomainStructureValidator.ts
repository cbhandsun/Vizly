import type { Node } from '@xyflow/react'

export interface Bounds { x: number; y: number; width: number; height: number }
export interface ValidationOptions { padding?: number; minGap?: number }
export interface ValidationReport {
  domainBounds: Record<string, Bounds>
  subDomainBounds: Record<string, Bounds>
  nodeBounds: Record<string, Bounds>
  violations: Array<{ type: string; id: string; info: any }>
}

/**
 * computeNodeBounds（函数级注释）
 * - 根据节点 position 与尺寸（优先 measured，次选 style）计算边界框
 */
export function computeNodeBounds(n: Node): Bounds {
  const w = typeof (n as any)?.measured?.width === 'number' ? (n as any).measured.width : (typeof (n.style as any)?.width === 'number' ? (n.style as any).width : 180)
  const h = typeof (n as any)?.measured?.height === 'number' ? (n as any).measured.height : (typeof (n.style as any)?.height === 'number' ? (n.style as any).height : 80)
  const x = (n.position?.x || 0)
  const y = (n.position?.y || 0)
  return { x, y, width: Math.max(1, w), height: Math.max(1, h) }
}

/**
 * expandBounds（函数级注释）
 * - 对边界框应用内边距与安全间距扩展
 */
export function expandBounds(b: Bounds, pad: number): Bounds {
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
}

/**
 * unionBounds（函数级注释）
 * - 计算一组边界框的并集
 */
export function unionBounds(list: Bounds[], pad = 0): Bounds {
  const xs = list.map(b => b.x)
  const ys = list.map(b => b.y)
  const xe = list.map(b => b.x + b.width)
  const ye = list.map(b => b.y + b.height)
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const maxX = Math.max(...xe), maxY = Math.max(...ye)
  return expandBounds({ x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }, pad)
}

/**
 * overlapAmount（函数级注释）
 * - 返回两个边界框的重叠量（X/Y 方向），负值表示有间距
 */
export function overlapAmount(a: Bounds, b: Bounds): { dx: number; dy: number } {
  const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return { dx, dy }
}

/**
 * validateHierarchy（函数级注释）
 * - 输入：已布局的节点集合；读取 node.data.domain/subDomain
 * - 输出：域/子域/节点的边界框与四类约束违反项
 */
export function validateHierarchy(nodes: Node[], opt: ValidationOptions = {}): ValidationReport {
  const pad = Math.max(0, opt.padding ?? 24)
  const minGap = Math.max(0, opt.minGap ?? 16)
  const nodeBounds: Record<string, Bounds> = {}
  nodes.forEach(n => { nodeBounds[n.id] = computeNodeBounds(n) })

  const byDomain: Record<string, Node[]> = {}
  const bySub: Record<string, Node[]> = {}
  nodes.forEach(n => {
    const d = String(((n as any).data?.domain) || 'default')
    const sd = (n as any).data?.subDomain ? String((n as any).data?.subDomain) : undefined
    if (!byDomain[d]) byDomain[d] = []
    byDomain[d].push(n)
    if (sd) {
      const key = `${d}::${sd}`
      if (!bySub[key]) bySub[key] = []
      bySub[key].push(n)
    }
  })

  const subDomainBounds: Record<string, Bounds> = {}
  Object.keys(bySub).forEach(key => {
    const list = bySub[key].map(n => nodeBounds[n.id])
    subDomainBounds[key] = unionBounds(list, pad)
  })

  const domainBounds: Record<string, Bounds> = {}
  Object.keys(byDomain).forEach(d => {
    const list = byDomain[d].map(n => nodeBounds[n.id])
    const subs = Object.keys(subDomainBounds).filter(k => k.startsWith(`${d}::`)).map(k => subDomainBounds[k])
    domainBounds[d] = unionBounds([...list, ...subs], pad)
  })

  const violations: Array<{ type: string; id: string; info: any }> = []

  // 1) 子域必须完全包含其所有节点
  Object.keys(bySub).forEach(key => {
    const box = subDomainBounds[key]
    for (const n of bySub[key]) {
      const nb = nodeBounds[n.id]
      const outside = nb.x < box.x || nb.y < box.y || (nb.x + nb.width) > (box.x + box.width) || (nb.y + nb.height) > (box.y + box.height)
      if (outside) violations.push({ type: 'NodeOutsideSubDomain', id: n.id, info: { subKey: key, node: nb, sub: box } })
    }
  })

  // 2) 域必须完全包含其所有子域
  Object.keys(domainBounds).forEach(d => {
    const box = domainBounds[d]
    const subs = Object.keys(subDomainBounds).filter(k => k.startsWith(`${d}::`))
    subs.forEach(k => {
      const sb = subDomainBounds[k]
      const outside = sb.x < box.x || sb.y < box.y || (sb.x + sb.width) > (box.x + box.width) || (sb.y + sb.height) > (box.y + box.height)
      if (outside) violations.push({ type: 'SubDomainOutsideDomain', id: k, info: { domain: d, sub: sb, dom: box } })
    })
  })

  // 3) 子域之间不允许重叠（同一域内）
  const subsByDomain: Record<string, string[]> = {}
  Object.keys(subDomainBounds).forEach(k => {
    const d = k.split('::')[0]
    if (!subsByDomain[d]) subsByDomain[d] = []
    subsByDomain[d].push(k)
  })
  Object.keys(subsByDomain).forEach(d => {
    const list = subsByDomain[d]
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = subDomainBounds[list[i]]
        const b = subDomainBounds[list[j]]
        const { dx, dy } = overlapAmount(a, b)
        if (dx > -minGap && dy > -minGap) violations.push({ type: 'SubDomainOverlap', id: `${list[i]}|${list[j]}`, info: { a, b } })
      }
    }
  })

  // 4) 域之间不允许重叠
  const domains = Object.keys(domainBounds)
  for (let i = 0; i < domains.length; i++) {
    for (let j = i + 1; j < domains.length; j++) {
      const a = domainBounds[domains[i]]
      const b = domainBounds[domains[j]]
      const { dx, dy } = overlapAmount(a, b)
      if (dx > -minGap && dy > -minGap) violations.push({ type: 'DomainOverlap', id: `${domains[i]}|${domains[j]}`, info: { a, b } })
    }
  }

  return { domainBounds, subDomainBounds, nodeBounds, violations }
}

/**
 * analyzeFailureReasons（函数级注释）
 * - 根据违反项统计常见失败原因并输出建议
 */
export function analyzeFailureReasons(report: ValidationReport): Array<{ cause: string; count: number; suggestion: string }> {
  const map: Record<string, number> = {}
  report.violations.forEach(v => { map[v.type] = (map[v.type] || 0) + 1 })
  const res: Array<{ cause: string; count: number; suggestion: string }> = []
  Object.keys(map).forEach(k => {
    const count = map[k]
    const suggestion = k === 'DomainOverlap'
      ? '增大域层 spacing 或调整 laneOrder 以减少并列拥挤'
      : k === 'SubDomainOverlap'
        ? '子域内增加 padding/spacing 或启用行拆分'
        : k === 'NodeOutsideSubDomain'
          ? '校准子域尺寸计算，确保含内边距，并检查节点位置来源是否正确'
          : '增大域容器 padding 并检查边界计算是否包含子域'
    res.push({ cause: k, count, suggestion })
  })
  return res
}

