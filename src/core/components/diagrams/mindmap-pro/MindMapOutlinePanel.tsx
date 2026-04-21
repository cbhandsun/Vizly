import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Tree, Empty, Input } from 'antd';
import { PluginContext } from '../../../types/plugin';
import type { DataNode } from 'antd/es/tree';

// [T-6] Inline-editable tree node title
// Double-click switches to an input; Enter/Blur commits the edit back to canvas.
interface EditableTitleProps {
    nodeId: string;
    label: string;
    editingId: string | null;
    editingValue: string;
    onStartEdit: (nodeId: string, currentLabel: string) => void;
    onChangeValue: (v: string) => void;
    onCommit: () => void;
    onCancel: () => void;
}

const EditableTitle: React.FC<EditableTitleProps> = ({
    nodeId, label, editingId, editingValue,
    onStartEdit, onChangeValue, onCommit, onCancel
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when we enter edit mode for this node
    React.useLayoutEffect(() => {
        if (editingId === nodeId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId, nodeId]);

    if (editingId === nodeId) {
        return (
            <Input
                ref={inputRef}
                size="small"
                value={editingValue}
                onChange={e => onChangeValue(e.target.value)}
                onBlur={onCommit}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
                    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                }}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                style={{ minWidth: 80, maxWidth: 200, height: 22, padding: '0 6px', fontSize: 13 }}
            />
        );
    }

    return (
        <span
            onDoubleClick={e => {
                e.stopPropagation();
                onStartEdit(nodeId, label);
            }}
            title="双击编辑"
            style={{ cursor: 'default', userSelect: 'none' }}
        >
            {label}
        </span>
    );
};

export const MindMapOutlinePanel: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { getNodes, getEdges, reactFlowInstance, setNodes, updateNode } = ctx as any;

    const nodes = getNodes();
    const edges = getEdges();

    // [T-6] Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const originalLabelRef = useRef<string>('');

    const startEdit = useCallback((nodeId: string, currentLabel: string) => {
        setEditingId(nodeId);
        setEditingValue(currentLabel);
        originalLabelRef.current = currentLabel;
    }, []);

    const commitEdit = useCallback(() => {
        if (!editingId) return;
        const trimmed = editingValue.trim();
        if (trimmed && trimmed !== originalLabelRef.current) {
            // updateNode is the React Flow API for patching a single node's data
            if (typeof updateNode === 'function') {
                updateNode(editingId, { data: { label: trimmed } });
            } else {
                // Fallback: setNodes patch
                setNodes((nds: any[]) => nds.map(n =>
                    n.id === editingId ? { ...n, data: { ...n.data, label: trimmed } } : n
                ));
            }
        }
        setEditingId(null);
        setEditingValue('');
    }, [editingId, editingValue, updateNode, setNodes]);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditingValue('');
    }, []);

    const treeData = useMemo((): DataNode[] => {
        const roots = nodes.filter((n: any) => n.type === 'mindmap' && n.data?.depth === 0);
        if (roots.length === 0) return [];

        const childrenMap = new Map<string, string[]>();
        const structureEdges = edges.filter((e: any) => e.type !== 'relationshipEdge');

        for (const e of structureEdges) {
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push(e.target);
        }

        // [S-2] O(N) nodeMap — avoids O(N²) lookups in buildNode
        const nodeMap = new Map(nodes.map((n: any) => [n.id, n]));

        const buildNode = (nodeId: string): DataNode => {
            const node = nodeMap.get(nodeId) as any;
            const rawTitle = (node?.data?.label as string) || 'Untitled';
            const cleanLabel = rawTitle.replace(/<[^>]+>/g, '').trim() || 'Untitled';

            const childrenIds = (childrenMap.get(nodeId) || []).sort((a: string, b: string) => {
                const na = nodeMap.get(a) as any;
                const nb = nodeMap.get(b) as any;
                return (na?.position?.y ?? 0) - (nb?.position?.y ?? 0);
            });

            return {
                // [T-6] Custom title renders an editable input on double-click
                title: (
                    <EditableTitle
                        nodeId={nodeId}
                        label={cleanLabel}
                        editingId={editingId}
                        editingValue={editingValue}
                        onStartEdit={startEdit}
                        onChangeValue={setEditingValue}
                        onCommit={commitEdit}
                        onCancel={cancelEdit}
                    />
                ),
                key: nodeId,
                children: childrenIds.map((childId: string) => buildNode(childId))
            };
        };

        return roots.map((root: any) => buildNode(root.id));
    // editingId/editingValue are included so title renders update when edit mode changes
    }, [nodes, edges, editingId, editingValue, startEdit, commitEdit, cancelEdit]);

    if (treeData.length === 0) {
        return <Empty description="暂无导图节点" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    const onSelect = (selectedKeys: React.Key[]) => {
        if (selectedKeys.length > 0 && reactFlowInstance) {
            const nodeId = selectedKeys[0] as string;
            const node = getNodes().find((n: any) => n.id === nodeId);

            if (node && node.measured?.width) {
                const w = node.measured.width;
                const h = node.measured.height || 40;
                reactFlowInstance.setCenter(node.position.x + w / 2, node.position.y + h / 2, { zoom: 1.15, duration: 600 });
            } else if (node) {
                reactFlowInstance.setCenter(node.position.x, node.position.y, { zoom: 1.15, duration: 600 });
            }

            setNodes((nds: any[]) => nds.map(n => ({ ...n, selected: n.id === nodeId })));
        }
    };

    const selectedKeys = useMemo(() => {
        return nodes.filter((n: any) => n.selected).map((n: any) => n.id);
    }, [nodes]);

    return (
        <div style={{ padding: '12px 8px', height: '100%', overflowY: 'auto' }}>
            <div style={{ marginBottom: 8, fontSize: 11, color: '#94a3b8', paddingLeft: 4 }}>
                💡 双击节点名称可直接编辑
            </div>
            <Tree
                showLine={{ showLeafIcon: false }}
                defaultExpandAll
                treeData={treeData}
                onSelect={onSelect}
                selectedKeys={selectedKeys}
                blockNode
            />
        </div>
    );
};
