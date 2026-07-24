import { useMemo } from 'react';
import { Edge, Node } from '@xyflow/react';
import { decideEdgeRouting } from '../utils/HandlePicker';
import { diagramConfigManager } from '../config/DiagramConfig';
import type { DiagramConfig } from '../config/DiagramConfig';

export interface EdgeNormalizationOptions {
  enableSmartRouting?: boolean; // Default: true. If false, bypasses smart routing.
  layoutDirection?: 'TB' | 'BT' | 'LR' | 'RL'; // Default: 'TB'
  overrideConfig?: { edge?: Partial<DiagramConfig['edge']> }; // Optional config object to override global diagram config
}

type NormalizationNode = Node & {
  x?: number;
  y?: number;
  positionAbsolute?: { x: number; y: number };
  computed?: { positionAbsolute?: { x: number; y: number } };
  parentNode?: string;
};

const EMPTY_EDGE_CONFIG: DiagramConfig['edge'] = {
  strokeWidth: 1,
  animated: false,
  type: 'default',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const finiteCoordinate = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(/px$/i, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const lowerCaseStringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map(item => item.toLowerCase())
    : [];

/**
 * P1 Single Source of Truth for Edge Properties
 *
 * Unifies edge.mode / pathType / autoPathType / autoHandle into a single resolution step.
 * Ensures that what the view layer sees is exactly what should be rendered.
 *
 * Uses explicit React memoization dependencies so edge normalization remains
 * compatible with React Compiler and does not read or write refs during render.
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
  const edgeConfig = config.edge ?? EMPTY_EDGE_CONFIG;

  const routingConfig = useMemo(() => ({
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
  }), [
    edgeConfig.angleToleranceDeg,
    edgeConfig.bezierDistanceThreshold,
    edgeConfig.corridorObstacleThreshold,
    edgeConfig.directionalHandlePolicy,
    edgeConfig.mode,
    edgeConfig.obstaclePadding,
    edgeConfig.obstacleScopePadding,
    edgeConfig.pathType,
    edgeConfig.smoothFallback,
    edgeConfig.verticalBiasThreshold,
    layoutDirection,
  ]);

  const normalizedEdges = useMemo(() => {
    if (!enableSmartRouting) {
      return edges;
    }

    const nodeMap = new Map<string, NormalizationNode>();
    nodes.forEach(n => nodeMap.set(String(n.id), n));

    const getAbsolutePosition = (
      node: NormalizationNode,
      visited?: Set<string>,
    ): { x: number; y: number } => {
      const abs = node?.computed?.positionAbsolute || node?.positionAbsolute;
      if (abs) return { x: finiteCoordinate(abs.x), y: finiteCoordinate(abs.y) };
      const base = node.position || { x: node.x ?? 0, y: node.y ?? 0 };
      const parentId = node.parentId || node.parentNode;
      if (!parentId) return base;
      const v = visited || new Set<string>();
      const id = String(node.id ?? '');
      if (id && v.has(id)) return base;
      if (id) v.add(id);
      const parent = nodeMap.get(String(parentId));
      if (!parent) return base;
      const pAbs = getAbsolutePosition(parent, v);
      return {
        x: pAbs.x + finiteCoordinate(base.x),
        y: pAbs.y + finiteCoordinate(base.y),
      };
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
      const d = asRecord(edge.data);
      const list = lowerCaseStringList(d.auto);
      const autoSource = Boolean(d.autoSource) || list.includes('source');
      const autoTarget = Boolean(d.autoTarget) || list.includes('target');
      return { source: autoSource, target: autoTarget };
    };

    const readManualFlags = (edge: Edge): { source: boolean; target: boolean } => {
      const d = asRecord(edge.data);
      if (Array.isArray(d.manualHandleSides)) {
        const list = lowerCaseStringList(d.manualHandleSides);
        return { source: list.includes('source'), target: list.includes('target') };
      }
      if (d.manualHandles === true) return { source: true, target: true };
      const manualHandles = asRecord(d.manualHandles);
      if (Object.keys(manualHandles).length > 0) {
        return {
          source: Boolean(manualHandles.source),
          target: Boolean(manualHandles.target),
        };
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

      const existingSH = normalizeHandle(edge.sourceHandle);
      const existingTH = normalizeHandle(edge.targetHandle);

      const sAbs = getAbsolutePosition(sourceNode);
      const tAbs = getAbsolutePosition(targetNode);
      const sW = finiteCoordinate(sourceNode.measured?.width ?? sourceNode.width ?? sourceNode.style?.width);
      const sH = finiteCoordinate(sourceNode.measured?.height ?? sourceNode.height ?? sourceNode.style?.height);
      const tW = finiteCoordinate(targetNode.measured?.width ?? targetNode.width ?? targetNode.style?.width);
      const tH = finiteCoordinate(targetNode.measured?.height ?? targetNode.height ?? targetNode.style?.height);
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
        data: {
          ...asRecord(edge.data),
          auto: autoList,
          autoSource: nextAuto.source,
          autoTarget: nextAuto.target,
          manualHandles: asRecord(edge.data).manualHandles,
          manualHandleSides: asRecord(edge.data).manualHandleSides,
          _routingMode: routingConfig.mode,
          _generatedType: routingResult.type
        }
      };
    });

    return result;

  }, [enableSmartRouting, routingConfig, nodes, edges]);

  return normalizedEdges;
}
