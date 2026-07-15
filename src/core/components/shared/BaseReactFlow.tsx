import React, { useMemo, useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { ReactFlow, Background, BackgroundVariant, Controls, useReactFlow, ReactFlowProvider, EdgeLabelRenderer, useStore, useStoreApi, useUpdateNodeInternals, SelectionMode, ConnectionMode } from '@xyflow/react';
import type {
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  NodeChange,
  EdgeChange,
  Connection,
  ReactFlowInstance,
  ConnectionLineType,
  ConnectionLineComponentProps,
  OnConnectEnd,
  OnConnectStart,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DiagramControlBridge from './DiagramControlBridge';
// 引入智能边样式（函数级注释）
// 目的：确保 .smart-edge 与 .smart-edge.animated 等类样式全局生效（导出/展示一致）
import '../custom-edges/SmartEdgeStyles.css';
import FixedMiniMap from './FixedMiniMap';

import { AdvancedSmartStepEdge, AdvancedSmartBezierEdge, AdvancedSmartStraightEdge } from '../custom-edges/AdvancedSmartEdge';
import { SmartOrthogonalEdge } from '../custom-edges/SmartOrthogonalEdge';
import { ObstacleProvider } from '../custom-edges/ObstacleProvider';
import { diagramConfigManager } from '../config/DiagramConfig';
import { getLastViewport, setLastViewport, getUiScale } from './viewportStore';
import { ElkEdge } from '../custom-edges/ElkEdge'; // 导入 ElkEdge
import { StablePathEdge } from '../custom-edges/StablePathEdge'; // 导入稳定路径边组件
import { enhancedTextMeasurement } from '../../utils/EnhancedTextMeasurement';
import CanvasEdgeLayer from '../layers/CanvasEdgeLayer';
import { CanvasRefEdge } from '../edges/CanvasRefEdge';
import EditableEdge from '../custom-edges/EditableEdge'; // ⭐ Waypoint编辑Edge
import { useSharedTrunks } from '../custom-edges/hooks/useSharedTrunks';
import { SharedTrunkLayer } from '../custom-edges/renderers/SharedTrunkLayer';
import {
  areBaseReactFlowHandlesMeasured,
  refreshBaseReactFlowNodeInternals,
  scheduleBaseReactFlowMountedDomRefresh,
  scheduleBaseReactFlowNodeInternalsRetry,
} from './baseReactFlowNodeInternals';
import {
  createBaseReactFlowExportStateHandlers,
  restoreBaseReactFlowViewportOnInit,
  syncBaseReactFlowZoomClass,
} from './baseReactFlowViewport';
import {
  hasBaseReactFlowRenderableSize,
  scheduleBaseReactFlowContainerReadyUpdate,
} from './baseReactFlowContainerReady';
import {
  areBaseReactFlowInternalNodesReadyForRouting,
  collectBaseReactFlowInternalNodes,
  computeBaseReactFlowInternalNodeGeometrySignature,
  filterBaseReactFlowVisibleNodes,
  mergeBaseReactFlowMeasuredNodes,
  normalizeBaseReactFlowRenderableNodes,
} from './baseReactFlowRenderableNodes';
import {
  computeBaseReactFlowFitViewport,
  computeBaseReactFlowNodeBounds,
  expandBaseReactFlowBoundsForEdges,
  shouldSkipBaseReactFlowMinorResize,
} from './baseReactFlowFitWidthTop';
import { resolveBaseReactFlowFitSchedule } from './baseReactFlowFitSchedule';
import { useBaseReactFlowDisplayRouting } from './useBaseReactFlowDisplayRouting';
import {
  bindBaseReactFlowWheelHandler,
  createBaseReactFlowWheelHandler,
} from './baseReactFlowWheel';
import {
  computeBaseReactFlowAlignGuideLine,
  computeBaseReactFlowRightEdgeGuideLines,
  readBaseReactFlowAlignGuideEnabled,
  readBaseReactFlowRightEdgeGuideFlags,
} from './baseReactFlowOverlayGuides';
import {
  computeBaseReactFlowNodeStructureSignature,
  scheduleBaseReactFlowInitializationReset,
  shouldResetBaseReactFlowInitialization,
} from './baseReactFlowInitialization';
import { createBaseReactFlowMergedEdgeTypes } from './baseReactFlowEdgeTypes';
import {
  readBaseReactFlowFitRatio,
  readBaseReactFlowMaxFitZoom,
} from './baseReactFlowFitConfig';
import {
  computeBaseReactFlowIsLargeGraph,
  createBaseReactFlowDefaultEdgeOptions,
  createBaseReactFlowProOptions,
  detectBaseReactFlowTouchDevice,
  readBaseReactFlowPerformanceConfig,
  readBaseReactFlowZoomSensitivity,
  resolveBaseReactFlowInteractionFlags,
} from './baseReactFlowRuntimeConfig';
import {
  logBaseReactFlowConfigReadFailure,
  logBaseReactFlowEventBindingFailure,
  logBaseReactFlowFitWidthTopFailure,
  logBaseReactFlowOverlayFlagReadFailure,
} from './baseReactFlowLogging';
import { getWindowSearchString } from '../../utils/inputBoundary';


interface BaseReactFlowProps {
  onSelectionChange?: (params: { nodes: Node[]; edges: Edge[] }) => void;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  nodes: Node[];
  edges: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;
  style?: React.CSSProperties;
  className?: string;
  flowClassName?: string;
  fitView?: boolean;
  minZoom?: number;
  maxZoom?: number;
  defaultViewport?: { x: number; y: number; zoom: number; };
  showMiniMap?: boolean;
  showControls?: boolean;
  onNodesChange?: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onConnect?: (params: Connection) => void;
  children?: React.ReactNode;
  fitMode?: 'fitWidthTop' | 'fitAll' | 'none';
  fitPadding?: number;
  pinFit?: boolean; // 是否在尺寸变化时持续应用自适应
  disableZoomCompensation?: boolean; // ⭐ 是否禁用反向缩放补偿（针对只读或不需要精确拖拽的场景）
  /**
   * 触发适配视图的关键字（函数级注释）
   * - 当该值变化且 `fitMode` 为 `fitWidthTop` 时，主动执行一次按宽度适配并顶端对齐
   * - 适用于布局策略切换或外部控制造成的节点位置变化，但节点数量不变的场景
   */
  fitTriggerKey?: string | number;
  miniMapStyle?: React.CSSProperties;
  miniMapZoomable?: boolean;
  miniMapPannable?: boolean;
  onInit?: (instance: ReactFlowInstance<any, any>) => void;
  panOnDrag?: boolean;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  zoomOnDoubleClick?: boolean;
  panOnScroll?: boolean;
  preventScrolling?: boolean;
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  backgroundGridColor?: string;
  backgroundVariant?: BackgroundVariant;
  backgroundGap?: number;
  /** 是否显示背景网格（浏览态）。默认 false，导出期间强制隐藏 */
  showBackgroundGrid?: boolean;
  onNodeDrag?: (event: React.MouseEvent, node: Node, nodes: Node[]) => void;
  onNodeDragStart?: (event: React.MouseEvent, node: Node, nodes: Node[]) => void;
  onNodeDragStop?: (event: React.MouseEvent, node: Node, nodes: Node[]) => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneClick?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneDoubleClick?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneMouseMove?: (event: React.MouseEvent) => void;
  onPaneMouseLeave?: (event: React.MouseEvent) => void;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeDoubleClick?: (event: React.MouseEvent, edge: Edge) => void;
  connectionRadius?: number;
  connectionLineType?: ConnectionLineType;
  connectionLineStyle?: React.CSSProperties;
  connectionLineComponent?: React.ComponentType<ConnectionLineComponentProps>;
  connectionMode?: ConnectionMode;
  onConnectEnd?: OnConnectEnd;
  onConnectStart?: OnConnectStart;
  selectionMode?: SelectionMode;
  snapToGrid?: boolean;
  snapGrid?: [number, number];
  isValidConnection?: (connection: Edge | Connection) => boolean;
  selectionOnDrag?: boolean;
  edgesReconnectable?: boolean;
  reconnectRadius?: number;
  onReconnect?: (oldEdge: Edge, newConnection: Connection) => void;
  onReconnectStart?: (event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent, edge: Edge, handleType: 'source' | 'target') => void;
  onReconnectEnd?: (event: MouseEvent | TouchEvent, edge: Edge) => void;
}

// 模块级常量：避免在组件参数默认值中创建新引用
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };
const DEFAULT_SNAP_GRID: [number, number] = [12, 12];
const DEFAULT_STYLE: React.CSSProperties = {};


const BaseReactFlowInner: React.FC<BaseReactFlowProps> = ({
  nodes = [],
  edges = [],
  nodeTypes,
  edgeTypes,
  style = DEFAULT_STYLE,
  className = 'diagram-preview-root',
  flowClassName,
  fitView = false,
  minZoom = 0.1,
  maxZoom = 4,
  defaultViewport = DEFAULT_VIEWPORT,
  showMiniMap = true,
  showControls = true,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onSelectionChange,
  onViewportChange,
  children,
  onInit,
  fitMode = 'fitWidthTop',
  fitPadding = 16,
  pinFit = true,
  fitTriggerKey,
  miniMapStyle,
  miniMapZoomable = true,
  miniMapPannable = true,
  disableZoomCompensation = false, // ⭐ 从 props 中解构出 disableZoomCompensation
  panOnDrag = true,
  /**
   * 函数级注释：默认启用滚轮缩放
   * 说明：满足“所有架构图支持拖动与鼠标放大缩小”的需求
   */
  zoomOnScroll = true,
  zoomOnPinch = true,
  zoomOnDoubleClick = false, // 减少双击事件监听器
  panOnScroll = false,
  preventScrolling = undefined, // To be auto-detected if not provided
  nodesDraggable = true,
  nodesConnectable = true,
  elementsSelectable = true,
  enableSmartEdges = false,
  smartEdgePadding = 20,
  backgroundGridColor,
  backgroundVariant = BackgroundVariant.Dots,
  backgroundGap = 20,
  showBackgroundGrid = false,
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  onPaneClick,
  onPaneDoubleClick,
  onPaneMouseMove,
  onPaneMouseLeave,
  onNodeClick,
  onEdgeClick,
  onEdgeDoubleClick,
  connectionRadius = 20,
  connectionLineType,
  connectionLineStyle,
  connectionLineComponent,
  connectionMode,
  onConnectEnd,
  onConnectStart,
  selectionMode = SelectionMode.Partial,
  snapToGrid = true,
  snapGrid = DEFAULT_SNAP_GRID,
  isValidConnection,
  selectionOnDrag = false,
  edgesReconnectable,
  _reconnectRadius = 0,
  onReconnect,
  onReconnectStart,
  onReconnectEnd,
}: BaseReactFlowProps) => {
  const rfInstance = useReactFlow();
  const rfStore = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [hasInitialized, setHasInitialized] = useState(false);
  const sharedTrunks = useSharedTrunks();

  // 全局滚轮灵敏度（函数级注释）：从配置系统读取，用于主画布自定义缩放
  const globalSensitivity = useMemo(() => {
    return readBaseReactFlowZoomSensitivity({
      readConfig: () => diagramConfigManager.getConfig(),
      onReadFailure: (error) => logBaseReactFlowConfigReadFailure('canvas.zoom.sensitivity', error),
    });
  }, []);
  // Mobile detection
  const isTouchDevice = useMemo(() => {
    return typeof window !== 'undefined' && detectBaseReactFlowTouchDevice({
      hasTouchStart: 'ontouchstart' in window,
      maxTouchPoints: navigator.maxTouchPoints,
    });
  }, []);

  const [isMobileScreen, setIsMobileScreen] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobileScreen(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const {
    effectivePreventScrolling,
    effectivePanOnScroll,
  } = resolveBaseReactFlowInteractionFlags({
    preventScrolling,
    panOnScroll,
    panOnDrag,
    isTouchDevice,
    isMobileScreen,
  });

  // 新增：容器就绪防抖状态
  const [isContainerReady, setIsContainerReady] = useState(false);
  const readyTimeoutRef = useRef<number | null>(null);

  // 用于跟踪节点变化的引用
  const prevNodesRef = useRef<Node[]>([]);
  const prevNodesSigRef = useRef<string>('');
  const prevBBox = useRef<any>(null);
  const prevContainer = useRef<any>(null);
  const cooldownUntil = useRef<number>(0);
  const lastZoomRef = useRef<number | null>(null);
  const initAtRef = useRef<number>(0);
  // 跟踪上一次的触发key，用于区分被动更新与主动触发
  const lastFitTriggerKeyRef = useRef(fitTriggerKey);

  const performanceConfig = useMemo(() => {
    return readBaseReactFlowPerformanceConfig({
      readConfig: () => diagramConfigManager.getConfig(),
      onReadFailure: (error) => logBaseReactFlowConfigReadFailure('performance', error),
    });
  }, []);

  const renderNodes = useMemo(() => (
    normalizeBaseReactFlowRenderableNodes(nodes)
  ), [nodes]);

  const visibleNodes = useMemo(() => (
    filterBaseReactFlowVisibleNodes(renderNodes)
  ), [renderNodes]);
  const visibleNodeIds = useMemo(() => visibleNodes.map(node => node.id), [visibleNodes]);
  const internalNodeGeometrySignature = useStore(useCallback((state: any) => (
    computeBaseReactFlowInternalNodeGeometrySignature(visibleNodeIds, state.nodeLookup)
  ), [visibleNodeIds]));
  const internalFlowNodes = useMemo(() => collectBaseReactFlowInternalNodes(
    visibleNodeIds,
    (rfStore.getState() as any).nodeLookup,
  ), [visibleNodeIds, internalNodeGeometrySignature, rfStore]);
  const routingNodes = useMemo(() => (
    mergeBaseReactFlowMeasuredNodes(visibleNodes, internalFlowNodes)
  ), [visibleNodes, internalFlowNodes]);

  const isLargeGraph = useMemo(() => {
    return computeBaseReactFlowIsLargeGraph({
      nodeCount: visibleNodes.length,
      edgeCount: edges.length,
      performanceConfig,
    });
  }, [visibleNodes.length, edges.length, performanceConfig]);

  const routingGeometryReady = useMemo(() => (
    isLargeGraph || areBaseReactFlowInternalNodesReadyForRouting(
      visibleNodeIds,
      (rfStore.getState() as any).nodeLookup,
    )
  ), [internalNodeGeometrySignature, isLargeGraph, rfStore, visibleNodeIds]);

  /**
   * 启用 React Flow 虚拟化选项（函数级注释）
   * 目的：仅渲染可视区域内的元素，降低大图场景下的 DOM 与绘制开销。
   * 行为：在所有场景开启 `onlyRenderVisibleElements`，与自定义滚轮缩放兼容。
   */
  const proOptions = useMemo(() => ({
    ...createBaseReactFlowProOptions({
      isLargeGraph,
    }),
  }), [isLargeGraph]);

  // 稳定 defaultEdgeOptions 引用，避免 StoreUpdater 每帧 setState 导致无限循环
  const defaultEdgeOptions = useMemo(() => ({
    ...createBaseReactFlowDefaultEdgeOptions({
      isLargeGraph,
    }),
  }), [isLargeGraph]);

  // 稳定 ReactFlow style prop 引用
  const reactFlowStyle = useMemo(() => ({ ...style }), [style]);

  // 监听容器尺寸变化
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // 自定义主画布滚轮缩放逻辑（函数级注释）
  // - 当 zoomOnScroll 为 true 时，接管 wheel 事件，应用全局灵敏度并以光标为锚点缩放
  // - 禁用 ReactFlow 内置 zoomOnScroll，以避免重复处理
  useEffect(() => {
    if (!zoomOnScroll) return;
    if (!containerRef.current) return;

    const pane: HTMLElement | null = (containerRef.current.querySelector?.('.react-flow__pane') as HTMLElement | null) || containerRef.current;
    if (!pane) return;

    const wheelHandler = createBaseReactFlowWheelHandler({
      preventScrolling: effectivePreventScrolling,
      minZoom,
      maxZoom,
      sensitivity: globalSensitivity,
      pane,
      rfInstance,
    });

    const unbind = bindBaseReactFlowWheelHandler({
      pane,
      wheelHandler: wheelHandler as EventListener,
      onPassiveBindFailure: (error) => logBaseReactFlowEventBindingFailure('bindWheelHandlerPassive', error),
    });

    return () => {
      try {
        unbind();
      } catch (error) {
        logBaseReactFlowEventBindingFailure('unbindWheelHandler', error);
      }
    };
  }, [zoomOnScroll, rfInstance, globalSensitivity, effectivePreventScrolling, minZoom, maxZoom]);

  // 监听节点变化，重置初始化状态（仅在节点集合结构变化时重置）
  useEffect(() => {
    const currentSig = computeBaseReactFlowNodeStructureSignature(renderNodes);
    const prevSig = prevNodesSigRef.current;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    if (shouldResetBaseReactFlowInitialization({
      currentSignature: currentSig,
      previousSignature: prevSig,
      nodeCount: visibleNodes.length,
    })) {
      resetTimer = scheduleBaseReactFlowInitializationReset({
        setHasInitialized,
        prevBBoxRef: prevBBox,
        prevContainerRef: prevContainer,
        cooldownUntilRef: cooldownUntil,
        lastZoomRef,
        initAtRef,
      });
    }

    prevNodesRef.current = [...renderNodes];
    prevNodesSigRef.current = currentSig;
    return () => {
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [renderNodes, visibleNodes.length]);

  // 执行fitWidthTop的核心逻辑 - 复用回到顶部的逻辑
  /**
   * 执行按宽度适配并顶端对齐（fitWidthTop）
   *
   * 设计要点：
   * - 基于当前节点集合计算内容包围盒，考虑边线宽与标签的外扩影响
   * - 按容器可用宽度计算缩放比例，并顶端对齐（Y方向）
   * - 冷却期：避免在短时间内频繁执行导致视图抖动
   * - 降缩保护：在已初始化后避免缩放比过度降低，仅重新对齐位置
   * - 轻微尺寸抖动旁路：容器尺寸微小变化时跳过执行（<≈4px），减少不必要的重算
   */
  const performFitWidthTop = useCallback((force?: boolean) => {
    if (!rfInstance || containerSize.width <= 0 || containerSize.height <= 0) {
      return false;
    }

    const now = Date.now();
    if (!force && now < cooldownUntil.current) {
      return false;
    }

    // 轻微尺寸变动跳过：当已初始化且容器尺寸仅发生微小变化时不触发适配，避免抖动
    // 若强制触发 (force=true) 则跳过此优化
    if (!force && hasInitialized && shouldSkipBaseReactFlowMinorResize({
      currentSize: containerSize,
      previousSize: prevContainer.current,
      nodeCount: visibleNodes.length || 0,
    })) {
        return false;
    }

    try {
      const currentNodes = rfInstance.getNodes();
      if (currentNodes.length === 0) {
        return false;
      }

      const nodeBounds = computeBaseReactFlowNodeBounds(currentNodes);
      if (!nodeBounds) {
        return false;
      }

      const expandedBounds = expandBaseReactFlowBoundsForEdges({
        bounds: nodeBounds,
        // Fit must stay anchored to source graph data. Display-only edge routing may
        // swap in later and should never pull the viewport or make the layout look reflowed.
        edges,
      });

      // 复用回到顶部的缩放和位置计算逻辑
      const padding = Math.max(0, fitPadding ?? 16); // 使用传入的 fitPadding

      // 获取全局配置的适配比例，优先从 URL 读取 fitRatio 参数方便调试
      const fitRatio = readBaseReactFlowFitRatio({
        search: getWindowSearchString(),
        readConfig: () => diagramConfigManager.getConfig(),
        onReadFailure: (error) => logBaseReactFlowConfigReadFailure('canvas.zoom.fitRatio', error),
      });

      // 获取自适应专用的最大放大系数（防止初始化或全景缩放时，小数量节点被放大成了“巨无霸”）
      // 限制最大自适应缩放为 1.0，以保证小图表字号与UI体系协调
      const maxFitZoom = readBaseReactFlowMaxFitZoom({
        readConfig: () => diagramConfigManager.getConfig(),
        onReadFailure: (error) => logBaseReactFlowConfigReadFailure('canvas.zoom.maxFitZoom', error),
      });

      const { x, y, zoom } = computeBaseReactFlowFitViewport({
        bounds: expandedBounds,
        containerSize,
        fitPadding: padding,
        fitRatio,
        maxFitZoom,
        minZoom,
        maxZoom,
        hasInitialized,
        lastZoom: lastZoomRef.current,
        force,
        previousContainer: prevContainer.current,
      });

      // 应用视口变换
      rfInstance.setViewport({ x, y, zoom }, { duration: hasInitialized ? 300 : 0 });

      // 更新记录
      lastZoomRef.current = zoom;
      prevBBox.current = expandedBounds;
      prevContainer.current = { ...containerSize };

      // 设置冷却期，避免频繁调用（自适应）
      // 已初始化后随节点数量适度增加冷却时长，范围约 300–1000ms
      const adaptiveCooldown = hasInitialized ? Math.min(1000, 300 + Math.min(visibleNodes.length, 700)) : 120;
      cooldownUntil.current = Date.now() + adaptiveCooldown;

      if (!hasInitialized) {
        setHasInitialized(true);
      }

      return true;
    } catch (error) {
      logBaseReactFlowFitWidthTopFailure(error);
      return false;
    }
  }, [rfInstance, containerSize, visibleNodes.length, edges, maxZoom, minZoom, hasInitialized, fitPadding]);

  // 统一视口适配逻辑（P2 Optimization - Refactored & Unified）
  /**
   * 统一自适应触发器：整合 fitWidthTop 与 fitAll 的防抖逻辑
   * 
   * 策略：
   * 1. 区分“主动触发”（fitTriggerKey 变化）与“被动更新”（容器/节点变化）。
   * 2. 主动触发：使用短防抖（如 50-100ms），响应迅速。
   * 3. 被动更新：
   *    - 若 pinFit=false，仅在初始化或尺寸显著变化时触发；
   *    - 若 pinFit=true，持续响应变化，使用自适应或标准防抖。
   * 4. 兼容 fitMode='fitAll'，虽然主要针对 fitWidthTop。
   */
  useEffect(() => {
    const schedulePlan = resolveBaseReactFlowFitSchedule({
      fitMode,
      hasInstance: Boolean(rfInstance),
      nodeCount: visibleNodes.length,
      fitTriggerKey,
      lastFitTriggerKey: lastFitTriggerKeyRef.current,
      pinFit,
      hasInitialized,
      containerSize,
      previousContainer: prevContainer.current,
      defaultDebounceMs: performanceConfig?.debounceMs ?? 100,
    });

    if (!schedulePlan.shouldSchedule) return;

    const timeoutId = setTimeout(() => {
      if (fitMode === 'fitWidthTop') {
        performFitWidthTop(schedulePlan.isTriggerKeyChanged);
      } else if (fitMode === 'fitAll') {
        rfInstance.fitView({ padding: fitPadding });
        prevContainer.current = { ...containerSize };
        if (!hasInitialized) {
          setHasInitialized(true);
        }
      }

      // 更新状态
      if (schedulePlan.isTriggerKeyChanged) {
        lastFitTriggerKeyRef.current = fitTriggerKey;
      }
    }, schedulePlan.debounceTime);

    return () => clearTimeout(timeoutId);
  }, [
    fitMode,
    rfInstance,
    visibleNodes.length,
    containerSize,
    fitTriggerKey,
    pinFit,
    hasInitialized,
    fitPadding,
    performanceConfig,
    performFitWidthTop,
  ]);

  // 合并边类型：为了防止已有数据中携带有 'smart' 类字段直接被隐形消失，必须始终将组件挂载！
  const mergedEdgeTypes = useMemo((): EdgeTypes => {
    return createBaseReactFlowMergedEdgeTypes({
      edgeTypes,
      components: {
        advancedSmartStepEdge: AdvancedSmartStepEdge,
        advancedSmartBezierEdge: AdvancedSmartBezierEdge,
        advancedSmartStraightEdge: AdvancedSmartStraightEdge,
        smartOrthogonalEdge: SmartOrthogonalEdge,
        elkEdge: ElkEdge,
        stablePathEdge: StablePathEdge,
        canvasRefEdge: CanvasRefEdge,
        editableEdge: EditableEdge,
      },
    });
  }, [edgeTypes]);

  const displayEdges = useBaseReactFlowDisplayRouting({
    edges,
    routingNodes,
    routingGeometryReady,
    isContainerReady,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
  });

  const nodeInternalsRefreshKey = useMemo(() => {
    return visibleNodes.map((node) => {
      const measured = (node as any).measured;
      const width = measured?.width ?? node.width ?? (node.style as any)?.width ?? '';
      const height = measured?.height ?? node.height ?? (node.style as any)?.height ?? '';
      return `${node.id}:${node.position?.x ?? 0}:${node.position?.y ?? 0}:${width}:${height}`;
    }).join('|');
  }, [visibleNodes]);

  useEffect(() => {
    if (visibleNodes.length === 0) return;
    const nodeIds = visibleNodes.map(node => node.id);
    const refresh = () => {
      refreshBaseReactFlowNodeInternals({
        container: containerRef.current,
        nodeIds,
        rfStore,
        updateNodeInternals,
      });
    };
    const allRenderableHandlesMeasured = () => {
      return areBaseReactFlowHandlesMeasured({
        container: containerRef.current,
        nodeIds,
        rfStore,
      });
    };
    return scheduleBaseReactFlowNodeInternalsRetry({
      refresh,
      areHandlesMeasured: allRenderableHandlesMeasured,
    });
  }, [visibleNodes, nodeInternalsRefreshKey, updateNodeInternals, rfStore]);

  useEffect(() => {
    if (visibleNodes.length === 0) return;
    const nodeIds = visibleNodes.map(node => node.id);
    const refreshFromMountedDom = () => {
      refreshBaseReactFlowNodeInternals({
        container: containerRef.current,
        nodeIds,
        rfStore,
        updateNodeInternals,
      });
    };
    return scheduleBaseReactFlowMountedDomRefresh({
      refresh: refreshFromMountedDom,
    });
  }, [visibleNodes, rfStore, updateNodeInternals]);

  /**
   * 函数级注释：导出期间隐藏背景网格
   * 实现：监听导出全局事件（diagramExportStart/Complete/Error），在导出窗口期不渲染 <Background>
   * 目的：确保 PNG/SVG/PDF/GIF 导出不包含 React Flow 的网格点背景
   */
  const [hideBackgroundDuringExport, setHideBackgroundDuringExport] = useState(false);
  useEffect(() => {
    const { onStart, onStop } = createBaseReactFlowExportStateHandlers({
      setHidden: setHideBackgroundDuringExport,
    });
    window.addEventListener('diagramExportStart', onStart as any);
    window.addEventListener('diagramExportComplete', onStop as any);
    window.addEventListener('diagramExportError', onStop as any);
    return () => {
      window.removeEventListener('diagramExportStart', onStart as any);
      window.removeEventListener('diagramExportComplete', onStop as any);
      window.removeEventListener('diagramExportError', onStop as any);
    };
  }, []);

  // AlignGuide、RightEdgeGuides 已提取为文件级独立组件（见 BaseReactFlowInner 函数之后）

  // 处理初始化
  const handleInit = useCallback((instance: ReactFlowInstance<any, any>) => {
    restoreBaseReactFlowViewportOnInit({
      instance,
      fitMode,
      lastViewport: getLastViewport(),
    });

    if (onInit) {
      onInit(instance);
    }
  }, [onInit, fitMode]);

  // 处理视口变化
  /**
   * 视口变化处理：将最新视口广播到 viewportStore
   *
   * 目的：
   * - 驱动 FixedMiniMap 的可视区域矩形实时更新
   * - 提供一个全局的最近视口状态，便于需要时恢复
   */
  const handleViewportChange = useCallback((viewport: { x: number; y: number; zoom: number }) => {
    // 始终广播最新视口，以驱动 minimap 可视区域矩形实时更新
    setLastViewport(viewport);

    // Semantic Zoom Feature: 动态追加 CSS 类名以进行子树 DOM 降级
    syncBaseReactFlowZoomClass({
      container: containerRef.current,
      viewport,
    });

    if (onViewportChange) {
      onViewportChange(viewport);
    }
  }, [onViewportChange]);

  /**
   * 计算并更新容器就绪状态（防抖 & 不可逆门限）
   *
   * 目的：
   * - 防止在初始化期间因尺寸抖动导致 ReactFlow 反复卸载/挂载，引发画布抖动
   * - 一旦“就绪”，不再因临时的 0 尺寸回退为不就绪，保持渲染稳定
   * 策略：
   * - 仅当容器存在有效尺寸时，延迟 120ms 设置为就绪（考虑字体与样式加载）
   * - 当尺寸为 0 时，仅在尚未就绪的状态下设置为不就绪；避免就绪后反向置为 false
   */
  const updateContainerReady = useCallback(() => {
    if (readyTimeoutRef.current) {
      clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
    const liveRect = containerRef.current?.getBoundingClientRect();
    readyTimeoutRef.current = scheduleBaseReactFlowContainerReadyUpdate({
      hasRenderableSize: hasBaseReactFlowRenderableSize({
        containerSize,
        liveRect,
      }),
      isContainerReady,
      setIsContainerReady: (ready) => {
        setIsContainerReady(ready);
        readyTimeoutRef.current = null;
      },
    });
  }, [containerSize, isContainerReady]);

  useEffect(() => {
    updateContainerReady();
    return () => {
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      try {
        enhancedTextMeasurement.dispose?.();
      } catch (error) {
        logBaseReactFlowEventBindingFailure('disposeEnhancedTextMeasurement', error);
      }
    };
  }, [updateContainerReady]);

  // 🎯 CSS zoom 反向补偿：抵消祖先的 zoom: uiScale，使 React Flow 在 zoom=1 空间运作
  // 使用 width/height: 100%（而非 85%），让 ReactFlow 获得完整 CSS 像素空间。
  // 视觉溢出 (~17.6%) 由父容器的 overflow: hidden 裁剪，对交互无影响。
  const rawUiScale = getUiScale();
  const uiScale = disableZoomCompensation ? 1 : rawUiScale;
  const counterZoom = uiScale !== 1 ? (1 / uiScale) : 1;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', ...style }} className={className}>
      <div style={counterZoom !== 1 ? {
        zoom: counterZoom,
        width: '100%',
        height: '100%',
        position: 'relative',
      } : { width: '100%', height: '100%', position: 'relative' }}>
        <ReactFlow
          proOptions={proOptions}
          onlyRenderVisibleElements={isLargeGraph}
          nodes={visibleNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={mergedEdgeTypes} // 使用合并后的边类型
          defaultEdgeOptions={defaultEdgeOptions}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onConnectStart={onConnectStart}
          onSelectionChange={onSelectionChange}
          onInit={handleInit}
          onViewportChange={handleViewportChange}
          fitView={fitView && fitMode === 'fitAll'}
          minZoom={minZoom}
          maxZoom={maxZoom}
          defaultViewport={defaultViewport}
          panOnDrag={panOnDrag}
          zoomOnScroll={false}
          zoomOnPinch={zoomOnPinch}
          zoomOnDoubleClick={zoomOnDoubleClick}
          panOnScroll={effectivePanOnScroll}
          preventScrolling={effectivePreventScrolling}
          nodesDraggable={nodesDraggable}
          nodesConnectable={nodesConnectable}
          elementsSelectable={elementsSelectable}
          connectionLineType={connectionLineType}
          connectionLineStyle={connectionLineStyle}
          connectionLineComponent={connectionLineComponent}
          connectionMode={connectionMode}
          onNodeDrag={onNodeDrag}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={onPaneClick}
          onPaneMouseMove={onPaneMouseMove}
          onPaneMouseLeave={onPaneMouseLeave}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onDoubleClick={(e) => {
            const target = e.target as HTMLElement;
            // 确保只有双击在真正的背景画布上才唤出版面
            // 避免在节点上双击时（想要编辑文字）错乱弹出版面
            if (target.classList.contains('react-flow__pane')) {
              onPaneDoubleClick?.(e);
            }
          }}
          nodeDragThreshold={2}

          selectionMode={selectionMode}
          snapToGrid={snapToGrid}
          snapGrid={snapGrid}
          connectionRadius={connectionRadius}
          isValidConnection={isValidConnection}
          selectionOnDrag={selectionOnDrag}
          edgesReconnectable={edgesReconnectable}
          onReconnect={onReconnect}
          onReconnectStart={onReconnectStart}
          onReconnectEnd={onReconnectEnd}
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={true}
          style={reactFlowStyle}
          className={flowClassName}
        >
          {isLargeGraph && <CanvasEdgeLayer />}
          {!hideBackgroundDuringExport && showBackgroundGrid && (
            <Background
              color={backgroundGridColor}
              variant={backgroundVariant}
              gap={backgroundGap}
            />
          )}
          {showControls && <Controls />}
          {showMiniMap && (
            <FixedMiniMap
              style={miniMapStyle}
              zoomable={miniMapZoomable}
              pannable={miniMapPannable}
            />
          )}
          <DiagramControlBridge />
          <AlignGuide />
          <RightEdgeGuides />
          {children}
          {enableSmartEdges && sharedTrunks.length > 0 && (
            <SharedTrunkLayer trunks={sharedTrunks} />
          )}
        </ReactFlow>
      </div>
      {!isContainerReady && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          color: '#6b7280',
          fontSize: 14,
          background: 'rgba(250, 250, 252, 0.75)',
          backdropFilter: 'saturate(1.1) blur(0.5px)',
          pointerEvents: 'none'
        }}>
          正在初始化画布...
        </div>
      )}
    </div>
  );
};


/**
 * 对齐辅助线渲染（文件级独立组件，避免内联导致的无限循环）
 * - 目的：在画布上显示统一左锚的垂直参考线，便于人工校验域的左对齐
 * - 开关：URL ?alignGuide=1 或 localStorage 'diagram-align-guide'='true'
 */
const AlignGuide: React.FC = () => {
  const nodesStore = useStore((s: any) => s.nodes) as any[];

  const guideEnabled = useMemo(() => {
    return readBaseReactFlowAlignGuideEnabled({
      getSearch: () => getWindowSearchString(),
      getStorageItem: (key) => (typeof window !== 'undefined' ? localStorage.getItem(key) : null),
      onReadFailure: (scope, error) => logBaseReactFlowOverlayFlagReadFailure(scope, error),
    });
  }, []);

  if (!guideEnabled || !Array.isArray(nodesStore) || nodesStore.length === 0) return null;

  const guideLine = computeBaseReactFlowAlignGuideLine(nodesStore);
  if (!guideLine) return null;

  return (
    <EdgeLabelRenderer>
      <div
        key="align-guide-boundary"
        style={{
          position: 'absolute',
          transform: `translate(${guideLine.x}px, ${guideLine.y}px)`,
          width: 0,
          height: guideLine.height,
          borderLeft: '2px dashed #ef4444',
          boxShadow: '0 0 0 1px rgba(239,68,68,0.12)',
          pointerEvents: 'none',
          zIndex: 4,
        }}
        aria-label="align-guide"
        title="左锚参考线"
      />
    </EdgeLabelRenderer>
  );
};

/**
 * 右界辅助线渲染（文件级独立组件，避免内联导致的无限循环）
 * - 目的：显示每个域容器的右缘以及域内容的最大右缘
 * - 开关：URL ?alignGuideRight=1 或 ?alignContentMax=1
 */
const RightEdgeGuides: React.FC = () => {
  const nodesStore = useStore((s: any) => s.nodes) as any[];

  const flags = useMemo(() => {
    return readBaseReactFlowRightEdgeGuideFlags({
      getSearch: () => getWindowSearchString(),
      getStorageItem: (key) => (typeof window !== 'undefined' ? localStorage.getItem(key) : null),
      onReadFailure: (scope, error) => logBaseReactFlowOverlayFlagReadFailure(scope, error),
    });
  }, []);

  if ((!flags.rightLine && !flags.contentLine) || !Array.isArray(nodesStore) || nodesStore.length === 0) return null;

  const overlays = computeBaseReactFlowRightEdgeGuideLines({
    nodes: nodesStore,
    flags,
  });

  return (
    <>
      {overlays.map((overlay) => (
        <EdgeLabelRenderer key={overlay.key}>
          <div
            style={{
              position: 'absolute',
              transform: `translate(${overlay.x}px, ${overlay.y}px)`,
              width: 0,
              height: overlay.height,
              borderLeft: overlay.kind === 'right' ? '2px dashed #60a5fa' : '2px dashed #f59e0b',
              boxShadow: overlay.kind === 'right'
                ? '0 0 0 1px rgba(96,165,250,0.12)'
                : '0 0 0 1px rgba(245,158,11,0.12)',
              pointerEvents: 'none',
              zIndex: 4,
            }}
            aria-label={overlay.kind === 'right' ? 'domain-right-guide' : 'domain-content-max-guide'}
            title={overlay.kind === 'right' ? '域右缘参考线' : '内容最大右缘参考线'}
          />
        </EdgeLabelRenderer>
      ))}
    </>
  );
};

/**
 * BaseReactFlow 包装组件（函数级注释）
 * - 提供 ReactFlowProvider 上下文
 * - 提供 ObstacleProvider 共享障碍物计算（性能优化）
 */
const BaseReactFlow: React.FC<BaseReactFlowProps> = (props) => (
  <ReactFlowProvider>
    <ObstacleProvider>
      <BaseReactFlowInner {...props} />
    </ObstacleProvider>
  </ReactFlowProvider>
);

export default BaseReactFlow;
