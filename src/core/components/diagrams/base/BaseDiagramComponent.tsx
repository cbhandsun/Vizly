import React, { useMemo, useEffect, useState, useCallback, memo, useRef } from 'react';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { Node, Edge, NodeTypes, OnNodesChange, OnEdgesChange, NodeChange, EdgeChange, EdgeTypes } from '@xyflow/react';
import BaseReactFlow from '../../shared/BaseReactFlow';
import type { DiagramComponentProps, ResolvedEdgeConfig } from '../../../types/diagram-components';
import CustomNode from '../../custom-nodes/CustomNode';
import TitleGroupNode from '../../custom-nodes/TitleGroupNode';
import SubGroupNode from '../../custom-nodes/SubGroupNode';
import StickyNoteNode from '../../custom-nodes/StickyNoteNode';
import AdvancedCustomEdge from '../../custom-nodes/CustomEdge';
import { AdvancedSmartStepEdge, AdvancedSmartBezierEdge, AdvancedSmartStraightEdge } from '../../custom-edges/AdvancedSmartEdge';
import { StablePathEdge } from '../../custom-edges/StablePathEdge';
import { validateAndFixNodes } from '../../../utils/nodeValidation';
import { ILayoutStrategy } from '../../../strategies/LayoutStrategyManager';
import { LayeredConfigManager } from '../../../config/LayeredConfigManager';
import { diagramConfigManager } from '../../config/DiagramConfig';
import { LayoutStabilityContext } from '../../../context/LayoutStabilityContext';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { prepareBaseDiagramDisplayEdges } from './baseDiagramEdgePreparation';

// Domain Hooks
import { useDiagramStability, calcNodeSignature, calcEdgeSignature } from './hooks/useDiagramStability';
import { useDiagramDragOrchestration } from './hooks/useDiagramDragOrchestration';
import { useDiagramTheming } from './hooks/useDiagramTheming';
import { useDiagramContainerClamp } from './hooks/useDiagramContainerClamp';

const nodeTypes = {
  custom: CustomNode,
  titleGroup: TitleGroupNode,
  subGroup: SubGroupNode,
  'sticky-note': StickyNoteNode,
  system: CustomNode,
  actor: CustomNode,
  process: CustomNode,
  notification: CustomNode,
} as const;

export interface BaseDiagramConfig {
  NODE_WIDTH: number;
  NODE_HEIGHT: number;
  SPACING: { H: number; V: number };
  GROUP_PADDING?: number;
  TITLE_BAR_HEIGHT?: number;
}

export interface BaseDiagramProps extends Omit<DiagramComponentProps, 'config'> {
  id?: string;
  title?: string;
  subtitle?: string;
  config?: Partial<BaseDiagramConfig>;
  nodes: Node[];
  edges: Edge[];
  className?: string;
  style?: React.CSSProperties;
  resolvedEdgeConfig?: ResolvedEdgeConfig;
  edgeMode?: 'advanced-smart' | 'native';
  enableSmartEdges?: boolean;
  fitMode?: 'fitWidthTop' | 'fitAll' | 'none';
  pinFit?: boolean;
  fitPadding?: number;
  minZoom?: number;
  maxZoom?: number;
  showMiniMap?: boolean;
  showControls?: boolean;
  backgroundGridColor?: string;
  miniMapStyle?: React.CSSProperties;
  miniMapZoomable?: boolean;
  fallbackComponent?: React.ReactNode;
  disableZoomCompensation?: boolean;
  layoutStrategy?: ILayoutStrategy | string;
  nodeLayoutStrategy?: string;
  fitTriggerKey?: string | number;
  interactionPreset?: 'default' | 'zoom' | 'zoomWithDoubleClick' | 'pan' | 'view';
  panOnDrag?: boolean;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  zoomOnDoubleClick?: boolean;
  panOnScroll?: boolean;
  preventScrolling?: boolean;
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  disablePostEdgeProcessing?: boolean;
  onNodesChange?: OnNodesChange;
  onEdgesChange?: OnEdgesChange;
  deleteKeyCode?: string | string[] | null;
}

export const BaseDiagramComponent: React.FC<BaseDiagramProps> = memo(({
  id,
  title,
  subtitle,
  config: _customConfig,
  nodes = [],
  edges = [],
  edgeMode: edgeModeProp,
  resolvedEdgeConfig,
  className = 'diagram-content',
  style,
  miniMapPannable,
  miniMapZoomable,
  miniMapStyle,
  interactionPreset = 'default',
  panOnDrag: panOnDragProp,
  zoomOnScroll: zoomOnScrollProp,
  zoomOnPinch: zoomOnPinchProp,
  zoomOnDoubleClick: zoomOnDoubleClickProp,
  panOnScroll: panOnScrollProp,
  preventScrolling: preventScrollingProp,
  nodesDraggable: nodesDraggableProp,
  nodesConnectable: nodesConnectableProp,
  elementsSelectable: elementsSelectableProp,
  fitTriggerKey: baseFitTriggerKey,
  enableSmartEdges: enableSmartEdgesProp,
  onNodesChange: onNodesChangeProp,
  onEdgesChange: onEdgesChangeProp,
  disablePostEdgeProcessing,
  nodeLayoutStrategy,
  layoutStrategy,
  ...props
}) => {
  // 受控状态
  const [rfNodes, setRfNodes] = useState<Node[]>(validateAndFixNodes(nodes));
  const [rfEdges, setRfEdges] = useState<Edge[]>(edges);
  const latestEdgesRef = useRef<Edge[]>(edges);
  const centeredGroupsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    latestEdgesRef.current = edges;
  }, [edges]);

  // 统一交互配置
  const resolvedInteractions = useMemo(() => {
    const preset: Record<string, boolean> = {};
    switch (interactionPreset) {
      case 'zoom':
        Object.assign(preset, { zoomOnScroll: true, zoomOnDoubleClick: false, panOnScroll: false, panOnDrag: true, preventScrolling: true, nodesDraggable: true, elementsSelectable: true });
        break;
      case 'zoomWithDoubleClick':
        Object.assign(preset, { zoomOnScroll: true, zoomOnDoubleClick: true, panOnScroll: false, panOnDrag: true, preventScrolling: true, nodesDraggable: true, elementsSelectable: true });
        break;
      case 'pan':
        Object.assign(preset, { zoomOnScroll: false, zoomOnDoubleClick: false, panOnScroll: true, panOnDrag: true, preventScrolling: true, nodesDraggable: true, elementsSelectable: true });
        break;
      case 'view':
        Object.assign(preset, { zoomOnScroll: false, zoomOnDoubleClick: false, panOnScroll: false, panOnDrag: false, preventScrolling: false, nodesDraggable: false, elementsSelectable: true });
        break;
    }
    return {
      panOnDrag: panOnDragProp ?? preset.panOnDrag,
      zoomOnScroll: zoomOnScrollProp ?? preset.zoomOnScroll,
      zoomOnPinch: zoomOnPinchProp,
      zoomOnDoubleClick: zoomOnDoubleClickProp ?? preset.zoomOnDoubleClick,
      panOnScroll: panOnScrollProp ?? preset.panOnScroll,
      preventScrolling: preventScrollingProp ?? preset.preventScrolling,
      nodesDraggable: nodesDraggableProp ?? preset.nodesDraggable,
      nodesConnectable: nodesConnectableProp,
      elementsSelectable: elementsSelectableProp ?? preset.elementsSelectable,
    };
  }, [interactionPreset, panOnDragProp, zoomOnScrollProp, zoomOnPinchProp, zoomOnDoubleClickProp, panOnScrollProp, preventScrollingProp, nodesDraggableProp, nodesConnectableProp, elementsSelectableProp]);

  // 获取 edgeMode
  const edgeMode = useMemo(() => {
    if (resolvedEdgeConfig) return resolvedEdgeConfig.mode;
    if (edgeModeProp) return edgeModeProp;
    if (disablePostEdgeProcessing) return 'native';
    const fromLayered = (() => {
      try {
        return String(LayeredConfigManager.getInstance().get<string>('diagram.edge.mode', '') || '').toLowerCase();
      } catch { return ''; }
    })();
    if (fromLayered === 'advanced-smart' || fromLayered === 'native') return fromLayered as 'advanced-smart' | 'native';
    const fromCfg = (() => {
      try { return String((diagramConfigManager.getConfig() as any)?.edge?.mode ?? '').toLowerCase(); } catch { return ''; }
    })();
    if (fromCfg === 'advanced-smart' || fromCfg === 'native') return fromCfg as 'advanced-smart' | 'native';
    for (const e of rfEdges) {
      const t = String(e.type || '').toLowerCase();
      const p = (() => {
        const d = (e as any)?.data;
        const raw = (d && typeof d === 'object' ? (d as any).pathType : undefined) ?? (e as any)?.pathType ?? '';
        return String(raw || '').toLowerCase();
      })();
      if (t.startsWith('advanced-smart') || t.startsWith('smart-') || t === 'smart') return 'advanced-smart';
      if (p && (p.startsWith('smart') || p.includes('smart'))) return 'advanced-smart';
    }
    return 'native';
  }, [disablePostEdgeProcessing, edgeModeProp, resolvedEdgeConfig, rfEdges]);

  // Hook 1: Stability
  const { isLayoutStable, setIsLayoutStable, layoutEpoch, changedNodeIdsRef, fitTriggerKey } = useDiagramStability({
      rfNodes,
      rfEdges,
      layoutStrategy,
      nodeLayoutStrategy,
      latestEdgesRef,
      setRfEdges,
      edgeMode,
      baseFitTriggerKey
  });

  // Hook 2: Drag Orchestration
  const { dragUpdateCounter, draggingNodeIds, handleNodeDrag, handleNodeDragStop } = useDiagramDragOrchestration({
      rfNodes
  });

  // Hook 3: Theming
  const { theme, themedNodes } = useDiagramTheming({
      rfNodes,
      resolvedNodesDraggable: resolvedInteractions.nodesDraggable ?? false
  });

  // Hook 4: Container Clamp
  useDiagramContainerClamp({ rfNodes, setRfNodes });

  const effectiveEnableSmartEdges = useMemo(
    () => enableSmartEdgesProp ?? (!disablePostEdgeProcessing && edgeMode === 'advanced-smart'),
    [disablePostEdgeProcessing, edgeMode, enableSmartEdgesProp],
  );

  // 原有: 受控节点同步
  useEffect(() => {
    Promise.resolve().then(() => setIsLayoutStable(false));
    const newNodes = validateAndFixNodes(nodes);
    centeredGroupsRef.current.clear();
    Promise.resolve().then(() => {
      setRfNodes(prev => {
        const prevSig = calcNodeSignature(prev as any[]);
        const nextSig = calcNodeSignature(newNodes as any[]);
        if (prevSig === nextSig) return prev;

        const prevMap = new Map(prev.map(n => [n.id, n]));
        const changedIds: string[] = [];
        for (const n of newNodes) {
          const old = prevMap.get(n.id);
          if (!old) { changedIds.push(n.id); continue; }
          const nAbs = (n as any)?.computed?.positionAbsolute ?? (n as any)?.positionAbsolute ?? n.position;
          const oAbs = (old as any)?.computed?.positionAbsolute ?? (old as any)?.positionAbsolute ?? old.position;
          if (Math.round(nAbs?.x ?? 0) !== Math.round(oAbs?.x ?? 0) || Math.round(nAbs?.y ?? 0) !== Math.round(oAbs?.y ?? 0)) {
            changedIds.push(n.id);
          }
        }
        const newIdSet = new Set(newNodes.map(n => n.id));
        for (const old of prev) {
          if (!newIdSet.has(old.id)) changedIds.push(old.id);
        }

        const idsToNotify = changedIds.length > 0 ? changedIds : newNodes.map(n => n.id);
        EdgeRoutingCoordinator.getInstance().notifyGraphChange(idsToNotify);
        EdgeRoutingCoordinator.getInstance().markNodesChanged(idsToNotify);

        return newNodes;
      });
    });
  }, [nodes, setIsLayoutStable]);

  // 原有: 受控边同步
  useEffect(() => {
    Promise.resolve().then(() => {
      setRfEdges(prev => {
        const prevSig = calcEdgeSignature(prev as any[]);
        const nextSig = calcEdgeSignature(edges as any[]);
        if (prevSig !== nextSig) {
          EdgeRoutingCoordinator.getInstance().initializeEdges(edges);
          return edges;
        }
        return prev;
      });
    });
  }, [edges]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      for (const c of changes) {
        if (c.type !== 'dimensions') continue;
        const id = (c as any).id as string | undefined;
        if (!id || !id.startsWith('titlegroup-')) continue;
        if (centeredGroupsRef.current.has(id)) continue;
        const dim = (c as any).dimensions as { width?: number; height?: number } | undefined;
        if (!dim?.width) continue;
        const idx = updated.findIndex(n => n.id === id);
        if (idx === -1) continue;
        const node = updated[idx] as any;
        const styleW = typeof node.style?.width === 'number' ? node.style.width : 0;
        if (styleW <= 0 || dim.width <= styleW + 1) continue;
        const expansion = dim.width - styleW;
        const shiftLeft = Math.round(expansion / 2);
        if (shiftLeft < 2) continue;
        const oldX = typeof node.position?.x === 'number' ? node.position.x : 0;
        const oldY = typeof node.position?.y === 'number' ? node.position.y : 0;
        centeredGroupsRef.current.add(id);
        updated[idx] = {
          ...node,
          position: { x: oldX - shiftLeft, y: oldY },
        };
      }
      return updated;
    });

    const changedNodeIds = changes.reduce<string[]>((acc, change) => {
      const id = (change as any).id as string | undefined;
      if (!id) return acc;
      if (change.type === 'position') {
        if ((change as any).position) acc.push(id);
        return acc;
      }
      if (change.type === 'dimensions') {
        acc.push(id);
      }
      return acc;
    }, []);

    if (changedNodeIds.length > 0) {
      for (const id of changedNodeIds) changedNodeIdsRef.current.add(id);
      EdgeRoutingCoordinator.getInstance().markNodesChanged(changedNodeIds);
    }
    onNodesChangeProp?.(changes);
  }, [onNodesChangeProp, changedNodeIdsRef]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
    onEdgesChangeProp?.(changes);
  }, [onEdgesChangeProp]);

  // 边类型定义
  const edgeTypes = useMemo((): EdgeTypes => ({
    default: AdvancedCustomEdge,
    advancedCustomEdge: AdvancedCustomEdge,
    step: AdvancedCustomEdge,
    bezier: AdvancedCustomEdge,
    straight: AdvancedCustomEdge,
    smoothstep: AdvancedCustomEdge,
    smart: AdvancedSmartStepEdge,
    'smart-step': AdvancedSmartStepEdge,
    'smart-bezier': AdvancedSmartBezierEdge,
    'smart-straight': AdvancedSmartStraightEdge,
    'advanced-smart': AdvancedSmartStepEdge,
    'advanced-smart-step': AdvancedSmartStepEdge,
    'advanced-smart-bezier': AdvancedSmartBezierEdge,
    'advanced-smart-straight': AdvancedSmartStraightEdge,
    stablePath: StablePathEdge,
  }), []);

  const displayInputEdges = useMemo(
    () => prepareBaseDiagramDisplayEdges(rfEdges),
    [rfEdges],
  );
  const displayEdges = useMemo(
    () => displayInputEdges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        _dragUpdate: dragUpdateCounter,
        _draggingNodeIds: draggingNodeIds,
        _layoutEpoch: layoutEpoch,
      },
    })),
    [displayInputEdges, dragUpdateCounter, draggingNodeIds, layoutEpoch],
  );

  if (!theme) return <div>Loading theme...</div>;

  const containerId = id ? `diagram-${id}` : undefined;

  return (
    <div
      id={containerId}
      className={`${className || ''} diagram-component-root`}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: theme?.diagram?.canvas?.background ?? '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style
      }}
    >
      {title && (
        <h1 style={{
          textAlign: 'center',
          color: theme?.palette?.neutral?.text ?? '#333333',
          fontFamily: (typeof theme?.typography?.fontFamily === 'string' ? theme.typography.fontFamily : 'Inter, system-ui, sans-serif'),
          fontWeight: theme?.typography?.fontWeight?.semibold ?? 600,
          fontSize: theme?.typography?.fontSize?.lg ?? 18,
          margin: 0,
          padding: '10px',
          backgroundColor: theme?.diagram?.canvas?.background ?? '#ffffff',
          flexShrink: 0
        }}>
          {title}
        </h1>
      )}
      {subtitle && (
        <p style={{
          textAlign: 'center',
          color: theme?.palette?.neutral?.text ?? '#555555',
          fontFamily: (typeof theme?.typography?.fontFamily === 'string' ? theme.typography.fontFamily : 'Inter, system-ui, sans-serif'),
          fontWeight: theme?.typography?.fontWeight?.normal ?? 400,
          fontSize: theme?.typography?.fontSize?.md ?? 14,
          margin: 0,
          padding: '0 12px 8px 12px',
          backgroundColor: theme?.diagram?.canvas?.background ?? '#ffffff',
          flexShrink: 0
        }}>
          {subtitle}
        </p>
      )}
      <div style={{
        flex: 1,
        margin: '10px',
        overflow: 'hidden',
        backgroundColor: theme?.mode === 'dark' ? '#1a1a1e' : '#fcfcfd',
        border: `1px solid ${theme?.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
        borderRadius: '20px',
        boxShadow: theme?.mode === 'dark'
          ? '0 20px 50px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)'
          : '0 20px 50px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02)',
      }}>
        <LayoutStabilityContext.Provider value={isLayoutStable}>
          <BaseReactFlow
            {...props}
            disableZoomCompensation={props.disableZoomCompensation}
            nodes={themedNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes as unknown as NodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            miniMapPannable={miniMapPannable}
            miniMapZoomable={miniMapZoomable}
            miniMapStyle={miniMapStyle}
            backgroundGridColor={theme?.diagram?.canvas?.grid?.color}
            panOnDrag={resolvedInteractions.panOnDrag}
            zoomOnScroll={resolvedInteractions.zoomOnScroll}
            zoomOnPinch={resolvedInteractions.zoomOnPinch}
            zoomOnDoubleClick={resolvedInteractions.zoomOnDoubleClick}
            panOnScroll={resolvedInteractions.panOnScroll}
            preventScrolling={resolvedInteractions.preventScrolling}
            nodesDraggable={resolvedInteractions.nodesDraggable}
            nodesConnectable={resolvedInteractions.nodesConnectable}
            elementsSelectable={resolvedInteractions.elementsSelectable}
            enableSmartEdges={effectiveEnableSmartEdges}
            fitTriggerKey={fitTriggerKey}
          />
        </LayoutStabilityContext.Provider>
      </div>
    </div>
  );
});

export default BaseDiagramComponent;
