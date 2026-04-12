import { useCallback, useState, useEffect, useRef } from 'react';
import { Node, Connection, OnConnectStart, OnConnectEnd } from '@xyflow/react';
import { readDomViewport } from '../../../utils/domViewport';

/**
 * Hook for managing connection microinteractions and animations
 * Handles connection preview, node highlighting, and success animations
 * 
 * 🚀 Performance: All high-frequency className updates use direct DOM manipulation
 *    (Zero-Render Pattern) instead of setNodes, avoiding full React reconciliation
 *    on every mousemove during connection dragging.
 */
export interface UseConnectionMicrointeractionsProps {
    nodes: Node[];
    setEdges: React.Dispatch<React.SetStateAction<any[]>>;
    onConnect: (connection: Connection) => void;
    onConnectEnd?: OnConnectEnd;
    reactFlowInstance: ReactFlowInstance | null;
}

// 🚀 P1: 预定义常量，避免每帧创建新数组
const SIDE_CLASSES = ['rf-connect-side-top', 'rf-connect-side-right', 'rf-connect-side-bottom', 'rf-connect-side-left'] as const;
const ALL_CONNECT_CLASSES = ['rf-connecting', 'rf-connectable', 'rf-connect-preview', ...SIDE_CLASSES] as const;

export const useConnectionMicrointeractions = ({
    nodes,
    setEdges,
    onConnect,
    onConnectEnd,
    reactFlowInstance,
}: UseConnectionMicrointeractionsProps) => {
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectPreview, setConnectPreview] = useState<{ x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left' } | null>(null);

    const connectSourceRef = useRef<{ nodeId: string; handleId: string | null } | null>(null);
    const connectPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
    const connectPreviewRef = useRef<{ nodeId: string; handleId: string; x: number; y: number; side: 'top' | 'right' | 'bottom' | 'left'; dist: number } | null>(null);
    const connectPreviewNodeIdRef = useRef<string | null>(null);
    const connectPreviewKeyRef = useRef<string | null>(null);
    const connectRafRef = useRef<number | null>(null);
    const nodesRef = useRef<Node[]>([]);
    const edgeAnimationTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        nodesRef.current = nodes;
    }, [nodes]);

    // 🚀 P5: 连线期间直接通过 DOM 启用 performance-mode，禁用 CSS transitions
    useEffect(() => {
        const rfContainer = document.querySelector('.react-flow');
        if (!rfContainer) return;
        if (isConnecting) {
            rfContainer.classList.add('performance-mode');
        } else {
            rfContainer.classList.remove('performance-mode');
        }
    }, [isConnecting]);

    // 🚀 P1: 直接 DOM 操作辅助函数 — 不触发 React 重渲染
    const domRemoveClasses = useCallback((nodeId: string, classes: readonly string[]) => {
        const el = document.querySelector(`[data-id="${nodeId}"]`);
        if (el) el.classList.remove(...classes);
    }, []);

    const domAddClasses = useCallback((nodeId: string, classes: string[]) => {
        const el = document.querySelector(`[data-id="${nodeId}"]`);
        if (el) el.classList.add(...classes);
    }, []);

    // 🚀 P4: 批量 DOM 操作 — 对所有节点添加/移除类名
    const domBatchAddClass = useCallback((className: string) => {
        document.querySelectorAll('.react-flow__node').forEach(el => {
            el.classList.add(className);
        });
    }, []);

    const domBatchRemoveClasses = useCallback((classes: readonly string[]) => {
        document.querySelectorAll('.react-flow__node').forEach(el => {
            el.classList.remove(...classes);
        });
    }, []);

    const computeConnectPreview = useCallback(() => {
        const src = connectSourceRef.current;
        const ptr = connectPointerRef.current;
        if (!src || !ptr || !nodesRef.current.length) {
            setConnectPreview(null);
            return;
        }

        // Use native screenToFlowPosition which seamlessly supports counter-zoom architecture
        if (!reactFlowInstance) return;
        const projected = reactFlowInstance.screenToFlowPosition({ x: ptr.clientX, y: ptr.clientY });
        const pointerFlowX = projected.x;
        const pointerFlowY = projected.y;

        // 🚀 P1: 单次遍历找最近节点，避免排序 O(n log n) → O(n)
        let bestDist = 300; // 阈值：超过 300px 不高亮
        let bestNodeId: string | null = null;
        let bestHandleId = '';
        let bestSide: 'top' | 'right' | 'bottom' | 'left' = 'right';
        let bestX = 0;
        let bestY = 0;

        for (const node of nodesRef.current) {
            if (node.id === src.nodeId) continue;
            const measured = node.measured || node;
            const w = (measured.width ?? 160) / 2;
            const h = (measured.height ?? 60) / 2;
            const cx = node.position.x + w;
            const cy = node.position.y + h;
            const dx = pointerFlowX - cx;
            const dy = pointerFlowY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < bestDist) {
                bestDist = dist;
                bestNodeId = node.id;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (angle >= -45 && angle < 45) bestSide = 'right';
                else if (angle >= 45 && angle < 135) bestSide = 'bottom';
                else if (angle >= -135 && angle < -45) bestSide = 'top';
                else bestSide = 'left';
                bestHandleId = `t-${bestSide}`;
                bestX = ptr.clientX - bcr.left;
                bestY = ptr.clientY - bcr.top;
            }
        }

        if (bestNodeId) {
            const previewKey = `${bestNodeId}-${bestSide}`;
            if (connectPreviewKeyRef.current !== previewKey) {
                const prevId = connectPreviewNodeIdRef.current;
                connectPreviewRef.current = { nodeId: bestNodeId, handleId: bestHandleId, x: bestX, y: bestY, side: bestSide, dist: bestDist };
                connectPreviewNodeIdRef.current = bestNodeId;
                connectPreviewKeyRef.current = previewKey;

                // 🚀 P1: 直接 DOM 操作替代 setNodes — 不触发 React 重渲染
                if (prevId) {
                    domRemoveClasses(prevId, ['rf-connect-preview', ...SIDE_CLASSES]);
                }
                domAddClasses(bestNodeId, ['rf-connect-preview', `rf-connect-side-${bestSide}`]);
                setConnectPreview({ x: bestX, y: bestY, side: bestSide });
            }
        } else {
            if (connectPreviewNodeIdRef.current) {
                const prevId = connectPreviewNodeIdRef.current;
                connectPreviewRef.current = null;
                connectPreviewNodeIdRef.current = null;
                connectPreviewKeyRef.current = null;

                // 🚀 P1: 直接 DOM 操作替代 setNodes
                domRemoveClasses(prevId, ['rf-connect-preview', ...SIDE_CLASSES]);
                setConnectPreview(null);
            }
        }
    }, [domRemoveClasses, domAddClasses]);

    useEffect(() => {
        if (!isConnecting) return;

        const schedule = (clientX: number, clientY: number) => {
            connectPointerRef.current = { clientX, clientY };
            if (connectRafRef.current != null) return;
            connectRafRef.current = window.requestAnimationFrame(() => {
                connectRafRef.current = null;
                computeConnectPreview();
            });
        };

        const onMove = (ev: MouseEvent | TouchEvent) => {
            const touchEvent = ev as TouchEvent;
            const mouseEvent = ev as MouseEvent;
            const t = touchEvent.touches?.[0] || touchEvent.changedTouches?.[0];
            if (t) {
                schedule(t.clientX, t.clientY);
                return;
            }
            schedule(mouseEvent.clientX, mouseEvent.clientY);
        };

        window.addEventListener('mousemove', onMove as (e: Event) => void, { passive: true });
        window.addEventListener('touchmove', onMove as (e: Event) => void, { passive: true });
        return () => {
            window.removeEventListener('mousemove', onMove as (e: Event) => void);
            window.removeEventListener('touchmove', onMove as (e: Event) => void);
            if (connectRafRef.current != null) {
                window.cancelAnimationFrame(connectRafRef.current);
                connectRafRef.current = null;
            }
        };
    }, [computeConnectPreview, isConnecting]);

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (edgeAnimationTimerRef.current) {
                clearTimeout(edgeAnimationTimerRef.current);
            }
            if (connectRafRef.current != null) {
                window.cancelAnimationFrame(connectRafRef.current);
            }
        };
    }, []);

    const onConnectStart: OnConnectStart = useCallback((_event, { nodeId, handleId }) => {
        if (!nodeId) return;
        setIsConnecting(true);
        connectSourceRef.current = { nodeId, handleId };

        // 🚀 P4: 直接 DOM 操作替代 setNodes — 连接开始时 O(n) DOM 批量操作
        //   比 setNodes + React reconciliation 快 10x+
        domBatchAddClass('rf-connecting');
    }, [domBatchAddClass]);

    const enhancedOnConnect = useCallback((connection: Connection) => {
        onConnect(connection);

        // Clear previous edge animation timer
        if (edgeAnimationTimerRef.current) {
            clearTimeout(edgeAnimationTimerRef.current);
        }

        // Clear connecting states
        setIsConnecting(false);
        connectSourceRef.current = null;
        connectPointerRef.current = null;
        connectPreviewRef.current = null;
        setConnectPreview(null);

        connectPreviewNodeIdRef.current = null;
        connectPreviewKeyRef.current = null;

        // 🚀 P4: 直接 DOM 操作批量清理所有连接类名
        domBatchRemoveClasses(ALL_CONNECT_CLASSES);

        // Add success animation to the new edge (with cleanup)
        edgeAnimationTimerRef.current = setTimeout(() => {
            setEdges(eds => eds.map(e =>
                (e.source === connection.source && e.target === connection.target)
                    ? { ...e, className: 'just-connected' }
                    : e
            ));

            edgeAnimationTimerRef.current = setTimeout(() => {
                setEdges(eds => eds.map(e => ({
                    ...e,
                    className: e.className === 'just-connected' ? '' : e.className
                })));
                edgeAnimationTimerRef.current = null;
            }, 1000);
        }, 50);
    }, [onConnect, setEdges, domBatchRemoveClasses]);

    const enhancedOnConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
        const preview = connectPreviewRef.current;

        const fromNodeId: string | null = connectionState.fromNode?.id ?? connectSourceRef.current?.nodeId ?? null;
        const fromHandleId: string | null = connectionState.fromHandle?.id ?? connectSourceRef.current?.handleId ?? null;

        // 仅在 ReactFlow 原生检测到有效目标 OR 精确拖到 handle 上时使用预览连接
        // 当 isValid 为 false 时，不使用 preview 回退，让 Quick Connect 面板有机会弹出
        const usePreview = connectionState.isValid && preview?.nodeId;
        const toNodeId: string | null = connectionState.toNode?.id ?? (usePreview ? preview.nodeId : null);
        const toHandleId: string | null = connectionState.toHandle?.id ?? (usePreview ? preview.handleId : null);

        const hasEndpoints = !!fromNodeId && !!toNodeId && fromNodeId !== toNodeId;

        if (hasEndpoints) {
            enhancedOnConnect({
                source: fromNodeId as string,
                target: toNodeId as string,
                sourceHandle: fromHandleId,
                targetHandle: toHandleId,
            });
        } else {
            if (onConnectEnd) {
                onConnectEnd(event, connectionState);
            }

            // Clear connection states (only when not handled by enhancedOnConnect)
            setIsConnecting(false);
            connectSourceRef.current = null;
            connectPointerRef.current = null;
            connectPreviewRef.current = null;
            setConnectPreview(null);

            connectPreviewNodeIdRef.current = null;
            connectPreviewKeyRef.current = null;

            // 🚀 P4: 直接 DOM 操作批量清理
            domBatchRemoveClasses(ALL_CONNECT_CLASSES);
        }
    }, [enhancedOnConnect, onConnectEnd, domBatchRemoveClasses]);

    return {
        isConnecting,
        connectPreview,
        onConnectStart,
        enhancedOnConnect,
        enhancedOnConnectEnd
    };
};
