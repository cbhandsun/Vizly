import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useReactFlow } from '@xyflow/react';
import { theme } from 'antd';
import { ShapePreview } from './ShapePreview';
import type { FlowchartShape } from '../custom-nodes/FlowchartNode';

export interface QuickConnectOption {
    label: string;
    icon: React.ReactNode;
    type: string; // node type
    data?: Record<string, unknown>; // node data
}

interface QuickConnectMenuProps {
    x: number;
    y: number;
    visible: boolean;
    onSelect: (option: QuickConnectOption) => void;
    onClose: () => void;
    onPreview?: (option: QuickConnectOption | null) => void;
    sourceNodeId?: string;
}

/**
 * 形状定义：shape + 默认颜色 + 显示标签
 */
interface ShapeDef {
    shape: FlowchartShape;
    label: string;
    color: string;
    group: string;
}

const SHAPE_CATALOG: ShapeDef[] = [
    // ── 基础流程 ──
    { shape: 'rectangle', label: 'Process', color: '#3b82f6', group: '基础' },
    { shape: 'pill', label: 'Start/End', color: '#10b981', group: '基础' },
    { shape: 'diamond', label: 'Decision', color: '#f59e0b', group: '基础' },
    { shape: 'parallelogram', label: 'I/O', color: '#8b5cf6', group: '基础' },
    { shape: 'database', label: 'Database', color: '#6366f1', group: '基础' },
    { shape: 'predefined-process', label: 'Sub-Process', color: '#0ea5e9', group: '基础' },

    // ── 文档 ──
    { shape: 'document', label: 'Document', color: '#ec4899', group: '文档' },
    { shape: 'multi-document', label: 'Multi-Doc', color: '#d946ef', group: '文档' },
    { shape: 'note', label: 'Note', color: '#a3a3a3', group: '文档' },

    // ── 几何 ──
    { shape: 'ellipse', label: 'Ellipse', color: '#14b8a6', group: '几何' },
    { shape: 'circle', label: 'Circle', color: '#06b6d4', group: '几何' },
    { shape: 'triangle', label: 'Triangle', color: '#f97316', group: '几何' },
    { shape: 'hexagon', label: 'Hexagon', color: '#84cc16', group: '几何' },
    { shape: 'trapezoid', label: 'Trapezoid', color: '#22d3ee', group: '几何' },
    { shape: 'star', label: 'Star', color: '#eab308', group: '几何' },

    // ── 高级 ──
    { shape: 'cloud', label: 'Cloud', color: '#60a5fa', group: '高级' },
    { shape: 'manual-input', label: 'Manual Input', color: '#a78bfa', group: '高级' },
    { shape: 'delay', label: 'Delay', color: '#fb923c', group: '高级' },
    { shape: 'display', label: 'Display', color: '#2dd4bf', group: '高级' },
    { shape: 'off-page', label: 'Off-Page', color: '#f472b6', group: '高级' },
    { shape: 'internal-storage', label: 'Storage', color: '#c084fc', group: '高级' },

    // ── 思维导图 ──
    { shape: 'mindmap' as FlowchartShape, label: 'Mind Map', color: '#f43f5e', group: '思维导图' },
];

function buildOption(def: ShapeDef): QuickConnectOption {
    if (String(def.shape) === 'mindmap') {
        return {
            label: def.label,
            icon: <div style={{width: 28, height: 20, borderRadius: 10, background: def.color, border: '2px solid rgba(0,0,0,0.1)'}}></div>,
            type: 'mindmap',
            data: {
                label: 'Central Topic',
                depth: 0,
                direction: 'LR',
                branchColor: def.color,
                isNew: true
            }
        };
    }

    return {
        label: def.label,
        icon: <ShapePreview shape={def.shape} size={28} color={def.color} />,
        type: 'flowchart',
        data: {
            shape: def.shape,
            label: def.label,
            theme: { main: def.color, border: def.color, text: '#fff' },
        },
    };
}

export const QuickConnectMenu: React.FC<QuickConnectMenuProps> = ({ x, y, visible, onSelect, onClose, onPreview, sourceNodeId }) => {
    const { token } = theme.useToken();
    const ref = useRef<HTMLDivElement>(null);
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [previousVisible, setPreviousVisible] = useState(visible);
    if (previousVisible !== visible) {
        setPreviousVisible(visible);
        if (!visible) {
            setSearch('');
            setSelectedIndex(0);
        }
    }

    const reactFlow = useReactFlow();

    // Click outside or press ESC to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                onClose();
            }
        };
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
                // Prevent React Flow from un-selecting the node when we just want to close the menu
                event.stopPropagation();
            }
        };
        if (visible) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleGlobalKeyDown, { capture: true });
        };
    }, [visible, onClose]);

    // Filter shapes by search
    const { filteredGroups, flatFilteredShapes } = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? SHAPE_CATALOG.filter(s => s.label.toLowerCase().includes(q) || s.group.toLowerCase().includes(q))
            : SHAPE_CATALOG;

        // Group by category
        const groups = new Map<string, ShapeDef[]>();
        for (const s of filtered) {
            const arr = groups.get(s.group) || [];
            arr.push(s);
            groups.set(s.group, arr);
        }
        return { filteredGroups: groups, flatFilteredShapes: filtered };
    }, [search]);

    // Initial focus and search reset
    useEffect(() => {
        if (visible) {
            // Get focus so we can capture keyboard immediately
            requestAnimationFrame(() => {
                const input = ref.current?.querySelector('input');
                if (input) input.focus();
                if (sourceNodeId && !search) {
                    const sourceNode = reactFlow.getNode(sourceNodeId);
                    const sourceShape = sourceNode?.data?.shape as FlowchartShape;
                    if (sourceShape) {
                        const index = flatFilteredShapes.findIndex(item => item.shape === sourceShape);
                        if (index !== -1) {
                            setSelectedIndex(index);
                        }
                    }
                }
            });
        }
    }, [visible, reactFlow, sourceNodeId, search, flatFilteredShapes]);

    // Trigger preview when selection changes
    useEffect(() => {
        if (visible && onPreview && flatFilteredShapes.length > 0 && selectedIndex >= 0 && selectedIndex < flatFilteredShapes.length) {
            onPreview(buildOption(flatFilteredShapes[selectedIndex]));
        } else if (onPreview) {
            onPreview(null);
        }
    }, [selectedIndex, flatFilteredShapes, visible, onPreview]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const columns = 4;
        const maxIndex = flatFilteredShapes.length - 1;

        if (e.key === 'Escape') {
            onClose();
            return;
        }

        if (maxIndex < 0) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const selectedDef = flatFilteredShapes[selectedIndex];
            if (selectedDef) {
                onSelect(buildOption(selectedDef));
            }
            return;
        }

        let newIndex = selectedIndex;
        if (e.key === 'ArrowRight') {
            newIndex = Math.min(selectedIndex + 1, maxIndex);
            e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
            newIndex = Math.max(selectedIndex - 1, 0);
            e.preventDefault();
        } else if (e.key === 'ArrowDown') {
            newIndex = Math.min(selectedIndex + columns, maxIndex);
            e.preventDefault();
        } else if (e.key === 'ArrowUp') {
            newIndex = Math.max(selectedIndex - columns, 0);
            e.preventDefault();
        }

        if (newIndex !== selectedIndex) {
            setSelectedIndex(newIndex);
            // Scroll selected item into view smoothly if needed
            const selectedEl = document.getElementById(`quick-connect-item-${newIndex}`);
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    };

    if (!visible) return null;

    // ── 行业标准智能定位 ──
    // 面板水平居中于锚点，垂直方向在锚点下方 16px，
    // 并自动夹紧到容器边界防止溢出
    const MENU_W = 280;
    const MENU_H = 360; // maxHeight
    const GAP = 16;     // 锚点到面板的间距
    const EDGE_PAD = 8; // 距容器边缘最小间距

    // 获取容器尺寸（菜单 position:fixed 受 transform containing block 影响，实际相对于 .react-flow）
    const rfContainer = document.querySelector('.react-flow') as HTMLElement | null;
    const containerW = rfContainer?.offsetWidth ?? window.innerWidth;
    const containerH = rfContainer?.offsetHeight ?? window.innerHeight;

    // 水平：居中对齐，夹紧到边界
    let posX = x - MENU_W / 2;
    posX = Math.max(EDGE_PAD, Math.min(posX, containerW - MENU_W - EDGE_PAD));

    // 垂直：优先在下方，空间不足则翻到上方
    let posY = y + GAP;
    if (posY + MENU_H > containerH - EDGE_PAD) {
        posY = y - MENU_H - GAP; // 翻到上方
    }
    posY = Math.max(EDGE_PAD, posY);

    let globalIndexCounter = 0;

    return (
        <React.Fragment>
            <style>{`
                @keyframes quickMenuPopIn {
                    0% { opacity: 0; transform: scale(0.95) translateY(-4px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
            `}</style>
            <div
                ref={ref}
                style={{
                    position: 'fixed',
                    left: posX,
                    top: posY,
                    zIndex: 2000,
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                    borderRadius: token.borderRadiusLG + 4,
                    boxShadow: '0 12px 48px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(255,255,255,0.6)',
                    padding: 0,
                    width: MENU_W,
                    maxHeight: MENU_H,
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'quickMenuPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    overflow: 'hidden',
                }}
            >
                {/* Search Input */}
                <div style={{ padding: '8px 10px 4px', borderBottom: `1px solid rgba(0,0,0,0.06)` }}>
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search shapes (e.g. Database)..."
                        value={search}
                        onChange={e => {
                            setSearch(e.target.value);
                            setSelectedIndex(0);
                        }}
                        onKeyDown={handleKeyDown}
                        style={{
                            width: '100%',
                            padding: '6px 12px',
                            border: '1px solid rgba(0,0,0,0.05)',
                            borderRadius: token.borderRadius + 2,
                            outline: 'none',
                            fontSize: 12,
                            background: 'rgba(0,0,0,0.03)',
                            color: token.colorText,
                            transition: 'all 0.2s',
                        }}
                        onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.border = `1px solid ${token.colorPrimary}`; e.currentTarget.style.boxShadow = `0 0 0 2px ${token.colorPrimary}20`; }}
                        onBlur={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; e.currentTarget.style.border = '1px solid rgba(0,0,0,0.05)'; e.currentTarget.style.boxShadow = 'none'; }}
                    />
                </div>

            {/* Shape Grid */}
            <div style={{ overflowY: 'auto', padding: '4px 6px 8px', flex: 1 }}>
                {flatFilteredShapes.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', color: token.colorTextTertiary, fontSize: 12 }}>
                        No shapes found
                    </div>
                )}
                {Array.from(filteredGroups.entries()).map(([group, shapes]) => (
                    <div key={group}>
                        <div style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: token.colorTextSecondary,
                            padding: '6px 6px 2px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                        }}>
                            {group}
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: 2,
                        }}>
                            {shapes.map((def) => {
                                const opt = buildOption(def);
                                const currentIndex = globalIndexCounter++;
                                const isSelected = currentIndex === selectedIndex;
                                return (
                                    <div
                                        key={def.shape}
                                        id={`quick-connect-item-${currentIndex}`}
                                        onClick={() => onSelect(opt)}
                                        title={def.label}
                                        style={{
                                            padding: '6px 4px',
                                            cursor: 'pointer',
                                            borderRadius: token.borderRadius,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: 2,
                                            transition: 'background 0.1s',
                                            backgroundColor: isSelected ? token.colorPrimaryBg : 'transparent',
                                            border: `1px solid ${isSelected ? token.colorPrimary : 'transparent'}`,
                                        }}
                                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                                    >
                                        <div style={{ lineHeight: 0 }}>{opt.icon}</div>
                                        <span style={{
                                            fontSize: 9,
                                            color: isSelected ? token.colorPrimary : token.colorTextSecondary,
                                            lineHeight: '12px',
                                            textAlign: 'center',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            maxWidth: '100%',
                                            fontWeight: isSelected ? 600 : 400,
                                        }}>
                                            {def.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            </div>
        </React.Fragment>
    );
};
