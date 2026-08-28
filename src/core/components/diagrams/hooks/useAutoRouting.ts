import { useCallback, useEffect, useState, useRef } from 'react';
import { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { diagramConfigManager, EdgeConfig } from '@/core/config/DiagramConfig';
import { useLayoutStrategy } from './useLayoutStrategy';
import { syncAutoPathSelection, applyRoutingProfile, DESIGNER_ROUTING_PROFILE } from './useSmartRoutingConfig';
import { useBaseReactFlowRoutingSessionRuntime } from '../../shared/baseReactFlowRoutingSessionRuntime';

interface UseAutoRoutingOptions {
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    nodesRef: React.MutableRefObject<Node[]>;
    edgesRef: React.MutableRefObject<Edge[]>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance | null;
    diagramId?: string;
    loadLayoutPresetMap?: () => Promise<Record<string, unknown>>;
}

/**
 * 自动布线管理：状态控制、布局策略包装、DiagramConfig 同步
 * 从 FlowchartDesigner 提取
 */
export function useAutoRouting({
    setNodes,
    setEdges,
    nodesRef,
    edgesRef,
    takeSnapshot,
    reactFlowInstance,
    diagramId,
    loadLayoutPresetMap,
}: UseAutoRoutingOptions) {
    // [FIX] Read initial value from DiagramConfig instead of hardcoding false.
    // When autoRoutingEnabled starts as false, BaseReactFlow converts 'advanced-smart-step'
    // edges to built-in 'step' type. Later when it switches to true, the edge type changes,
    // causing React to unmount the built-in component and mount AdvancedSmartEdge for the
    // first time — showing a deformed fallback path while the Worker hasn't returned yet.
    // Reading the persisted value ensures consistent edge type from the first render.
    const [autoRoutingEnabled, setAutoRoutingEnabledState] = useState(() => {
        try {
            const cfg = diagramConfigManager.getConfig();
            return (cfg?.edge as EdgeConfig)?.autoPathSelection ?? false;
        } catch { return false; }
    });
    const [isLayoutStable, setIsLayoutStable] = useState(true);
    const [isLayoutBusy, setIsLayoutBusy] = useState(false);
    const routingPreferenceVersionRef = useRef(0);
    const layoutGenerationRef = useRef(0);
    const routingSessionRuntime = useBaseReactFlowRoutingSessionRuntime();

    const setAutoRoutingEnabled = useCallback<React.Dispatch<React.SetStateAction<boolean>>>((nextValue) => {
        routingPreferenceVersionRef.current += 1;
        setAutoRoutingEnabledState(nextValue);
    }, []);

    // 布局策略
    const { handleStrategyLayout: _handleStrategyLayout, lastDomainStrategy, lastDomainDirection, lastNodeLayout } = useLayoutStrategy({
        setNodes,
        setEdges,
        nodesRef,
        edgesRef,
        takeSnapshot,
        reactFlowInstance,
        diagramId,
        loadLayoutPresetMap,
        setLayoutStable: setIsLayoutStable,
        routingSessionRuntime,
    });

    // 布局时自动启用 autoRouting + 管理稳定性标记
    const handleStrategyLayout = useCallback(async (...args: Parameters<typeof _handleStrategyLayout>) => {
        const layoutGeneration = layoutGenerationRef.current + 1;
        layoutGenerationRef.current = layoutGeneration;
        const routingPreferenceVersion = routingPreferenceVersionRef.current;
        setIsLayoutBusy(true);
        try {
            const committed = await _handleStrategyLayout(...args);
            // 用户可能在异步布局执行期间手动关闭自动布线。布局完成只能在
            // 用户偏好未变化时应用默认开启值，避免迟到响应覆盖最新操作。
            if (committed && routingPreferenceVersionRef.current === routingPreferenceVersion) {
                setAutoRoutingEnabledState(true);
            }
        } finally {
            if (layoutGenerationRef.current === layoutGeneration) {
                setIsLayoutBusy(false);
                setIsLayoutStable(true);
            }
        }
    }, [_handleStrategyLayout]);

    // 统一路由配置同步（共享模块）
    useEffect(() => {
        syncAutoPathSelection(autoRoutingEnabled);
    }, [autoRoutingEnabled]);

    // 应用路由参数档位 + 设计器特有的缓存/数据清理
    // 标准 mount 检测：用 useRef + useEffect，避免每次渲染重置 current
    const initialMountRef = useRef(true);
    
    useEffect(() => {
        if (initialMountRef.current) {
            initialMountRef.current = false;
            return;
        }

        if (autoRoutingEnabled) {
            applyRoutingProfile(DESIGNER_ROUTING_PROFILE);
        }
        // 强刷 Edge 引用，触发 React Flow 和自定义 Edge 组件的全量重绘
        // 这是必要的，因为如果不修改 edge 对象的引用，React Flow 内部可能因为
        // graphVersion 未变而跳过渲染，导致开启/关闭“自动布线”后画面没有立刻反映变化。
        setEdges(edges => edges.map(e => ({ ...e })));

    }, [autoRoutingEnabled, setEdges]);

    return {
        autoRoutingEnabled,
        setAutoRoutingEnabled,
        isLayoutStable,
        isLayoutBusy,
        handleStrategyLayout,
        lastDomainStrategy,
        lastDomainDirection,
        lastNodeLayout,
        routingSessionRuntime,
    };
}
