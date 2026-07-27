import React, { useMemo, useRef, useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { ReactFlow, Background, BackgroundVariant, Controls, useReactFlow, ReactFlowProvider, useStore, useStoreApi, useUpdateNodeInternals, SelectionMode } from '@xyflow/react';
import type {
  EdgeTypes,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import DiagramControlBridge from './DiagramControlBridge';
// 引入智能边样式（函数级注释）
// 目的：确保 .smart-edge 与 .smart-edge.animated 等类样式全局生效（导出/展示一致）
import '../custom-edges/SmartEdgeStyles.css';
import FixedMiniMap from './FixedMiniMap';

import { AdvancedSmartStepEdge, AdvancedSmartBezierEdge, AdvancedSmartStraightEdge } from '../custom-edges/AdvancedSmartEdge';
import { SmartOrthogonalEdge } from '../custom-edges/SmartOrthogonalEdge';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import { getLastViewport, setLastViewport, getUiScale } from './viewportStore';
import { ElkEdge } from '../custom-edges/ElkEdge'; // 导入 ElkEdge
import { StablePathEdge } from '../custom-edges/StablePathEdge'; // 导入稳定路径边组件
import { enhancedTextMeasurement } from '../../utils/EnhancedTextMeasurement';
import { CanvasRefEdge } from '../edges/CanvasRefEdge';
import EditableEdge from '../custom-edges/EditableEdge'; // ⭐ Waypoint编辑Edge
import {
  areBaseReactFlowHandlesMeasured,
  createBaseReactFlowNodeInternalsRefreshSnapshot,
  readBaseReactFlowNodeInternalsRefreshNodeIds,
  refreshBaseReactFlowNodeInternals,
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
import { useBaseReactFlowDisplayRouting } from './useBaseReactFlowDisplayRouting';
import { resolveBaseReactFlowNodeDragFallbackIds } from './baseReactFlowDisplayFallback';
import {
  bindBaseReactFlowWheelHandler,
  createBaseReactFlowWheelHandler,
} from './baseReactFlowWheel';
import { createBaseReactFlowMergedEdgeTypes } from './baseReactFlowEdgeTypes';
import {
  computeBaseReactFlowIsLargeGraph,
  createBaseReactFlowDefaultEdgeOptions,
  createBaseReactFlowProOptions,
  detectBaseReactFlowTouchDevice,
  readBaseReactFlowPerformanceConfig,
  readBaseReactFlowZoomSensitivity,
  resolveBaseReactFlowReconnectRadius,
  resolveBaseReactFlowInteractionFlags,
} from './baseReactFlowRuntimeConfig';
import {
  logBaseReactFlowConfigReadFailure,
  logBaseReactFlowEventBindingFailure,
} from './baseReactFlowLogging';
import {
  BaseReactFlowAlignGuide,
  BaseReactFlowRightEdgeGuides,
} from './baseReactFlowOverlayRenderers';
import type { BaseReactFlowProps } from './baseReactFlowTypes';
import { useBaseReactFlowFitController } from './useBaseReactFlowFitController';
import { SmartEdgeRoutingOwnerContext } from '../custom-edges/smartEdgeRoutingOwnership';
import { resolveBaseReactFlowRoutingComputation } from './baseReactFlowDragRoutingFreeze';

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
  reconnectRadius,
  onReconnect,
  onReconnectStart,
  onReconnectEnd,
}: BaseReactFlowProps) => {
  const rfInstance = useReactFlow();
  const rfStore = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [isNodeDragFallbackPending, setIsNodeDragFallbackPending] = useState(false);
  const [nodeDragFallbackIds, setNodeDragFallbackIds] = useState<readonly string[]>([]);
  const handleNodeDragStart = useCallback<NonNullable<BaseReactFlowProps['onNodeDragStart']>>(
    (event, node, draggedNodes) => {
      setIsNodeDragging(true);
      setIsNodeDragFallbackPending(true);
      setNodeDragFallbackIds(resolveBaseReactFlowNodeDragFallbackIds(node.id, draggedNodes));
      onNodeDragStart?.(event, node, draggedNodes);
    },
    [onNodeDragStart],
  );
  const handleNodeDragStop = useCallback<NonNullable<BaseReactFlowProps['onNodeDragStop']>>(
    (event, node, draggedNodes) => {
      setIsNodeDragging(false);
      onNodeDragStop?.(event, node, draggedNodes);
    },
    [onNodeDragStop],
  );
  const handleNodeDragFallbackResolved = useCallback(() => {
    setIsNodeDragFallbackPending(false);
    setNodeDragFallbackIds([]);
  }, []);

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

  const runtimeConfig = useMemo(() => {
    return {
      performanceConfig: readBaseReactFlowPerformanceConfig({
        readConfig: () => diagramConfigManager.getConfig(),
        onReadFailure: (error) => logBaseReactFlowConfigReadFailure('performance', error),
      }),
      rawUiScale: getUiScale(),
    };
  }, []);
  const { performanceConfig, rawUiScale } = runtimeConfig;

  const renderNodes = useMemo(() => (
    normalizeBaseReactFlowRenderableNodes(nodes)
  ), [nodes]);

  const visibleNodes = useMemo(() => (
    filterBaseReactFlowVisibleNodes(renderNodes)
  ), [renderNodes]);
  const visibleNodeIds = useMemo(() => visibleNodes.map(node => node.id), [visibleNodes]);
  const internalNodeGeometrySignature = useStore(useCallback((state) => (
    resolveBaseReactFlowRoutingComputation({
      isNodeDragging,
      pausedValue: 'node-drag-paused',
      compute: () => computeBaseReactFlowInternalNodeGeometrySignature(
        visibleNodeIds,
        state.nodeLookup,
      ),
    })
  ), [isNodeDragging, visibleNodeIds]));
  const internalFlowNodes = useMemo(() => {
    // The store signature is an explicit invalidation token for geometry held
    // outside React props; reading it keeps measured-node updates observable.
    void internalNodeGeometrySignature;
    return collectBaseReactFlowInternalNodes(
      visibleNodeIds,
      rfStore.getState().nodeLookup,
    );
  }, [visibleNodeIds, internalNodeGeometrySignature, rfStore]);
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

  const routingGeometryReady = useMemo(() => {
    void internalNodeGeometrySignature;
    return isLargeGraph || areBaseReactFlowInternalNodesReadyForRouting(
      visibleNodeIds,
      rfStore.getState().nodeLookup,
    );
  }, [internalNodeGeometrySignature, isLargeGraph, rfStore, visibleNodeIds]);

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

  useBaseReactFlowFitController({
    rfInstance,
    renderNodes,
    visibleNodeCount: visibleNodes.length,
    edges,
    containerSize,
    fitMode,
    fitTriggerKey,
    pinFit,
    fitPadding,
    minZoom,
    maxZoom,
    defaultDebounceMs: performanceConfig?.debounceMs ?? 100,
  });

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

  const {
    edges: displayEdges,
    routingOwner: smartEdgeRoutingOwner,
  } = useBaseReactFlowDisplayRouting({
    edges,
    routingNodes,
    routingGeometryReady,
    isContainerReady,
    enableSmartEdges,
    smartEdgePadding,
    isLargeGraph,
    isNodeDragging,
    isNodeDragFallbackPending,
    nodeDragFallbackIds,
    onNodeDragFallbackResolved: handleNodeDragFallbackResolved,
  });

  const nodeInternalsRefreshKey = useMemo(
    () => createBaseReactFlowNodeInternalsRefreshSnapshot(visibleNodes).key,
    [visibleNodes],
  );

  useEffect(() => {
    const nodeIds = readBaseReactFlowNodeInternalsRefreshNodeIds(nodeInternalsRefreshKey);
    if (nodeIds.length === 0) return;
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
  }, [nodeInternalsRefreshKey, updateNodeInternals, rfStore]);

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
    window.addEventListener('diagramExportStart', onStart);
    window.addEventListener('diagramExportComplete', onStop);
    window.addEventListener('diagramExportError', onStop);
    return () => {
      window.removeEventListener('diagramExportStart', onStart);
      window.removeEventListener('diagramExportComplete', onStop);
      window.removeEventListener('diagramExportError', onStop);
    };
  }, []);

  // 调试辅助线由独立渲染器读取开关和节点快照。

  // 处理初始化
  const handleInit = useCallback((instance: ReactFlowInstance) => {
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
    };
  }, [updateContainerReady]);

  useEffect(() => {
    try {
      return enhancedTextMeasurement.retain();
    } catch (error) {
      logBaseReactFlowEventBindingFailure('retainEnhancedTextMeasurement', error);
      return undefined;
    }
  }, []);

  // 🎯 CSS zoom 反向补偿：抵消祖先的 zoom: uiScale，使 React Flow 在 zoom=1 空间运作
  // 使用 width/height: 100%（而非 85%），让 ReactFlow 获得完整 CSS 像素空间。
  // 视觉溢出 (~17.6%) 由父容器的 overflow: hidden 裁剪，对交互无影响。
  const uiScale = disableZoomCompensation ? 1 : rawUiScale;
  const counterZoom = uiScale !== 1 ? (1 / uiScale) : 1;
  const effectiveReconnectRadius = resolveBaseReactFlowReconnectRadius(reconnectRadius);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', ...style }} className={className}>
      <div style={counterZoom !== 1 ? {
        zoom: counterZoom,
        width: '100%',
        height: '100%',
        position: 'relative',
      } : { width: '100%', height: '100%', position: 'relative' }}>
        <SmartEdgeRoutingOwnerContext.Provider value={smartEdgeRoutingOwner}>
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
          onNodeDragStart={handleNodeDragStart}
          onNodeDragStop={handleNodeDragStop}
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
          reconnectRadius={effectiveReconnectRadius}
          onReconnect={onReconnect}
          onReconnectStart={onReconnectStart}
          onReconnectEnd={onReconnectEnd}
          elevateNodesOnSelect={false}
          elevateEdgesOnSelect={true}
          style={reactFlowStyle}
          className={flowClassName}
        >
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
              nodes={routingNodes}
              isNodeDragging={isNodeDragging}
              style={miniMapStyle}
              zoomable={miniMapZoomable}
              pannable={miniMapPannable}
            />
          )}
          <DiagramControlBridge />
          <BaseReactFlowAlignGuide />
          <BaseReactFlowRightEdgeGuides />
          {children}
        </ReactFlow>
        </SmartEdgeRoutingOwnerContext.Provider>
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
 * BaseReactFlow 包装组件（函数级注释）
 * - 提供 ReactFlowProvider 上下文
 * - 智能边由画布 worker 统一布线，不再维护逐边障碍物上下文
 */
const BaseReactFlow: React.FC<BaseReactFlowProps> = (props) => (
  <ReactFlowProvider>
    <BaseReactFlowInner {...props} />
  </ReactFlowProvider>
);

export default BaseReactFlow;
