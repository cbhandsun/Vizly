import { useMemo } from 'react';
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
 */
export function useEdgeNormalization(
  nodes: Node[],
  edges: Edge[],
  options: EdgeNormalizationOptions = {}
) {
  // Subscribe to config changes (in a real app, this might be a context or store, 
  // but here we use the manager directly or assume parent passes trigger. 
  // For now, we'll assume the parent component re-renders when config changes, 
  // or we can add a listener if needed. Given existing code uses useEffect to sync config,
  // we'll rely on props/context propagation or just read current config.)

  // Note: To make this hook reactive to config changes without a React context,
  // we might need a forceUpdate or similar if the config manager doesn't trigger React updates.
  // Assuming the calling component manages the 'edgeMode' state or similar.

  const {
    enableSmartRouting = true,
    layoutDirection = 'TB',
    overrideConfig
  } = options;

  const config = overrideConfig || diagramConfigManager.getConfig();
  const edgeConfig = config.edge || {};

  const normalizedEdges = useMemo(() => {
    if (!enableSmartRouting) {
      return edges;
    }

    // Prepare routing config once
    const routingConfig = {
      mode: (edgeConfig.mode === 'advanced-smart' ? 'advanced-smart' : 'native') as 'advanced-smart' | 'native',
      globalPath: (edgeConfig.pathType || 'step') as string,
      autoPathSelection: true,
      layoutDirection,
      directionalHandlePolicy: (edgeConfig.directionalHandlePolicy || 'prefer') as 'prefer' | 'force' | 'off',
      // Pass other config values if needed
      angleToleranceDeg: edgeConfig.angleToleranceDeg,
      bezierDistanceThreshold: edgeConfig.bezierDistanceThreshold,
      obstacleScopePadding: edgeConfig.obstacleScopePadding,
      corridorObstacleThreshold: edgeConfig.corridorObstacleThreshold,
      verticalBiasThreshold: edgeConfig.verticalBiasThreshold,
      obstaclePadding: edgeConfig.obstaclePadding,
      smoothFallback: edgeConfig.smoothFallback, // Ensure fallback is passed
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
      if (s === 't' || s.startsWith('t') || s.includes('top')) return 't';
      if (s === 'b' || s.startsWith('b') || s.includes('bottom')) return 'b';
      if (s === 'l' || s.startsWith('l') || s.includes('left')) return 'l';
      if (s === 'r' || s.startsWith('r') || s.includes('right')) return 'r';
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

    return edges.map(edge => {
      // P8: O(n²)→O(n) — 已有 nodeMap，直接 Map.get 替代 Array.find
      const sourceNode = nodeMap.get(String(edge.source));
      const targetNode = nodeMap.get(String(edge.target));

      // If nodes are missing, we can't do smart routing. Return as is or with defaults.
      if (!sourceNode || !targetNode) {
        return edge;
      }

      // Check for explicit handle overrides on the edge itself
      // If the edge has explicit handles, we might want to respect them unless 'autoHandle' is true?
      // P1 goal: "orchestration layer parses once".
      // Current behavior in codebases:
      // "sourceHandle: edge.sourceHandle ?? routingResult.sourceHandle"
      // This implies if edge.sourceHandle is set, we use it.

      const autoFlags = readAutoFlags(edge);
      const manualFlags = readManualFlags(edge);
      const hasExplicitSource = !!edge.sourceHandle && manualFlags.source;
      const hasExplicitTarget = !!edge.targetHandle && manualFlags.target;

      // However, decideEdgeRouting also takes 'preAssignedPorts' or we can just let it run 
      // and then overwrite if we want to respect explicit handles.
      // But decideEdgeRouting might choose a different 'type' based on handles.
      // Ideally, if handles are fixed, we should tell decideEdgeRouting about them so it picks the best type for THOSE handles.

      // Let's call decideEdgeRouting.
      // Note: decideEdgeRouting doesn't currently accept "fixed handles" as a hard constraint for type selection 
      // except via candidate filtering which isn't fully exposed in the simplified call.
      // But we can just use the result and override handles if needed.

      const routingResult = decideEdgeRouting(sourceNode, targetNode, nodes, routingConfig);

      // Resolve final properties
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

      // If we forced handles, should we re-evaluate type? 
      // decideEdgeRouting's type logic is coupled with its handle choice.
      // For P1, let's stick to the pattern: "Calculate optimal, but respect explicit overrides".

      // Construct the unified edge object
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
          // We can also inject debug info or other computed props here
          _routingMode: routingConfig.mode,
          _generatedType: routingResult.type
        } as any)
      };
    });
  }, [nodes, edges, edgeConfig, enableSmartRouting, layoutDirection]);

  return normalizedEdges;
}
