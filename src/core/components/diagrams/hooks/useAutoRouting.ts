import { useCallback, useEffect, useState, useRef } from 'react';
import { Edge, ReactFlowInstance } from '@xyflow/react';
import { diagramConfigManager, EdgeConfig } from '@/core/config/DiagramConfig';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { useLayoutStrategy } from './useLayoutStrategy';
import { syncAutoPathSelection, applyRoutingProfile, DESIGNER_ROUTING_PROFILE } from './useSmartRoutingConfig';

interface UseAutoRoutingOptions {
    setNodes: React.Dispatch<React.SetStateAction<any[]>>;
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
    nodesRef: React.MutableRefObject<any[]>;
    edgesRef: React.MutableRefObject<Edge[]>;
    takeSnapshot: (nodes: any[], edges: Edge[]) => void;
    reactFlowInstance: ReactFlowInstance<any, any>;
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
    const [autoRoutingEnabled, setAutoRoutingEnabled] = useState(() => {
        try {
            const cfg = diagramConfigManager.getConfig();
            return (cfg?.edge as EdgeConfig)?.autoPathSelection ?? false;
        } catch { return false; }
    });
    const [isLayoutStable, setIsLayoutStable] = useState(true);

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
    });

    // 布局时自动启用 autoRouting + 管理稳定性标记
    const handleStrategyLayout = useCallback(async (...args: Parameters<typeof _handleStrategyLayout>) => {
        setIsLayoutStable(false);
        await _handleStrategyLayout(...args);
        setAutoRoutingEnabled(true);
        setIsLayoutStable(true);
    }, [_handleStrategyLayout]);

    // 统一路由配置同步（共享模块）
    useEffect(() => {
        syncAutoPathSelection(autoRoutingEnabled);
    }, [autoRoutingEnabled]);

    // 应用路由参数档位 + 设计器特有的缓存/数据清理
    // 标准 mount 检测：用 useRef + useEffect，避免每次渲染重置 current
    const initialMountRef = useRef(true);
    
    useEffect(() => {
        initialMountRef.current = false;
    }, []);

    useEffect(() => {
        if (initialMountRef.current) return;

        if (autoRoutingEnabled) {
            applyRoutingProfile(DESIGNER_ROUTING_PROFILE);
            EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
        } else {
            // 当关闭时也清理缓存，确保下次开启时是净态
            EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
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
        handleStrategyLayout,
        lastDomainStrategy,
        lastDomainDirection,
        lastNodeLayout,
    };
}
