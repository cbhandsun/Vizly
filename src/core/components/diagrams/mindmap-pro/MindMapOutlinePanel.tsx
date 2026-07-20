import React, { useMemo, useState, useCallback, useRef } from 'react';
import { Tree, Empty, Input } from 'antd';
import { PluginContext } from '../../../types/plugin';
import type { DataNode } from 'antd/es/tree';
import { SearchOutlined } from '@ant-design/icons';
import type { InputRef } from 'antd';

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
    const inputRef = useRef<InputRef>(null);

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

    // [Search] Filter state
    const [searchText, setSearchText] = useState('');
    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [autoExpandParent, setAutoExpandParent] = useState(true);

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

    // [Search] Build flat list of all (nodeId, label) for search matching
    const allNodeLabels = useMemo<Array<{ id: string; label: string }>>(() => {
        return nodes
            .filter((n: any) => n.type === 'mindmap')
            .map((n: any) => ({
                id: n.id,
                label: ((n.data?.label as string) || '').replace(/<[^>]+>/g, '').trim()
            }));
    }, [nodes]);

    // When search text changes, expand all ancestor paths of matching nodes
    const handleSearch = useCallback((value: string) => {
        setSearchText(value);
        if (!value.trim()) {
            setExpandedKeys([]);
            setAutoExpandParent(false);
            return;
        }

        // Build parent map
        const parentMap = new Map<string, string>();
        edges.forEach((e: any) => { if (e.type !== 'relationshipEdge') parentMap.set(e.target, e.source); });

        const matched = allNodeLabels
            .filter(n => n.label.toLowerCase().includes(value.toLowerCase()))
            .map(n => n.id);

        // Collect all ancestors of matched nodes
        const keysToExpand = new Set<string>();
        matched.forEach(id => {
            let cur = parentMap.get(id);
            while (cur) {
                keysToExpand.add(cur);
                cur = parentMap.get(cur);
            }
        });
        setExpandedKeys(Array.from(keysToExpand));
        setAutoExpandParent(true);
    }, [allNodeLabels, edges]);

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

            // [Search] Highlight matching text
            const isMatched = searchText.trim() && cleanLabel.toLowerCase().includes(searchText.toLowerCase());
            const titleEl = (
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
            );

            return {
                title: isMatched ? (
                    <span style={{ background: 'rgba(99,102,241,0.15)', borderRadius: 3, padding: '0 2px' }}>
                        {titleEl}
                    </span>
                ) : titleEl,
                key: nodeId,
                children: childrenIds.map((childId: string) => buildNode(childId))
            };
        };

        return roots.map((root: any) => buildNode(root.id));
    // editingId/editingValue/searchText are included so title renders update when edit/search mode changes
    }, [nodes, edges, editingId, editingValue, searchText, startEdit, commitEdit, cancelEdit]);

    const selectedKeys = useMemo(() => {
        return nodes.filter((n: any) => n.selected).map((n: any) => n.id);
    }, [nodes]);

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

    return (
        <div style={{ padding: '12px 8px', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* [Search] Search bar */}
            <div style={{ marginBottom: 10, paddingLeft: 4, paddingRight: 4 }}>
                <Input
                    size="small"
                    placeholder="搜索节点..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8', fontSize: 12 }} />}
                    value={searchText}
                    onChange={e => handleSearch(e.target.value)}
                    allowClear
                    onClear={() => handleSearch('')}
                    style={{ borderRadius: 8 }}
                />
            </div>
            <div style={{ marginBottom: 8, fontSize: 11, color: '#94a3b8', paddingLeft: 4 }}>
                💡 双击节点名称可直接编辑
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <Tree
                    showLine={{ showLeafIcon: false }}
                    defaultExpandAll={!searchText}
                    expandedKeys={searchText ? expandedKeys : undefined}
                    autoExpandParent={autoExpandParent}
                    onExpand={(keys) => { setExpandedKeys(keys as string[]); setAutoExpandParent(false); }}
                    treeData={treeData}
                    onSelect={onSelect}
                    selectedKeys={selectedKeys}
                    blockNode
                />
            </div>
        </div>
    );
};
