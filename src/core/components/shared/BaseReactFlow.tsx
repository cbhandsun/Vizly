/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo, useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { ReactFlow, Background, BackgroundVariant, Controls, useReactFlow, ReactFlowProvider, EdgeLabelRenderer, useStore, SelectionMode, ConnectionMode } from '@xyflow/react';
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
import { ObstacleProvider } from '../custom-edges/ObstacleContext';
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
  reconnectRadius = 0,
  onReconnect,
  onReconnectStart,
  onReconnectEnd,
}: BaseReactFlowProps) => {
  const rfInstance = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [hasInitialized, setHasInitialized] = useState(false);
  const [initAttempts, setInitAttempts] = useState(0);
  const sharedTrunks = useSharedTrunks();

  // 全局滚轮灵敏度（函数级注释）：从配置系统读取，用于主画布自定义缩放
  const globalSensitivity = useMemo(() => {
    try {
      const cfg = diagramConfigManager.getConfig();
      return cfg.canvas?.zoom?.sensitivity ?? 1;
    } catch { return 1; }
  }, []);
  // Mobile detection
  const isTouchDevice = useMemo(() => {
    return typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  }, []);

  const [isMobileScreen, setIsMobileScreen] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobileScreen(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const effectivePreventScrolling = preventScrolling !== undefined ? preventScrolling : (isTouchDevice || isMobileScreen);
  const effectivePanOnScroll = panOnScroll || (isTouchDevice && !panOnDrag);

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
  const initAtRef = useRef<number>(Date.now());
  // 跟踪上一次的触发key，用于区分被动更新与主动触发
  const lastFitTriggerKeyRef = useRef(fitTriggerKey);

  const debugEnabled = useMemo(() => {
    try { const v = localStorage.getItem('architecture-diagram-debug'); return v === '1' || v === 'true'; } catch { return false; }
  }, []);

  const performanceConfig = useMemo(() => {
    try { return diagramConfigManager.getConfig()?.performance || { enableVirtualization: true, batchSize: 50, debounceMs: 100 }; } catch { return { enableVirtualization: true, batchSize: 50, debounceMs: 100 }; }
  }, []);

  const isLargeGraph = useMemo(() => {
    const n = nodes.length;
    const e = edges.length;
    return performanceConfig.enableVirtualization && (n + e) >= Math.max(120, performanceConfig.batchSize * 3);
  }, [nodes.length, edges.length, performanceConfig.enableVirtualization, performanceConfig.batchSize]);

  /**
   * 启用 React Flow 虚拟化选项（函数级注释）
   * 目的：仅渲染可视区域内的元素，降低大图场景下的 DOM 与绘制开销。
   * 行为：在所有场景开启 `onlyRenderVisibleElements`，与自定义滚轮缩放兼容。
   */
  const proOptions = useMemo(() => ({ onlyRenderVisibleElements: true, hideAttribution: true }), []);

  // 稳定 defaultEdgeOptions 引用，避免 StoreUpdater 每帧 setState 导致无限循环
  const defaultEdgeOptions = useMemo(() => ({
    type: 'advanced-smart-step',
    // 恢复正常箭头大小，移除之前的过度补偿
    markerEnd: { type: 'arrowclosed' as const, width: 10, height: 10 },
    style: {
      strokeOpacity: 0.98,
      filter: isLargeGraph ? 'none' : 'drop-shadow(0 0 0.6px rgba(0,0,0,0.35))'
    }
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

    const wheelHandler = (ev: WheelEvent) => {
      if (preventScrolling) {
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
      }

      const minZoomCfg = minZoom;
      const maxZoomCfg = maxZoom;
      const sensitivity = globalSensitivity;

      const viewport = rfInstance.getViewport();
      const rect = pane.getBoundingClientRect();
      const screenX = ev.clientX - rect.left;
      const screenY = ev.clientY - rect.top;
      // 屏幕坐标→世界坐标（逆变换）
      const anchorWorldX = (screenX - viewport.x) / viewport.zoom;
      const anchorWorldY = (screenY - viewport.y) / viewport.zoom;
      // 指数缩放 + 灵敏度
      const normalizedDelta = Math.max(-80, Math.min(80, ev.deltaY));
      const direction = -normalizedDelta; // 向上放大
      const zoomFactor = Math.exp(direction * (0.0025 * sensitivity));
      const targetZoom = Math.max(minZoomCfg, Math.min(maxZoomCfg, viewport.zoom * zoomFactor));
      // 计算新视口，使锚点保持在光标位置
      const targetX = screenX - anchorWorldX * targetZoom;
      const targetY = screenY - anchorWorldY * targetZoom;
      rfInstance.setViewport({ x: targetX, y: targetY, zoom: targetZoom });
    };

    try {
      pane.addEventListener('wheel', wheelHandler, { passive: false });
    } catch {
      pane.addEventListener('wheel', wheelHandler as any);
    }

    return () => {
      try { pane.removeEventListener('wheel', wheelHandler); } catch { void 0; }
    };
  }, [zoomOnScroll, rfInstance, globalSensitivity, preventScrolling, minZoom, maxZoom]);

  // 监听节点变化，重置初始化状态（仅在节点集合结构变化时重置）
  useEffect(() => {
    const currentSig = nodes.map(n => n.id).sort().join('|');
    const prevSig = prevNodesSigRef.current;
    const nodesChanged = currentSig !== prevSig;

    if (nodesChanged && nodes.length > 0) {
      setHasInitialized(false);
      setInitAttempts(0);
      prevBBox.current = null;
      prevContainer.current = null;
      cooldownUntil.current = 0;
      lastZoomRef.current = null;
      initAtRef.current = Date.now();
    }

    prevNodesRef.current = [...nodes];
    prevNodesSigRef.current = currentSig;
  }, [nodes]);

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
    if (!force && hasInitialized && prevContainer.current) {
      const dw = Math.abs(containerSize.width - prevContainer.current.width);
      const dh = Math.abs(containerSize.height - prevContainer.current.height);
      // 自适应“微小尺寸变动跳过”阈值（函数级注释）
      // - 基于容器宽度与节点数量动态计算阈值，范围约 4–10px
      // - 小图更灵敏，大图更保守，降低不必要的重算
      const nodeFactor = Math.min(6, Math.round((nodes.length || 0) / 200));
      const baseThreshold = Math.min(10, Math.max(4, Math.round(containerSize.width * 0.004)));
      const threshold = baseThreshold + nodeFactor;
      const minorDelta = dw <= threshold && dh <= threshold;
      if (minorDelta) {
        return false;
      }
    }

    try {
      const currentNodes = rfInstance.getNodes();
      if (currentNodes.length === 0) {
        return false;
      }

      // 复用回到顶部的核心逻辑：计算内容包围盒
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      currentNodes.forEach((n) => {
        // 添加 NaN 检查和默认值处理，并优先使用 measured 尺寸
        const w = (typeof n.measured?.width === 'number' && isFinite(n.measured.width))
          ? n.measured.width
          : (typeof n.width === 'number' && !isNaN(n.width) && isFinite(n.width))
            ? n.width
            : (typeof n.style?.width === 'number' && !isNaN(n.style.width) && isFinite(n.style.width))
              ? n.style.width
              : 220;
        const h = (typeof n.measured?.height === 'number' && isFinite(n.measured.height))
          ? n.measured.height
          : (typeof n.height === 'number' && !isNaN(n.height) && isFinite(n.height))
            ? n.height
            : (typeof n.style?.height === 'number' && !isNaN(n.style.height) && isFinite(n.style.height))
              ? n.style.height
              : 120;
        const x1 = (typeof n.position?.x === 'number' && !isNaN(n.position.x) && isFinite(n.position.x)) ? n.position.x : 0;
        const y1 = (typeof n.position?.y === 'number' && !isNaN(n.position.y) && isFinite(n.position.y)) ? n.position.y : 0;
        const x2 = x1 + w;
        const y2 = y1 + h;
        if (x1 < minX) minX = x1;
        if (y1 < minY) minY = y1;
        if (x2 > maxX) maxX = x2;
        if (y2 > maxY) maxY = y2;
      });

      // 新增：考虑连线的外扩范围（线宽/标签/智能绕行可能的抬高）
      const currentEdges = rfInstance.getEdges();
      let maxStrokeWidth = 0;
      let hasEdgeLabel = false;
      let hasSmartEdge = false;
      currentEdges.forEach(e => {
        const sw = (typeof e.style?.strokeWidth === 'number' && isFinite(e.style.strokeWidth)) ? Number(e.style.strokeWidth) : 2;
        if (sw > maxStrokeWidth) maxStrokeWidth = sw;
        const label = (e as any)?.data?.label ?? (e as any)?.label;
        if (label) hasEdgeLabel = true;
        const pathType: string = (e.data && typeof e.data === 'object' && (e.data as any).pathType || (e as any).pathType || e.type || '').toString().toLowerCase();
        if (typeof pathType === 'string' && pathType.includes('smart')) hasSmartEdge = true;
      });
      const edgeMargin = Math.max(0, Math.ceil(maxStrokeWidth) + 4);
      const smartExtraY = hasSmartEdge ? 24 : 0;
      const labelExtraY = hasEdgeLabel ? 24 : 0;
      const labelExtraX = hasEdgeLabel ? 16 : 0;

      const minXBound = minX - (edgeMargin + labelExtraX);
      const maxXBound = maxX + (edgeMargin + labelExtraX);
      const minYBound = minY - (edgeMargin + smartExtraY + labelExtraY);
      const maxYBound = maxY + (edgeMargin + labelExtraY);

      // 确保边界框计算结果是有效数字
      const bboxWidth = (isFinite(maxXBound) && isFinite(minXBound)) ? Math.max(1, maxXBound - minXBound) : 1;
      const bboxHeight = (isFinite(maxYBound) && isFinite(minYBound)) ? Math.max(1, maxYBound - minYBound) : 1;

      // 复用回到顶部的缩放和位置计算逻辑
      const padding = Math.max(0, fitPadding ?? 16); // 使用传入的 fitPadding
      const SAFE_TOP = 64; // Vizly Top Control Island Safe Zone
      const SAFE_LEFT = 56; // Vizly Left Tool Island Safe Zone

      // 容器可用宽度需要减去左侧安全区
      const containerWidth = Math.max(1, containerSize.width - SAFE_LEFT - padding * 2);

      // 获取全局配置的适配比例，优先从 URL 读取 fitRatio 参数方便调试
      const fitRatio = (() => {
        try {
          const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
          const urlRatio = parseFloat(qs.get('fitRatio') || '');
          if (!isNaN(urlRatio) && urlRatio > 0 && urlRatio <= 2) return urlRatio;

          return diagramConfigManager.getConfig().canvas.zoom.fitRatio ?? 0.75;
        }
        catch { return 0.75; }
      })();

      // 获取自适应专用的最大放大系数（防止初始化或全景缩放时，小数量节点被放大成了“巨无霸”）
      // 允许图纸可手动放大至 4.0，但对于自动 fit 行为，行业标准通常卡在 1.0 ~ 1.25
      const maxFitZoom = (() => {
        try {
          return diagramConfigManager.getConfig().canvas.zoom.maxFitZoom ?? 1.15;
        } catch { return 1.15; }
      })();

      // 保证可读性的自适应最小缩放防线（解决长/宽图自适应后太小看不清的问题）
      const MIN_FIT_ZOOM = 0.55;

      // 计算按宽度适配的缩放比，并顶端对齐
      // 应用 fitRatio 调整目标宽度，实现"留白"效果（解决 100% 撑满过于拥挤的问题）
      let zoom = Math.max(MIN_FIT_ZOOM, Math.min(maxFitZoom, (containerWidth * fitRatio) / bboxWidth));
      // 双次保障最终的安全边界
      zoom = Math.min(zoom, maxZoom);
      zoom = Math.max(zoom, minZoom);

      // 避免"降缩"：允许重新定位但保持上一次缩放
      // 若 forced=true 或容器变窄（可能由侧边栏打开导致），则跳过此保护，允许缩小以适配
      const isContainerShrinking = prevContainer.current && containerSize.width < prevContainer.current.width * 0.98;

      if (!force && !isContainerShrinking && hasInitialized && lastZoomRef.current && zoom < lastZoomRef.current * 0.95) {
        zoom = lastZoomRef.current;
      }

      // X/Y 计算必须结合 Safe Zone，确保内容完美地避让玻璃 UI 浮岛
      const x = SAFE_LEFT + padding - (minXBound * zoom);
      const y = SAFE_TOP + padding - (minYBound * zoom);

      // 应用视口变换
      rfInstance.setViewport({ x, y, zoom }, { duration: hasInitialized ? 300 : 0 });

      // 更新记录
      lastZoomRef.current = zoom;
      prevBBox.current = { minX: minXBound, minY: minYBound, maxX: maxXBound, maxY: maxYBound, contentWidth: bboxWidth, contentHeight: bboxHeight };
      prevContainer.current = { ...containerSize };

      // 设置冷却期，避免频繁调用（自适应）
      // 已初始化后随节点数量适度增加冷却时长，范围约 300–1000ms
      const adaptiveCooldown = hasInitialized ? Math.min(1000, 300 + Math.min(nodes.length, 700)) : 120;
      cooldownUntil.current = Date.now() + adaptiveCooldown;

      if (!hasInitialized) {
        setHasInitialized(true);
        setInitAttempts(prev => prev + 1);
      }

      return true;
    } catch (error) {
      console.error('PerformFitWidthTop error:', error);
      return false;
    }
  }, [rfInstance, containerSize, nodes, maxZoom, minZoom, hasInitialized, fitPadding]);

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
    // 前置检查
    if (!rfInstance || nodes.length === 0 || fitMode === 'none') return;

    // 判定触发类型
    const isTriggerKeyChanged = fitTriggerKey !== lastFitTriggerKeyRef.current;

    // 如果是被动更新，且 pinFit=false，且已初始化，且容器尺寸变化不显著 -> 跳过
    if (!isTriggerKeyChanged && !pinFit && hasInitialized && prevContainer.current) {
      const dw = Math.abs(containerSize.width - prevContainer.current.width);
      const dh = Math.abs(containerSize.height - prevContainer.current.height);
      const significantDelta = dw > 6 || dh > 6;
      if (!significantDelta) return;
    }

    // 计算防抖时间
    let debounceTime = performanceConfig?.debounceMs ?? 100;
    if (!hasInitialized) {
      // 初始化阶段给予更多缓冲
      debounceTime = 200;
    } else if (isTriggerKeyChanged) {
      // 主动触发，响应稍快但仍需防抖以等待布局稳定
      debounceTime = Math.min(debounceTime, 100);
    }

    const timeoutId = setTimeout(() => {
      if (fitMode === 'fitWidthTop') {
        performFitWidthTop(isTriggerKeyChanged);
      } else if (fitMode === 'fitAll' && pinFit) {
        rfInstance.fitView({ padding: fitPadding });
      }

      // 更新状态
      if (isTriggerKeyChanged) {
        lastFitTriggerKeyRef.current = fitTriggerKey;
      }
    }, debounceTime);

    return () => clearTimeout(timeoutId);
  }, [
    fitMode,
    rfInstance,
    nodes.length,
    containerSize.width,
    containerSize.height,
    fitTriggerKey,
    pinFit,
    hasInitialized,
    fitPadding,
    performanceConfig,
    performFitWidthTop,
  ]);

  // 合并边类型：为了防止已有数据中携带有 'smart' 类字段直接被隐形消失，必须始终将组件挂载！
  const mergedEdgeTypes = useMemo((): EdgeTypes => {
    // 始终提供渲染器供历史或默认线段调用，至于线是否进行路网避障，由组件内部的路径算法去判断参数执行。
    const smartEdges: Partial<EdgeTypes> = {
      'advanced-smart': AdvancedSmartStepEdge,
      'advanced-smart-step': AdvancedSmartStepEdge,
      'advanced-smart-bezier': AdvancedSmartBezierEdge,
      'advanced-smart-straight': AdvancedSmartStraightEdge,
      'smart': AdvancedSmartStepEdge,
      'smart-step': AdvancedSmartStepEdge,
      'smart-bezier': AdvancedSmartBezierEdge,
      'smart-straight': AdvancedSmartStraightEdge,
      'smart-orthogonal': SmartOrthogonalEdge,
    };

    return {
      elk: ElkEdge,
      ...smartEdges,
      // 稳定路径边（使用预计算的路径点，避免 React Flow 自动计算）
      stablePath: StablePathEdge,
      'canvas-ref': CanvasRefEdge,
      // Waypoint可编辑edge
      editable: EditableEdge,
      ...(edgeTypes || {}),
    } as EdgeTypes;
  }, [edgeTypes]);

  const displayEdges = useMemo((): Edge[] => {
    // P2: Canvas Hybrid Rendering Mode for Large Graphs
    if (isLargeGraph) {
      return edges.map(e => ({
        ...e,
        type: 'canvas-ref',
        data: {
          ...((e.data || {}) as Record<string, unknown>),
          originalType: e.type || 'default'
        }
      }));
    }

    if (enableSmartEdges) {
      if (typeof smartEdgePadding !== 'number' || !isFinite(smartEdgePadding)) return edges;

      return edges.map((e) => {
        const type = String(e.type || '');
        const lower = type.toLowerCase();

        // [FIX] Force ALL edges to use 'advanced-smart-step' when smart edges are enabled.
        // Previously, only edges with 'smart' in their type name were processed, leaving
        // default/undefined/smoothstep edges to use React Flow's built-in renderer.
        // We preserve explicitly registered special edges (editable, domain, etc.)
        const preserveTypes = ['mindmapedge', 'editable', 'domain', 'stablepath', 'elk', 'canvas-ref'];
        const targetType = (lower.includes('smart') || preserveTypes.includes(lower)) ? e.type : 'advanced-smart-step';

        const data = (e as any).data;
        const dataObj = (data && typeof data === 'object') ? data : {};
        const edgeConfig = (dataObj as any).edgeConfig;
        const edgeCfgObj = (edgeConfig && typeof edgeConfig === 'object') ? edgeConfig : {};

        const nextLabel = (e as any).label ?? (dataObj as any).label;
        const hasDataPad = (dataObj as any).obstaclePadding !== undefined && (dataObj as any).obstaclePadding !== null;
        const hasCfgPad = (edgeCfgObj as any).obstaclePadding !== undefined && (edgeCfgObj as any).obstaclePadding !== null;

        const needsPadPatch = !(hasDataPad && hasCfgPad);
        const dataWithPad = needsPadPatch ? {
          ...dataObj,
          obstaclePadding: hasDataPad ? (dataObj as any).obstaclePadding : smartEdgePadding,
          edgeConfig: {
            ...edgeCfgObj,
            obstaclePadding: hasCfgPad ? (edgeCfgObj as any).obstaclePadding : smartEdgePadding,
          },
        } : dataObj;

        const needsLabelPatch = typeof nextLabel !== 'undefined' && ((e as any).label !== nextLabel || (dataWithPad as any).label !== nextLabel);
        const needsTypePatch = targetType !== e.type;
        if (!needsPadPatch && !needsLabelPatch && !needsTypePatch) return e;

        const finalData = needsLabelPatch ? { ...dataWithPad, label: nextLabel } : dataWithPad;
        return { ...e, type: targetType, data: finalData, label: nextLabel } as Edge;
      });
    }
    return edges.map((e) => {
      const type = String(e.type || '');
      const lower = type.toLowerCase();
      const nextType = (() => {
        if (lower === 'advanced-smart-step' || lower === 'smart-step') return 'step';
        if (lower === 'advanced-smart-straight' || lower === 'smart-straight') return 'straight';
        if (lower === 'advanced-smart-bezier' || lower === 'smart-bezier' || lower === 'advanced-smart' || lower === 'smart') return 'bezier';
        return e.type;
      })();
      const nextLabel = (e as any).label ?? ((e.data && typeof e.data === 'object') ? (e.data as any).label : undefined);
      if (nextType === e.type && nextLabel === (e as any).label) return e;
      return { ...e, type: nextType as any, label: nextLabel } as Edge;
    });
  }, [edges, enableSmartEdges, smartEdgePadding, isLargeGraph]);

  /**
   * 函数级注释：导出期间隐藏背景网格
   * 实现：监听导出全局事件（diagramExportStart/Complete/Error），在导出窗口期不渲染 <Background>
   * 目的：确保 PNG/SVG/PDF/GIF 导出不包含 React Flow 的网格点背景
   */
  const [hideBackgroundDuringExport, setHideBackgroundDuringExport] = useState(false);
  useEffect(() => {
    const onStart = () => {
      setHideBackgroundDuringExport(true);
    };
    const onStop = () => {
      setHideBackgroundDuringExport(false);
    };
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


    // 恢复上次的视口状态
    const lastViewport = getLastViewport();
    if (lastViewport && fitMode === 'none') {
      instance.setViewport(lastViewport);
    }

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
    if (containerRef.current) {
      if (viewport.zoom < 0.4) {
        if (!containerRef.current.classList.contains('diagram-zoomed-out')) {
          containerRef.current.classList.add('diagram-zoomed-out');
        }
      } else {
        if (containerRef.current.classList.contains('diagram-zoomed-out')) {
          containerRef.current.classList.remove('diagram-zoomed-out');
        }
      }
    }

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
    const hasSize = containerSize.width > 0 && containerSize.height > 0;
    if (hasSize) {
      readyTimeoutRef.current = window.setTimeout(() => {
        setIsContainerReady(true);
      }, 120);
    } else {
      if (!isContainerReady) {
        setIsContainerReady(false);
      }
    }
  }, [containerSize.width, containerSize.height, isContainerReady]);

  useEffect(() => {
    updateContainerReady();
    return () => {
      if (readyTimeoutRef.current) {
        clearTimeout(readyTimeoutRef.current);
        readyTimeoutRef.current = null;
      }
      try { enhancedTextMeasurement.dispose?.(); } catch { void 0; }
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
          nodes={nodes}
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
    try {
      const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const fromUrl = qs.get('alignGuide') === '1';
      const fromStorage = typeof window !== 'undefined' && localStorage.getItem('diagram-align-guide') === 'true';
      return !!(fromUrl || fromStorage);
    } catch { return false; }
  }, []);

  if (!guideEnabled || !Array.isArray(nodesStore) || nodesStore.length === 0) return null;

  let minX = Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const n of nodesStore) {
    const tp = String(n.type || '');
    const x = (typeof n.position?.x === 'number' && isFinite(n.position.x)) ? n.position.x : 0;
    const y = (typeof n.position?.y === 'number' && isFinite(n.position.y)) ? n.position.y : 0;
    const h = (typeof n.measured?.height === 'number' && isFinite(n.measured.height))
      ? n.measured.height
      : (typeof n.style?.height === 'number' && isFinite(n.style.height))
        ? n.style.height
        : 120;
    if (tp === 'titleGroup') minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + h);
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxY)) return null;
  const height = Math.max(20, Math.round(maxY - minY));

  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(${Math.round(minX)}px, ${Math.round(minY)}px)`,
          width: 0,
          height,
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
    try {
      const qs = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const rightLine = qs.get('alignGuideRight') === '1' || (typeof window !== 'undefined' && localStorage.getItem('diagram-align-guide-right') === 'true');
      const contentLine = qs.get('alignContentMax') === '1' || (typeof window !== 'undefined' && localStorage.getItem('diagram-align-content-max') === 'true');
      return { rightLine, contentLine };
    } catch { return { rightLine: false, contentLine: false }; }
  }, []);

  if ((!flags.rightLine && !flags.contentLine) || !Array.isArray(nodesStore) || nodesStore.length === 0) return null;

  const titleGroups = nodesStore.filter((n: any) => String(n.type || '') === 'titleGroup');
  const overlays: React.ReactElement[] = [];
  for (const tg of titleGroups) {
    const x = (typeof tg.position?.x === 'number' && isFinite(tg.position.x)) ? tg.position.x : 0;
    const y = (typeof tg.position?.y === 'number' && isFinite(tg.position.y)) ? tg.position.y : 0;
    const w = (tg.measured?.width ?? tg.style?.width ?? 0) as number;
    const h = (tg.measured?.height ?? tg.style?.height ?? 0) as number;
    const rightX = Math.round(x + Math.max(0, w));
    let minY = Infinity; let maxY = -Infinity; let contentMaxX = -Infinity;
    const dId = String(((tg.data || {}) as any)?.domain || '');
    for (const n of nodesStore) {
      const tp = String(n.type || '');
      const belongs = String((((n.data || {}) as any)?.domain || '')) === dId;
      if (!belongs || tp === 'titleGroup') continue;
      const nx = (typeof n.position?.x === 'number' && isFinite(n.position.x)) ? n.position.x : 0;
      const ny = (typeof n.position?.y === 'number' && isFinite(n.position.y)) ? n.position.y : 0;
      const nw = (n.measured?.width ?? n.style?.width ?? 0) as number;
      const nh = (n.measured?.height ?? n.style?.height ?? 0) as number;
      minY = Math.min(minY, ny);
      maxY = Math.max(maxY, ny + nh);
      contentMaxX = Math.max(contentMaxX, nx + nw);
    }
    const height = isFinite(minY) && isFinite(maxY) ? Math.max(20, Math.round(maxY - minY)) : Math.max(20, Math.round(h));
    if (flags.rightLine) {
      overlays.push(
        <EdgeLabelRenderer key={`edge-right-${tg.id}`}>
          <div
            style={{
              position: 'absolute',
              transform: `translate(${rightX}px, ${Math.round(isFinite(minY) ? minY : y)}px)`,
              width: 0,
              height,
              borderLeft: '2px dashed #60a5fa',
              boxShadow: '0 0 0 1px rgba(96,165,250,0.12)',
              pointerEvents: 'none',
              zIndex: 4,
            }}
            aria-label="domain-right-guide"
            title="域右缘参考线"
          />
        </EdgeLabelRenderer>
      );
    }
    if (flags.contentLine && isFinite(contentMaxX) && contentMaxX > 0) {
      overlays.push(
        <EdgeLabelRenderer key={`edge-content-${tg.id}`}>
          <div
            style={{
              position: 'absolute',
              transform: `translate(${Math.round(contentMaxX)}px, ${Math.round(isFinite(minY) ? minY : y)}px)`,
              width: 0,
              height,
              borderLeft: '2px dashed #f59e0b',
              boxShadow: '0 0 0 1px rgba(245,158,11,0.12)',
              pointerEvents: 'none',
              zIndex: 4,
            }}
            aria-label="domain-content-max-guide"
            title="内容最大右缘参考线"
          />
        </EdgeLabelRenderer>
      );
    }
  }
  return <>{overlays}</>;
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
