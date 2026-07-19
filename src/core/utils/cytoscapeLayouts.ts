import type { Node as ReactFlowNode, Edge } from '@xyflow/react';
import { diagramConfigManager } from '../config/DiagramConfig';

/**
 * 使用 Cytoscape 对子域 children 进行布局
 * 函数级注释：
 * - mode 为 'fcose' 或 'concentric'；仅定位普通节点，不处理容器；
 * - 在每个子域内部以其可用区域为坐标系布局，并叠加子域的内边距与标题留白；
 * - 返回更新后的节点集合，其它节点保持不变。
 */
export async function enforceSubGroupChildrenLayoutCytoscape(
  nodes: ReactFlowNode[],
  edges: Edge[] | undefined,
  mode: 'fcose' | 'concentric'
): Promise<ReactFlowNode[]> {
  const cfgLayout: any = diagramConfigManager.getLayoutConfig() || {};
  const cfgFull: any = diagramConfigManager.getConfig() || {};
  const num = (v: any, fb: number) => (typeof v === 'number' && isFinite(v)) ? v : fb;
  const SUB_H = num(cfgLayout?.SUB_GROUP_PADDING?.H, 30);
  const titleH = num(cfgFull?.subDomain?.title?.height, 28);
  const titleV = num(cfgFull?.subDomain?.title?.padding?.vertical, 8);
  const ensureClear = !!cfgLayout?.ENSURE_SUB_GROUP_TITLE_CLEARANCE;
  const titleClear = num(cfgLayout?.SUB_GROUP_TITLE_CLEARANCE, titleH + titleV);
  const TOP_PAD = ensureClear ? Math.max(titleH + titleV, titleClear) : (titleH + titleV);
  const updated = nodes.map(n => ({ ...n }));
  const idMap = new Map<string, ReactFlowNode>(updated.map(n => [n.id, n] as const));
  const EXCLUDE_TYPES = new Set(['subGroup', 'titleGroup', 'group', 'domain']);
  const getW = (n: ReactFlowNode) => num((((n as any)?.measured?.width ?? (n as any)?.style?.width ?? (n as any)?.width)), Math.max(120, cfgLayout?.NODE_MIN_WIDTH || 120));
  const getH = (n: ReactFlowNode) => num((((n as any)?.measured?.height ?? (n as any)?.style?.height ?? (n as any)?.height)), num(cfgFull?.node?.height, 80));

  const H_GAP = Math.max(12, num(cfgLayout?.NODE_H_GAP, 120));
  const V_GAP = Math.max(8, num(cfgLayout?.NODE_V_GAP, 80));

  const importCy = async () => {
    const cytoscapeMod: any = await import('cytoscape');
    const cy = (cytoscapeMod.default || cytoscapeMod);
    if (mode === 'fcose') {
      const fcoseMod: any = await import('cytoscape-fcose');
      try { (cy as any).use(fcoseMod.default || fcoseMod); } catch {}
    }
    return cy;
  };

  const cyLib = await importCy();

  for (let i = 0; i < updated.length; i++) {
    const sg = updated[i];
    if (String(sg.type || '') !== 'subGroup') continue;
    const children = Array.isArray((sg.data as any)?.children) ? ((sg.data as any).children as string[]) : [];
    if (!children.length) continue;
    const pos = (sg.position as any) || { x: 0, y: 0 };
    const size = { w: num(((sg as any)?.measured?.width ?? (sg as any)?.style?.width ?? (sg as any)?.width), 0), h: num(((sg as any)?.measured?.height ?? (sg as any)?.style?.height ?? (sg as any)?.height), 0) };
    const innerLeft = num(pos.x, 0) + SUB_H;
    const innerTop = num(pos.y, 0) + TOP_PAD;
    const innerRight = size.w > 0 ? (num(pos.x, 0) + size.w - SUB_H) : (innerLeft + Math.max(1, num((cfgFull?.layout?.mainColumnWidth), 400)));
    const _innerWidth = Math.max(1, innerRight - innerLeft);

    const childIds = children.filter(cid => {
      const n = idMap.get(cid);
      if (!n) return false;
      const t = String(n.type || '');
      if (EXCLUDE_TYPES.has(t)) return false;
      const hidden = !!((n.data as any)?.hidden);
      return !hidden;
    });
    if (!childIds.length) continue;

    const elements: any[] = [];
    for (const cid of childIds) {
      const n = idMap.get(cid)!;
      elements.push({ data: { id: cid, width: getW(n), height: getH(n) } });
    }
    const scopedEdges = (edges || []).filter(e => childIds.includes(e.source) && childIds.includes(e.target));
    for (const e of scopedEdges) elements.push({ data: { id: e.id || `${e.source}->${e.target}`, source: e.source, target: e.target } });

    const cy = cyLib({ headless: true, elements, style: [ { selector: 'node', style: { width: 'data(width)', height: 'data(height)' } } ] });
    const paddingAll = Math.max(16, Math.floor(Math.min(H_GAP, V_GAP) * 0.6));
    const layout = ((): any => {
      if (mode === 'fcose') return cy.layout({ name: 'fcose', animate: false, padding: paddingAll, nodeSeparation: Math.max(20, Math.floor(H_GAP * 0.6)), idealEdgeLength: Math.max(40, Math.floor(H_GAP)), gravity: 0.25 } as any);
      const concentric = (node: any) => {
        const fi = Number(((node.data() as any)?.fanIn ?? 0));
        const fo = Number(((node.data() as any)?.fanOut ?? 0));
        return Math.max(1, fi + fo);
      };
      return cy.layout({
        name: 'concentric',
        animate: false,
        padding: paddingAll,
        minNodeSpacing: Math.max(20, Math.floor(H_GAP * 0.6)),
        concentric
      } as any);
    })();
    layout.run();

    for (const cid of childIds) {
      const el = cy.getElementById(cid);
      const p = el?.position?.() || { x: 0, y: 0 };
      const idx = updated.findIndex(n => n.id === cid);
      if (idx >= 0) (updated[idx] as any).position = { x: Math.round(p.x + innerLeft), y: Math.round(p.y + innerTop) } as any;
    }
  }

  return updated;
}
