import { useMemo, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';

// 构建快速子节点查找表 (O(N))
export const buildChildrenMap = (nodes: Node[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();

    const addEdge = (parent: string, child: string) => {
        let arr = map.get(parent);
        if (!arr) {
            arr = [];
            map.set(parent, arr);
        }
        if (!arr.includes(child)) {
            arr.push(child);
        }
    };

    // 1. 寻找所有的 titleGroup, subGroup 和普通节点
    const titleGroups = nodes.filter(n => n.type === 'titleGroup');
    const subGroups = nodes.filter(n => n.type === 'subGroup');
    const normalNodes = nodes.filter(n => n.type !== 'titleGroup' && n.type !== 'subGroup');

    // 2. 首先处理 React Flow 标准 parentId
    for (let i = 0; i < nodes.length; i++) {
        const pId = nodes[i].parentId;
        if (pId) {
            addEdge(pId, nodes[i].id);
        }
    }

    // 3. 处理 Flowchart 语义化父子关系
    // 3a. subGroup -> titleGroup 的父子关系
    subGroups.forEach(sg => {
        const domain = sg.data?.domain;
        if (domain) {
            const tg = titleGroups.find(t => t.data?.domain === domain);
            if (tg) {
                addEdge(tg.id, sg.id);
            }
        }
    });

    // 3b. 业务节点 -> subGroup 或 titleGroup 的父子关系
    normalNodes.forEach(n => {
        const domain = n.data?.domain;
        const subDomain = n.data?.subDomain;

        if (domain) {
            // 优先归属到对应的子组 (subGroup)
            if (subDomain) {
                const sg = subGroups.find(s => s.data?.domain === domain && (s.data?.subDomain === subDomain || s.data?.description === subDomain));
                if (sg) {
                    addEdge(sg.id, n.id);
                    return;
                }
            }
            // 如果没有子组，归属到主域 (titleGroup)
            const tg = titleGroups.find(t => t.data?.domain === domain);
            if (tg) {
                addEdge(tg.id, n.id);
            }
        }
    });

    return map;
};

// 获取给定节点的所有子代节点 ID (深度优先/广度优先)
export const getDescendantIds = (nodes: Node[], parentId: string, prebuiltMap?: Map<string, string[]>): string[] => {
    const childrenMap = prebuiltMap || buildChildrenMap(nodes);
    
    const descendants: string[] = [];
    const queue = [parentId];
    
    let head = 0;
    while (head < queue.length) {
        const currentId = queue[head++];
        const children = childrenMap.get(currentId);
        if (children) {
            for (let i = 0; i < children.length; i++) {
                descendants.push(children[i]);
                queue.push(children[i]);
            }
        }
    }
    
    return descendants;
};

interface UseCollapsibleGroupsProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot?: (nodes: Node[], edges: Edge[]) => void;
}

export const useCollapsibleGroups = ({
    nodes,
    edges,
    setNodes,
    takeSnapshot
}: UseCollapsibleGroupsProps) => {

    // 1. 动态过滤出当前需要在此刻画图板上渲染的结点
    // 逻辑：如果某节点的任一祖先节点是 collapsed 状态，则该节点应当被隐藏
    const visibleNodes = useMemo(() => {
        const collapsedGroups = nodes.filter(n => n.data?.collapsed);
        if (collapsedGroups.length === 0) {
            return nodes.map(n => ({...n, hidden: false}));
        }

        const childrenMap = buildChildrenMap(nodes);
        const hiddenNodeIds = new Set<string>();
        collapsedGroups.forEach(group => {
            getDescendantIds(nodes, group.id, childrenMap).forEach(id => hiddenNodeIds.add(id));
        });

        // 打上 hidden 标记而不是真实从数据中删除
        // 从而完美兼容 React Flow 渲染
        return nodes.map(n => {
            if (hiddenNodeIds.has(n.id)) {
                return { ...n, hidden: true, data: { ...n.data, hidden: true } };
            }
            if (n.data?.hidden) {
                return { ...n, hidden: false, data: { ...n.data, hidden: false } };
            }
            return { ...n, hidden: false };
        });
    }, [nodes]);

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
        if (takeSnapshot) {
            // takeSnapshot(nodes, edges); // 这里暂时不强制 snapshot，视外部实现而定
        }
        
        setNodes(nds => nds.map(n => {
            if (n.id === groupId) {
                const isCurrentlyCollapsed = !!n.data?.collapsed;
                return {
                    ...n,
                    data: {
                        ...n.data,
                        collapsed: !isCurrentlyCollapsed
                    }
                };
            }
            return n;
        }));
    }, [setNodes, takeSnapshot]);

    return {
        // 交由外部真正用于传入 React Flow 组件的 Nodes 和 Edges
        nodesWithCollapseState: visibleNodes,
        edgesWithCollapseState: visibleEdges,
        toggleGroupCollapse
    };
};
