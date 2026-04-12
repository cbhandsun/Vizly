import { useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';

interface UseGroupingProps {
    nodes: Node[];
    edges: Edge[];
    setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    selectedNodes: Node[];
    setSelectedNodes: React.Dispatch<React.SetStateAction<Node[]>>;
    takeSnapshot: (nodes: Node[], edges: Edge[]) => void;
    defaultGroupLabel?: string;
    defaultGroupDescription?: string;
}

export const useGrouping = ({
    nodes,
    edges,
    setNodes,
    selectedNodes,
    setSelectedNodes,
    takeSnapshot,
    defaultGroupLabel,
    defaultGroupDescription
}: UseGroupingProps) => {

    const handleGroup = useCallback(() => {
        if (selectedNodes.length < 2) return;

        const firstParent = selectedNodes[0].parentId;
        const allSameParent = selectedNodes.every(n => n.parentId === firstParent);

        if (!allSameParent) {
            return;
        }

        takeSnapshot(nodes, edges);

        // Calculate BBox
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedNodes.forEach(n => {
            const x = n.position.x;
            const y = n.position.y;
            const w = n.measured?.width || n.width || 100;
            const h = n.measured?.height || n.height || 100;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + w);
            maxY = Math.max(maxY, y + h);
        });

        if (!isFinite(minX)) return;

        const padding = 40;
        const groupId = `group-${Date.now()}`;

        // 🆕 P2b: 根据嵌套深度自动选择容器类型
        // 如果选中节点已在一个容器内，则创建 subGroup（二级）；否则创建 titleGroup（一级）
        const isNestedInContainer = firstParent && nodes.some(n =>
            n.id === firstParent && (n.type === 'titleGroup' || n.type === 'subGroup' || n.type === 'swimlane')
        );
        const groupType = isNestedInContainer ? 'subGroup' : 'titleGroup';

        const groupNode: Node = {
            id: groupId,
            type: groupType,
            position: { x: minX - padding, y: minY - padding },
            parentId: firstParent,
            data: {
                label: defaultGroupLabel ?? 'New Group',
                description: defaultGroupDescription ?? 'Grouped Selection',
                domainClass: 'core',
                themeColor: '#3F51B5'
            },
            style: {
                width: maxX - minX + padding * 2,
                height: maxY - minY + padding * 2,
            },
            zIndex: -1
        };

        setNodes((nds) => {
            const selectedIds = new Set(selectedNodes.map(n => n.id));
            const newNodes = nds.map(n => {
                if (selectedIds.has(n.id)) {
                    return {
                        ...n,
                        parentId: groupId,
                        extent: 'parent' as const,
                        position: {
                            x: n.position.x - (minX - padding),
                            y: n.position.y - (minY - padding)
                        },
                        selected: false
                    };
                }
                return n;
            });
            return [...newNodes, { ...groupNode, selected: true }];
        });

        setSelectedNodes([groupNode]);
    }, [defaultGroupDescription, defaultGroupLabel, selectedNodes, nodes, edges, takeSnapshot, setNodes, setSelectedNodes]);

    const handleUngroup = useCallback(() => {
        const groupsToUngroup = selectedNodes.filter(n => n.type === 'titleGroup' || n.type === 'subGroup');
        if (groupsToUngroup.length === 0) return;

        takeSnapshot(nodes, edges);

        setNodes(nds => {
            let nextNodes = [...nds];
            const groupIds = new Set(groupsToUngroup.map(g => g.id));

            // Process children
            nextNodes = nextNodes.map(n => {
                if (n.parentId && groupIds.has(n.parentId)) {
                    const parentGroup = groupsToUngroup.find(g => g.id === n.parentId);
                    if (parentGroup) {
                        const newParentId = parentGroup.parentId;
                        const newPosition = {
                            x: n.position.x + parentGroup.position.x,
                            y: n.position.y + parentGroup.position.y
                        };

                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { parentId: _pid, extent: _ext, ...rest } = n;

                        if (newParentId) {
                            return {
                                ...rest,
                                parentId: newParentId,
                                extent: 'parent' as const,
                                position: newPosition
                            };
                        } else {
                            return {
                                ...rest,
                                position: newPosition
                            };
                        }
                    }
                }
                return n;
            });

            // Remove groups
            return nextNodes.filter(n => !groupIds.has(n.id));
        });

        setSelectedNodes([]);
    }, [selectedNodes, nodes, edges, takeSnapshot, setNodes, setSelectedNodes]);

    return {
        handleGroup,
        handleUngroup
    };
};
