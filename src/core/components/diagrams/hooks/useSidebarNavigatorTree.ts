import { useMemo, useState } from 'react';
import { Node } from '@xyflow/react';

export interface NavigatorTreeNode {
    key: string;
    title: string;
    node: Node;
    children: NavigatorTreeNode[];
    isMatched: boolean;
}

export function useSidebarNavigatorTree(nodes: Node[], searchTerm: string) {
    const { treeData, expandedKeys: searchExpandedKeys } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { treeData: [], expandedKeys: [] };

        const nodeMap = new Map<string, any>();
        nodes.forEach(n => nodeMap.set(n.id, { ...n, children: [] }));

        const roots: any[] = [];
        nodes.forEach(n => {
            const nodeWithChildren = nodeMap.get(n.id);
            if (n.parentId && nodeMap.has(n.parentId)) {
                nodeMap.get(n.parentId).children.push(nodeWithChildren);
            } else {
                roots.push(nodeWithChildren);
            }
        });

        const expandedKeys: string[] = [];
        const term = searchTerm.toLowerCase();

        const filterTree = (nodesToFilter: any[]): any[] => {
            return nodesToFilter.map(item => {
                const data = item.data;
                const label = data?.label || item.id;
                const selfMatch = !term || label.toLowerCase().includes(term);

                const filteredChildren = filterTree(item.children || []);
                const hasMatchingChildren = filteredChildren.length > 0;

                if (!selfMatch && !hasMatchingChildren) {
                    return null;
                }

                if (term && hasMatchingChildren) {
                    expandedKeys.push(item.id);
                }

                return {
                    key: item.id,
                    title: label,
                    node: item,
                    children: filteredChildren,
                    isMatched: selfMatch,
                };
            }).filter(Boolean);
        };

        return { treeData: filterTree(roots), expandedKeys };
    }, [nodes, searchTerm]);

    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [autoExpandParent, setAutoExpandParent] = useState(true);

    const onExpand = (newExpandedKeys: React.Key[]) => {
        setExpandedKeys(newExpandedKeys);
        setAutoExpandParent(false);
    };

    return {
        navigatorTreeData: treeData,
        expandedKeys: searchTerm ? searchExpandedKeys : expandedKeys,
        autoExpandParent: searchTerm ? true : autoExpandParent,
        onExpand
    };
}
