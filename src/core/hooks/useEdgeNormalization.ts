import { useMemo, useRef } from 'react';
import { Edge, Node } from '@xyflow/react';
import { decideEdgeRouting } from '../utils/HandlePicker';
import { diagramConfigManager } from '../components/config/DiagramConfig';

export interface EdgeNormalizationOptions {
  enableSmartRouting?: boolean; // Default: true. If false, bypasses smart routing.
  layoutDirection?: 'TB' | 'BT' | 'LR' | 'RL'; // Default: 'TB'
  overrideConfig?: any; // Optional config object to override global diagram config
}

/**
 * P1 Single Source of Truth for Edge Properties
 *
 * Unifies edge.mode / pathType / autoPathType / autoHandle into a single resolution step.
 * Ensures that what the view layer sees is exactly what should be rendered.
 *
 * [OPT-P2⑧] 精细化 useMemo 依赖粒度：
 * - 节点拓扑签名：只包含 id + 尺寸（忽略位置）→ 拖动不触发重算
 * - 边签名：只包含 source/target/handle/manual 关键字段
 * - 路由决策结果缓存在 ref 中，签名未变时直接复用
 */
export function useEdgeNormalization(
  nodes: Node[],
  edges: Edge[],
  options: EdgeNormalizationOptions = {}
) {
  const {
    enableSmartRouting = true,
    layoutDirection = 'TB',
    overrideConfig
  } = options;

  const config = overrideConfig || diagramConfigManager.getConfig();
  const edgeConfig = config.edge || {};

  // [OPT-P2⑧] 节点拓扑签名：id + 尺寸（不包含位置，拖动时不失效）
  const nodeTopoKey = useMemo(() => {
    return nodes.map(n => {
      const w = n.measured?.width ?? (n as any).width ?? 0;
      const h = n.measured?.height ?? (n as any).height ?? 0;
      return `${n.id}:${w}:${h}`;
    }).join('|');
  }, [nodes]);

  // [OPT-P2⑧] 边拓扑签名：source/target/handle/manualHandles 关键字段
  const edgeTopoKey = useMemo(() => {
    return edges.map(e => {
      const d: any = e.data || {};
      const mh = d.manualHandles ? '1' : '0';
      const mhs = Array.isArray(d.manualHandleSides) ? d.manualHandleSides.join(',') : '';
      return `${e.id}:${e.source}>${e.target}:${e.sourceHandle ?? ''}:${e.targetHandle ?? ''}:${mh}:${mhs}`;
    }).join('|');
  }, [edges]);

  // [OPT-P2⑧] 只提取影响路由决策的 edgeConfig 字段
  const edgeConfigKey = useMemo(() => {
    return `${edgeConfig.mode}|${edgeConfig.pathType}|${edgeConfig.directionalHandlePolicy}`;
  }, [edgeConfig]);

  // 签名缓存 ref，签名命中时直接返回上次结果
  const cacheRef = useRef<{ key: string; result: Edge[] } | null>(null);

  const normalizedEdges = useMemo(() => {
    if (!enableSmartRouting) {
      return edges;
    }

    // 组合签名：任意一项变化都触发重算
    const cacheKey = `${nodeTopoKey}::${edgeTopoKey}::${edgeConfigKey}::${layoutDirection}`;

    // 签名命中：节点拖动时最常触发，直接复用
    if (cacheRef.current && cacheRef.current.key === cacheKey) {
      return cacheRef.current.result;
    }

    // Prepare routing config once
    const routingConfig = {
      mode: (edgeConfig.mode === 'advanced-smart' ? 'advanced-smart' : 'native') as 'advanced-smart' | 'native',
      globalPath: (edgeConfig.pathType || 'step') as string,
      autoPathSelection: true,
      layoutDirection,
      directionalHandlePolicy: (edgeConfig.directionalHandlePolicy || 'prefer') as 'prefer' | 'force' | 'off',
      angleToleranceDeg: edgeConfig.angleToleranceDeg,
      bezierDistanceThreshold: edgeConfig.bezierDistanceThreshold,
      obstacleScopePadding: edgeConfig.obstacleScopePadding,
      corridorObstacleThreshold: edgeConfig.corridorObstacleThreshold,
      verticalBiasThreshold: edgeConfig.verticalBiasThreshold,
      obstaclePadding: edgeConfig.obstaclePadding,
      smoothFallback: edgeConfig.smoothFallback,
    };

    const nodeMap = new Map<string, any>();
    nodes.forEach(n => nodeMap.set(String(n.id), n));

    const getAbsolutePosition = (node: any, visited?: Set<string>): { x: number; y: number } => {
      const abs = node?.computed?.positionAbsolute || node?.positionAbsolute;
      if (abs) return abs;
      const base = node?.position || { x: node?.x ?? 0, y: node?.y ?? 0 };
      const parentId = node?.parentId || node?.parentNode;
      if (!parentId) return base;
      const v = visited || new Set<string>();
      const id = String(node?.id ?? '');
      if (id && v.has(id)) return base;
      if (id) v.add(id);
      const parent = nodeMap.get(String(parentId));
      if (!parent) return base;
      const pAbs = getAbsolutePosition(parent, v);
      return { x: pAbs.x + (base.x ?? 0), y: pAbs.y + (base.y ?? 0) };
    };

    const normalizeHandle = (h?: string | null): 't' | 'b' | 'l' | 'r' | undefined => {
      if (!h) return undefined;
      const s = String(h).toLowerCase();
      // Priority 1: exact match
      if (s === 't' || s === 'top') return 't';
      if (s === 'b' || s === 'bottom') return 'b';
      if (s === 'l' || s === 'left') return 'l';
      if (s === 'r' || s === 'right') return 'r';
      // Priority 2: substring match (handles compound IDs like 'source-right', 't-right')
      if (s.includes('top')) return 't';
      if (s.includes('bottom')) return 'b';
      if (s.includes('left')) return 'l';
      if (s.includes('right')) return 'r';
      return undefined;
    };

    const readAutoFlags = (edge: Edge): { source: boolean; target: boolean } => {
      const d: any = (edge as any).data || {};
      const list = Array.isArray(d.auto) ? d.auto.map((x: any) => String(x).toLowerCase()) : [];
      const autoSource = Boolean(d.autoSource) || list.includes('source');
      const autoTarget = Boolean(d.autoTarget) || list.includes('target');
      return { source: autoSource, target: autoTarget };
    };

    const readManualFlags = (edge: Edge): { source: boolean; target: boolean } => {
      const d: any = (edge as any).data || {};
      if (Array.isArray(d.manualHandleSides)) {
        const list = d.manualHandleSides.map((x: any) => String(x).toLowerCase());
        return { source: list.includes('source'), target: list.includes('target') };
      }
      if (d.manualHandles === true) return { source: true, target: true };
      if (d.manualHandles && typeof d.manualHandles === 'object') {
        return { source: Boolean(d.manualHandles.source), target: Boolean(d.manualHandles.target) };
      }
      return { source: false, target: false };
    };

    const result = edges.map(edge => {
      // O(n²)→O(n) — nodeMap 直接 get
      const sourceNode = nodeMap.get(String(edge.source));
      const targetNode = nodeMap.get(String(edge.target));

      if (!sourceNode || !targetNode) {
        return edge;
      }

      // ⭐ [FIX] 如果是布局引擎已经计算好树状总线（tree-bus）或 ELK 路径的边，直接透传，防止被单边寻路覆盖
      if (edge.data?.isTreeBus && edge.data?.treeRouting) {
        return edge;
      }
      if (edge.data?.useElkRouting && edge.data?.elkPath) {
        return edge;
      }

      const autoFlags = readAutoFlags(edge);
      const manualFlags = readManualFlags(edge);
      const hasExplicitSource = !!edge.sourceHandle && manualFlags.source;
      const hasExplicitTarget = !!edge.targetHandle && manualFlags.target;

      const routingResult = decideEdgeRouting(sourceNode, targetNode, nodes, routingConfig);

      const existingSH = normalizeHandle(edge.sourceHandle as any);
      const existingTH = normalizeHandle(edge.targetHandle as any);

      const sAbs = getAbsolutePosition(sourceNode as any);
      const tAbs = getAbsolutePosition(targetNode as any);
      const sW = (sourceNode.measured?.width ?? (sourceNode as any).width ?? (sourceNode as any).style?.width ?? 0) as number;
      const sH = (sourceNode.measured?.height ?? (sourceNode as any).height ?? (sourceNode as any).style?.height ?? 0) as number;
      const tW = (targetNode.measured?.width ?? (targetNode as any).width ?? (targetNode as any).style?.width ?? 0) as number;
      const tH = (targetNode.measured?.height ?? (targetNode as any).height ?? (targetNode as any).style?.height ?? 0) as number;
      const dx = (tAbs.x + tW / 2) - (sAbs.x + sW / 2);
      const dy = (tAbs.y + tH / 2) - (sAbs.y + sH / 2);

      const verticalDominant = Math.abs(dy) > Math.abs(dx) * 1.1 && Math.abs(dy) > 40;
      const contradictingVertical =
        verticalDominant &&
        dy > 0 &&
        existingSH === 't' &&
        existingTH === 'b';

      const treatExistingAsAuto = contradictingVertical && !manualFlags.source && !manualFlags.target;

      const finalSourceHandle = (hasExplicitSource && !treatExistingAsAuto) ? edge.sourceHandle : routingResult.sourceHandle;
      const finalTargetHandle = (hasExplicitTarget && !treatExistingAsAuto) ? edge.targetHandle : routingResult.targetHandle;

      const nextAuto = {
        source: (!manualFlags.source && (!hasExplicitSource || treatExistingAsAuto)) ? Boolean(routingResult.autoSource) : autoFlags.source,
        target: (!manualFlags.target && (!hasExplicitTarget || treatExistingAsAuto)) ? Boolean(routingResult.autoTarget) : autoFlags.target
      };
      const autoList: string[] = [];
      if (nextAuto.source) autoList.push('source');
      if (nextAuto.target) autoList.push('target');

      return {
        ...edge,
        type: routingResult.type,
        sourceHandle: finalSourceHandle,
        targetHandle: finalTargetHandle,
        data: ({
          ...(edge.data as any),
          auto: autoList,
          autoSource: nextAuto.source,
          autoTarget: nextAuto.target,
          manualHandles: (edge.data as any)?.manualHandles,
          manualHandleSides: (edge.data as any)?.manualHandleSides,
          _routingMode: routingConfig.mode,
          _generatedType: routingResult.type
        } as any)
      };
    });

    // 写入签名缓存
    cacheRef.current = { key: cacheKey, result };
    return result;

  // [OPT-P2⑧] 依赖改为签名字符串（而非原始数组引用）
  // 节点位置变化（拖动）不触发重算，仅拓扑/尺寸/配置变化时触发
  // nodes/edges 本身仍列入，以确保 getAbsolutePosition 内部逻辑使用最新引用
  }, [nodeTopoKey, edgeTopoKey, edgeConfigKey, enableSmartRouting, layoutDirection, nodes, edges]);

  return normalizedEdges;
}
