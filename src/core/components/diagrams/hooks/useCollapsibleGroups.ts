import { useMemo, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';
import { buildChildrenMap, getDescendantIds } from '../../shared/baseReactFlowLayoutVisibility';
export { buildChildrenMap, getDescendantIds } from '../../shared/baseReactFlowLayoutVisibility';

const COLLAPSE_HIDDEN_CLASS = 'vizly-collapse-hidden';

const hasCollapseHiddenClass = (node: Node): boolean =>
    node.className?.split(/\s+/).includes(COLLAPSE_HIDDEN_CLASS) === true;

const addCollapseHiddenClass = (node: Node): string =>
    [node.className, COLLAPSE_HIDDEN_CLASS].filter(Boolean).join(' ');

const removeCollapseHiddenClass = (node: Node): string | undefined => {
    const className = node.className
        ?.split(/\s+/)
        .filter(token => token && token !== COLLAPSE_HIDDEN_CLASS)
        .join(' ');
    return className || undefined;
};

interface UseCollapsibleGroupsProps {
    nodes: Node[];
    edges: Edge[];
    nodesRef?: React.MutableRefObject<Node[]>;
    edgesRef?: React.MutableRefObject<Edge[]>;
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot?: (nodes: Node[], edges: Edge[]) => void;
}

const MIN_COLLAPSED_CONTAINER_HEIGHT = 120;

export const createGroupCollapseTogglePlan = (nodes: Node[], groupId: string): Node[] | null => {
    const target = nodes.find(node => node.id === groupId);
    if (!target || target.data?.locked === true) return null;

    const isCollapsing = target.data?.collapsed !== true;
    const titleBarHeight = typeof target.data?.titleBarHeight === 'number'
        ? target.data.titleBarHeight
        : 40;
    const defaultExpandedHeight = target.type === 'subGroup' ? 150 : 300;

    return nodes.map(node => node.id === groupId
        ? (() => {
            if (isCollapsing) {
                const width = Number(node.style?.width) || node.measured?.width || node.width || 400;
                const height = Number(node.style?.height) || node.measured?.height || node.height || defaultExpandedHeight;
                return {
                    ...node,
                    data: {
                        ...node.data,
                        collapsed: true,
                        expandedSize: { width, height },
                    },
                    style: {
                        ...node.style,
                        height: Math.max(titleBarHeight + 8, MIN_COLLAPSED_CONTAINER_HEIGHT),
                    },
                };
            }

            const expandedSize = node.data?.expandedSize;
            const savedHeight = typeof expandedSize === 'object' && expandedSize !== null
                && 'height' in expandedSize && typeof expandedSize.height === 'number'
                ? expandedSize.height
                : defaultExpandedHeight;
            return {
                ...node,
                data: { ...node.data, collapsed: false },
                style: { ...node.style, height: savedHeight },
            };
        })()
        : node);
};

export const useCollapsibleGroups = ({
    nodes,
    edges,
    nodesRef,
    edgesRef,
    setNodes,
    takeSnapshot
}: UseCollapsibleGroupsProps) => {
    // 1. 动态过滤出当前需要在此刻画图板上渲染的结点
    // 逻辑：如果某节点的任一祖先节点是 collapsed 状态，则该节点应当被隐藏
    const visibleNodes = (() => {
        const collapsedGroups = nodes.filter(n => n.data?.collapsed);
        if (collapsedGroups.length === 0) {
            if (!nodes.some(n => n.hidden || n.data?.hidden || hasCollapseHiddenClass(n))) return nodes;
            return nodes.map(n => {
                if (!n.hidden && !n.data?.hidden && !hasCollapseHiddenClass(n)) return n;
                return {
                    ...n,
                    hidden: false,
                    className: removeCollapseHiddenClass(n),
                    data: n.data?.hidden ? { ...n.data, hidden: false } : n.data,
                };
            });
        }

        const childrenMap = buildChildrenMap(nodes);
        const hiddenNodeIds = new Set<string>();
        collapsedGroups.forEach(group => {
            getDescendantIds(nodes, group.id, childrenMap).forEach(id => hiddenNodeIds.add(id));
        });

        // 打上 hidden 标记而不是真实从数据中删除
        // 从而完美兼容 React Flow 渲染
        return nodes.map(n => {
            const shouldHide = hiddenNodeIds.has(n.id);
            const dataHidden = !!n.data?.hidden;
            const collapseHidden = hasCollapseHiddenClass(n);
            if (shouldHide === collapseHidden && !n.hidden && !dataHidden) return n;

            if (shouldHide) {
                return {
                    ...n,
                    hidden: true,
                    className: addCollapseHiddenClass(n),
                    data: dataHidden ? { ...n.data, hidden: false } : n.data,
                };
            }
            return {
                ...n,
                hidden: false,
                className: removeCollapseHiddenClass(n),
                data: dataHidden ? { ...n.data, hidden: false } : n.data,
            };
        });
    })();

    // 2. 边缘路由劫持
    const visibleEdges = useMemo(() => {
        const collapsedGroups = nodes.filter(n => n.data?.collapsed);
        if (collapsedGroups.length === 0) return edges;

        const proxyMap = new Map<string, string>(); // childId -> collapsedGroupId
        const childrenMap = buildChildrenMap(nodes);

        collapsedGroups.forEach(group => {
            const descendants = getDescendantIds(nodes, group.id, childrenMap);
            descendants.forEach(dId => {
                proxyMap.set(dId, group.id);
            });
        });

        return edges.map(edge => {
            let newSource = edge.source;
            let newTarget = edge.target;
            let isProxied = false;

            // 如果起点在此折叠容器内
            if (proxyMap.has(edge.source)) {
                newSource = proxyMap.get(edge.source)!;
                isProxied = true;
            }

            // 如果终点在此折叠容器内
            if (proxyMap.has(edge.target)) {
                newTarget = proxyMap.get(edge.target)!;
                isProxied = true;
            }
            
            // 如果连线的两端都在同一个折叠的容器内部，其实线索性应该被隐藏
            if (isProxied && newSource === newTarget) {
                 return { ...edge, hidden: true };
            }

            if (isProxied) {
                return {
                    ...edge,
                    source: newSource,
                    target: newTarget,
                    hidden: false,
                    // 标记这条边是由于折叠被代理的，便于样式区分（可选）
                    data: {
                        ...edge.data,
                        isProxied: true,
                        originalSource: edge.source,
                        originalTarget: edge.target
                    }
                };
            }

            return edge;
        });

    }, [nodes, edges]);

    // 3. 暴露给容器节点使用的折叠触发器
    const toggleGroupCollapse = useCallback((groupId: string) => {
        setNodes(currentNodes => {
            const plan = createGroupCollapseTogglePlan(currentNodes, groupId);
            if (!plan) return currentNodes;

            takeSnapshot?.(currentNodes, edgesRef?.current ?? edges);
            if (nodesRef) nodesRef.current = plan;
            return plan;
        });
    }, [edges, edgesRef, nodesRef, setNodes, takeSnapshot]);

    return {
        // 交由外部真正用于传入 React Flow 组件的 Nodes 和 Edges
        nodesWithCollapseState: visibleNodes,
        edgesWithCollapseState: visibleEdges,
        toggleGroupCollapse
    };
};
