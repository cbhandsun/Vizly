/**
 * MindMapOutlinePanel.tsx — Tree outline navigator (v2)
 *
 * Features:
 *  - Recursive tree rendering with expand/collapse
 *  - Real-time keyword search with highlight + auto-expand matching paths
 *  - Click to select + scroll-into-view on canvas
 *  - Selection sync from canvas → outline (auto-scrolls outline)
 *  - Expand All / Collapse All toolbar
 *  - Note & hyperLink badges on nodes
 *  - Correct EventMap usage (selectNodes / selectNewNode / unselectNodes)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Typography, Input, Empty, Button, Tooltip } from 'antd';
import {
    SearchOutlined, BranchesOutlined,
    MenuFoldOutlined, MenuUnfoldOutlined,
    LinkOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';

const { Text } = Typography;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function checkDescendantsMatch(node: NodeObj, filter: string): boolean {
    if (!node.children?.length) return false;
    const lc = filter.toLowerCase();
    return node.children.some(c =>
        (c.topic || '').toLowerCase().includes(lc)
        || checkDescendantsMatch(c, lc)
    );
}

function highlightText(text: string, filter: string): React.ReactNode {
    if (!filter) return text;
    const idx = text.toLowerCase().indexOf(filter.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <mark style={{
                background: 'rgba(99,102,241,0.22)',
                borderRadius: 3, padding: '0 2px',
                color: 'inherit',
            }}>
                {text.slice(idx, idx + filter.length)}
            </mark>
            {text.slice(idx + filter.length)}
        </>
    );
}

function countNodes(node: NodeObj): number {
    if (!node.children?.length) return 1;
    return 1 + node.children.reduce((s, c) => s + countNodes(c), 0);
}

/** Returns true if this node or any descendant matches the filter */
function nodeOrDescendantMatches(node: NodeObj, filter: string): boolean {
    const lc = filter.toLowerCase();
    if ((node.topic || '').toLowerCase().includes(lc)) return true;
    return node.children?.some(c => nodeOrDescendantMatches(c, lc)) ?? false;
}

// ─── Recursive node row ───────────────────────────────────────────────────────
interface OutlineNodeProps {
    node: NodeObj;
    depth: number;
    selectedId: string | null;
    filterText: string;
    expandAll: boolean;    // when true, force-expand all
    collapseAll: boolean;  // when true, force-collapse all (except root)
    isRoot: boolean;
    onSelect: (node: NodeObj) => void;
    nodeRef?: (id: string, el: HTMLDivElement | null) => void;
}

const OutlineNode: React.FC<OutlineNodeProps> = ({
    node, depth, selectedId, filterText, expandAll, collapseAll, isRoot, onSelect, nodeRef,
}) => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isSelected = node.id === selectedId;
    const label = node.topic || '(空节点)';
    const [localExpanded, setLocalExpanded] = useState(depth < 2);
    const rowRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Force-expand when searching; force-expand/collapse from toolbar
    const forceExpand = filterText
        ? nodeOrDescendantMatches(node, filterText)
        : expandAll;
    const expanded = filterText
        ? (nodeOrDescendantMatches(node, filterText) || localExpanded)
        : (isRoot ? true : (expandAll ? true : collapseAll ? false : localExpanded));

    // Register DOM ref for scroll-into-view
    useEffect(() => {
        nodeRef?.(node.id, rowRef.current);
        return () => nodeRef?.(node.id, null);
    }, [node.id, nodeRef]);

    // Inline editing helpers
    const startEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(node.topic || '');
        setEditing(true);
        setTimeout(() => inputRef.current?.select(), 30);
    };

    const commitEdit = async () => {
        const mind = getMindElixirInstance();
        if (!mind || !editing) return;
        setEditing(false);
        const trimmed = editValue.trim();
        if (!trimmed || trimmed === node.topic) return;
        try {
            const tpc = mind.findEle(node.id);
            if (tpc) await mind.setNodeTopic(tpc, trimmed);
        } catch {}
    };

    const cancelEdit = () => {
        setEditing(false);
        setEditValue('');
    };

    // Filter: hide if no match in this subtree
    if (filterText && !nodeOrDescendantMatches(node, filterText)) return null;

    const paddingLeft = depth * 16 + 8;
    const isHovered = false; // use CSS for hover

    return (
        <div>
            <div
                ref={rowRef}
                data-nodeid={node.id}
                onClick={() => onSelect(node)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: `5px 10px 5px ${paddingLeft}px`,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(99,102,241,0.1)' : 'transparent',
                    borderLeft: `2px solid ${isSelected ? '#6366f1' : 'transparent'}`,
                    borderRadius: isSelected ? '0 6px 6px 0' : 0,
                    transition: 'background 0.12s ease, border-color 0.12s ease',
                    userSelect: 'none',
                }}
                onMouseEnter={e => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.03)';
                }}
                onMouseLeave={e => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
            >
                {/* Expand/collapse toggle */}
                <span
                    onClick={e => { e.stopPropagation(); setLocalExpanded(v => !v); }}
                    style={{
                        width: 14, height: 14, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: '#94a3b8',
                        transform: expanded ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                        opacity: hasChildren ? 1 : 0,
                        pointerEvents: hasChildren ? 'auto' : 'none',
                    }}
                >
                    ▶
                </span>

                {/* Depth-based icon */}
                <span style={{ fontSize: 11, flexShrink: 0, lineHeight: 1 }}>
                    {isRoot ? '⭐' : depth === 1 ? '◆' : '·'}
                </span>

                {/* Label with search highlight — double-click to edit */}
                {editing ? (
                    <input
                        ref={inputRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                            e.stopPropagation();
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            flex: 1,
                            fontSize: 12.5,
                            fontWeight: isRoot ? 600 : depth === 1 ? 500 : 400,
                            background: 'rgba(99,102,241,0.08)',
                            border: '1px solid rgba(99,102,241,0.4)',
                            borderRadius: 4,
                            padding: '1px 5px',
                            color: '#1e293b',
                            outline: 'none',
                            minWidth: 0,
                        }}
                        autoFocus
                    />
                ) : (
                    <span
                        style={{
                            fontSize: 12.5,
                            color: isSelected ? '#6366f1' : '#1e293b',
                            fontWeight: isRoot ? 600 : depth === 1 ? 500 : 400,
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                        onDoubleClick={startEdit}
                        title="双击编辑"
                    >
                        {highlightText(label, filterText)}
                    </span>
                )}

                {/* Badges: note, hyperlink, child count */}
                <span style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                    {node.note && (
                        <Tooltip title={node.note.slice(0, 80) + (node.note.length > 80 ? '...' : '')}>
                            <FileTextOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
                        </Tooltip>
                    )}
                    {node.hyperLink && (
                        <Tooltip title={node.hyperLink}>
                            <LinkOutlined style={{ fontSize: 10, color: '#94a3b8' }} />
                        </Tooltip>
                    )}
                    {hasChildren && !expanded && (
                        <span style={{
                            fontSize: 9.5, color: '#94a3b8',
                            background: 'rgba(0,0,0,0.06)',
                            borderRadius: 8, padding: '1px 4px',
                        }}>
                            {node.children!.length}
                        </span>
                    )}
                </span>
            </div>

            {/* Children */}
            {hasChildren && expanded && (
                <div>
                    {node.children!.map(child => (
                        <OutlineNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            filterText={filterText}
                            expandAll={expandAll}
                            collapseAll={collapseAll}
                            isRoot={false}
                            onSelect={onSelect}
                            nodeRef={nodeRef}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────
const MindMapOutlinePanel: React.FC = () => {
    const [, setTick] = useState(0);
    const [filterText, setFilterText] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expandAll, setExpandAll] = useState(false);
    const [collapseAll, setCollapseAll] = useState(false);

    // Map from nodeId → DOM element for scroll-into-view
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => subscribeMindElixir(() => setTick(t => t + 1)), []);

    const mind = getMindElixirInstance();

    // Also listen to operation events to redraw outline after node changes
    useEffect(() => {
        if (!mind) return;
        const refresh = () => setTick(t => t + 1);
        mind.bus.addListener('operation', refresh);
        return () => { mind.bus.removeListener('operation', refresh); };
    }, [mind]);

    // Track canvas selection → sync outline highlight + scroll
    useEffect(() => {
        if (!mind) return;

        const syncSelect = (id: string | null) => {
            setSelectedId(id);
            if (!id) return;
            // Scroll outline panel to show the selected row
            requestAnimationFrame(() => {
                const el = nodeRefs.current.get(id);
                const container = scrollContainerRef.current;
                if (el && container) {
                    const elRect = el.getBoundingClientRect();
                    const cRect = container.getBoundingClientRect();
                    if (elRect.top < cRect.top || elRect.bottom > cRect.bottom) {
                        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    }
                }
            });
        };

        const onSelectNodes = (nodes: NodeObj[]) => syncSelect(nodes[0]?.id ?? null);
        const onSelectNewNode = (node: NodeObj) => syncSelect(node.id);
        const onUnselectNodes = () => syncSelect(null);

        mind.bus.addListener('selectNodes', onSelectNodes);
        mind.bus.addListener('selectNewNode', onSelectNewNode);
        mind.bus.addListener('unselectNodes', onUnselectNodes);

        return () => {
            mind.bus.removeListener('selectNodes', onSelectNodes);
            mind.bus.removeListener('selectNewNode', onSelectNewNode);
            mind.bus.removeListener('unselectNodes', onUnselectNodes);
        };
    }, [mind]);

    const handleNodeSelect = useCallback((node: NodeObj) => {
        if (!mind) return;
        setSelectedId(node.id);
        try {
            const tpcEl = mind.findEle(node.id);
            if (tpcEl) {
                mind.selectNode(tpcEl);
                mind.scrollIntoView(tpcEl);
            }
        } catch (e) {
            console.warn('[Outline] selectNode failed:', e);
        }
    }, [mind]);

    const registerNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
        if (el) nodeRefs.current.set(id, el);
        else nodeRefs.current.delete(id);
    }, []);

    const handleExpandAll = useCallback(() => {
        setExpandAll(true);
        setCollapseAll(false);
        // Reset after one render cycle so individual toggles still work
        setTimeout(() => setExpandAll(false), 100);
    }, []);

    const handleCollapseAll = useCallback(() => {
        setCollapseAll(true);
        setExpandAll(false);
        setTimeout(() => setCollapseAll(false), 100);
    }, []);

    if (!mind) {
        return (
            <div style={{ padding: 24 }}>
                <Empty description="思维导图加载中..." image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
        );
    }

    const data = mind.getData();
    const nodeCount = countNodes(data.nodeData);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* ── Header ───────────────────────────────────────────────── */}
            <div style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                flexShrink: 0,
            }}>
                <div style={{
                    display: 'flex', alignItems: 'center',
                    gap: 6, marginBottom: 8,
                }}>
                    <BranchesOutlined style={{ color: '#6366f1', fontSize: 13 }} />
                    <Text strong style={{ fontSize: 13, flex: 1 }}>大纲视图</Text>
                    <span style={{
                        fontSize: 11, color: '#94a3b8',
                        background: 'rgba(0,0,0,0.04)',
                        borderRadius: 8, padding: '1px 6px',
                    }}>
                        {nodeCount} 节点
                    </span>
                    <Tooltip title="展开全部">
                        <Button
                            size="small" type="text"
                            icon={<MenuUnfoldOutlined />}
                            onClick={handleExpandAll}
                            style={{ color: '#94a3b8', width: 24, padding: 0 }}
                        />
                    </Tooltip>
                    <Tooltip title="折叠全部">
                        <Button
                            size="small" type="text"
                            icon={<MenuFoldOutlined />}
                            onClick={handleCollapseAll}
                            style={{ color: '#94a3b8', width: 24, padding: 0 }}
                        />
                    </Tooltip>
                </div>

                <Input
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="搜索节点..."
                    size="small"
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                    allowClear
                    style={{ borderRadius: 8 }}
                />
            </div>

            {/* ── Search result count ───────────────────────────────────── */}
            {filterText && (
                <div style={{
                    padding: '4px 12px',
                    fontSize: 11, color: '#94a3b8',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    flexShrink: 0,
                }}>
                    搜索结果：<strong style={{ color: '#6366f1' }}>
                        {countMatchingNodes(data.nodeData, filterText)}
                    </strong> 个节点
                </div>
            )}

            {/* ── Node tree ─────────────────────────────────────────────── */}
            <div
                ref={scrollContainerRef}
                style={{ flex: 1, overflowY: 'auto', paddingTop: 4, paddingBottom: 16 }}
            >
                <OutlineNode
                    node={data.nodeData}
                    depth={0}
                    selectedId={selectedId}
                    filterText={filterText}
                    expandAll={expandAll}
                    collapseAll={collapseAll}
                    isRoot={true}
                    onSelect={handleNodeSelect}
                    nodeRef={registerNodeRef}
                />
            </div>
        </div>
    );
};

function countMatchingNodes(node: NodeObj, filter: string): number {
    const lc = filter.toLowerCase();
    let count = (node.topic || '').toLowerCase().includes(lc) ? 1 : 0;
    for (const child of node.children ?? []) {
        count += countMatchingNodes(child, filter);
    }
    return count;
}

export default MindMapOutlinePanel;
