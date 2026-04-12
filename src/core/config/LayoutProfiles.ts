import type { Node as ReactFlowNode, Edge } from '@xyflow/react'

/**
 * 行业布局Profile计算器
 * 函数级注释：
 * - 依据图密度（节点/边/子域/域数量）与当前策略模式（strict/soft/elastic、elk/dagre_like），
 *   返回一组行业对标的布局参数集（间距因子、是否钳制、是否统一锚/宽度、是否子域堆叠、d3-force强度与迭代、后处理档位）。
 * - 目标：在高密度时自动加大间距并提升后处理强度；在非严格时尽量保留柔性几何，避免统一步骤回拉；
 *   在严格时保证包含与零重叠兜底。
 */
export function getIndustryLayoutProfile(
  nodes: ReactFlowNode[],
  edges: Edge[],
  options: { containmentPolicy: 'strict' | 'soft' | 'elastic'; rankMode: 'elk' | 'dagre_like' | 'mermaid'; profileOverride?: 'strict_industry' | 'balanced_industry' | 'relaxed_industry' | 'auto' }
): {
  name: 'strict_industry' | 'balanced_industry' | 'relaxed_industry'
  elkNodeSpacingFactor: number
  elkLayerSpacingFactor: number
  clampToInner: boolean
  skipUnify: boolean
  skipStackFit: boolean
  domainRepackShiftMembers: boolean
  d3SubGroupIterations: number
  d3SubGroupStrength: number
  d3ContainerIterations: number
  d3ContainerStrength: number
  postProfile: 'full' | 'moderate' | 'minimal'
} {
  const N = Math.max(1, nodes.filter(n => !new Set(['subGroup','titleGroup','group','domain']).has(String(n.type||''))).length)
  const E = Math.max(0, edges.length)
  const domains = nodes.filter(n => String(n.type||'')==='titleGroup').length
  const subGroups = nodes.filter(n => String(n.type||'')==='subGroup').length
  const fanDensity = E / N
  const subPerDomain = domains ? (subGroups / domains) : subGroups
  const highDensity = fanDensity >= 1.2 || N >= 24 || subPerDomain >= 4
  const midDensity = fanDensity >= 0.7 || N >= 14 || subPerDomain >= 3

  const override = options.profileOverride && options.profileOverride !== 'auto' ? options.profileOverride : undefined
  const strict = options.containmentPolicy === 'strict' || override === 'strict_industry'
  if (strict) {
    return {
      name: 'strict_industry',
      elkNodeSpacingFactor: highDensity ? 1.45 : (midDensity ? 1.3 : 1.15),
      elkLayerSpacingFactor: highDensity ? 1.45 : (midDensity ? 1.3 : 1.15),
      clampToInner: true,
      skipUnify: false,
      skipStackFit: false,
      domainRepackShiftMembers: true,
      d3SubGroupIterations: highDensity ? 220 : 180,
      d3SubGroupStrength: 0.7,
      d3ContainerIterations: highDensity ? 180 : 140,
      d3ContainerStrength: 0.6,
      postProfile: 'full',
    }
  }
  // 非严格：尽量保留柔性几何
  const relaxed = override ? (override === 'relaxed_industry') : (options.containmentPolicy !== 'soft')
  return {
    name: relaxed ? 'relaxed_industry' : 'balanced_industry',
    elkNodeSpacingFactor: highDensity ? 1.6 : (midDensity ? 1.45 : 1.25),
    elkLayerSpacingFactor: highDensity ? 1.6 : (midDensity ? 1.45 : 1.25),
    clampToInner: false,
    skipUnify: true,
    skipStackFit: true,
    domainRepackShiftMembers: false,
    d3SubGroupIterations: highDensity ? 240 : 200,
    d3SubGroupStrength: 0.75,
    d3ContainerIterations: highDensity ? 200 : 160,
    d3ContainerStrength: 0.65,
    postProfile: highDensity ? 'full' : 'moderate',
  }
}
