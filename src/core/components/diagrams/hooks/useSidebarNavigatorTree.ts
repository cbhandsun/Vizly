import { useMemo, useState } from 'react';
import { Node } from '@xyflow/react';

export interface NavigatorTreeNode {
    key: string;
    title: string;
    node: Node;
    children: NavigatorTreeNode[];
    isMatched: boolean;
}

type NavigatorSourceNode = Node & { children: NavigatorSourceNode[] };

export function useSidebarNavigatorTree(nodes: Node[], searchTerm: string) {
    const { treeData, expandedKeys: searchExpandedKeys } = useMemo(() => {
        if (!nodes || nodes.length === 0) return { treeData: [], expandedKeys: [] };

        const nodeMap = new Map<string, NavigatorSourceNode>();
        nodes.forEach(node => nodeMap.set(node.id, { ...node, children: [] }));

        const roots: NavigatorSourceNode[] = [];
        nodes.forEach(node => {
            const nodeWithChildren = nodeMap.get(node.id);
            if (!nodeWithChildren) return;
            if (node.parentId) {
                const parent = nodeMap.get(node.parentId);
                if (parent) {
                    parent.children.push(nodeWithChildren);
                    return;
                }
            }
            roots.push(nodeWithChildren);
        });

        const expandedKeys: string[] = [];
        const term = searchTerm.toLowerCase();

        const filterTree = (nodesToFilter: NavigatorSourceNode[]): NavigatorTreeNode[] => (
            nodesToFilter.flatMap(item => {
                const label = typeof item.data?.label === 'string' ? item.data.label : item.id;
                const selfMatch = !term || label.toLowerCase().includes(term);
                const filteredChildren = filterTree(item.children);
                const hasMatchingChildren = filteredChildren.length > 0;

                if (!selfMatch && !hasMatchingChildren) return [];
                if (term && hasMatchingChildren) expandedKeys.push(item.id);

                return [{
                    key: item.id,
                    title: label,
                    node: item,
                    children: filteredChildren,
                    isMatched: selfMatch,
                }];
            })
        );

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
