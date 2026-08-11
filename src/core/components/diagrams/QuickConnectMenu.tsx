import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { ShapePreview } from './ShapePreview';
import type { FlowchartShape } from '../custom-nodes/FlowchartNode';
import { focusFlowchartCanvas, focusFlowchartNodeById } from './flowchartTabNavigation';

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
    labelKey: string;
    searchTerms: readonly string[];
    color: string;
    groupKey: string;
}

interface LocalizedShapeDef extends ShapeDef {
    label: string;
    group: string;
}

const SHAPE_CATALOG: ShapeDef[] = [
    // ── 基础流程 ──
    { shape: 'rectangle', labelKey: 'process', searchTerms: ['process'], color: '#3b82f6', groupKey: 'basic' },
    { shape: 'pill', labelKey: 'startEnd', searchTerms: ['start', 'end', 'terminator'], color: '#10b981', groupKey: 'basic' },
    { shape: 'diamond', labelKey: 'decision', searchTerms: ['decision'], color: '#f59e0b', groupKey: 'basic' },
    { shape: 'parallelogram', labelKey: 'inputOutput', searchTerms: ['i/o', 'input', 'output'], color: '#8b5cf6', groupKey: 'basic' },
    { shape: 'database', labelKey: 'database', searchTerms: ['database', 'data'], color: '#6366f1', groupKey: 'basic' },
    { shape: 'predefined-process', labelKey: 'subProcess', searchTerms: ['sub-process', 'subprocess'], color: '#0ea5e9', groupKey: 'basic' },

    // ── 文档 ──
    { shape: 'document', labelKey: 'document', searchTerms: ['document'], color: '#ec4899', groupKey: 'document' },
    { shape: 'multi-document', labelKey: 'multiDocument', searchTerms: ['multi-doc', 'multiple document'], color: '#d946ef', groupKey: 'document' },
    { shape: 'note', labelKey: 'note', searchTerms: ['note'], color: '#a3a3a3', groupKey: 'document' },

    // ── 几何 ──
    { shape: 'ellipse', labelKey: 'ellipse', searchTerms: ['ellipse'], color: '#14b8a6', groupKey: 'geometry' },
    { shape: 'circle', labelKey: 'circle', searchTerms: ['circle'], color: '#06b6d4', groupKey: 'geometry' },
    { shape: 'triangle', labelKey: 'triangle', searchTerms: ['triangle'], color: '#f97316', groupKey: 'geometry' },
    { shape: 'hexagon', labelKey: 'hexagon', searchTerms: ['hexagon'], color: '#84cc16', groupKey: 'geometry' },
    { shape: 'trapezoid', labelKey: 'trapezoid', searchTerms: ['trapezoid'], color: '#22d3ee', groupKey: 'geometry' },
    { shape: 'star', labelKey: 'star', searchTerms: ['star'], color: '#eab308', groupKey: 'geometry' },

    // ── 高级 ──
    { shape: 'cloud', labelKey: 'cloud', searchTerms: ['cloud'], color: '#60a5fa', groupKey: 'advanced' },
    { shape: 'manual-input', labelKey: 'manualInput', searchTerms: ['manual input'], color: '#a78bfa', groupKey: 'advanced' },
    { shape: 'delay', labelKey: 'delay', searchTerms: ['delay'], color: '#fb923c', groupKey: 'advanced' },
    { shape: 'display', labelKey: 'display', searchTerms: ['display'], color: '#2dd4bf', groupKey: 'advanced' },
    { shape: 'off-page', labelKey: 'offPage', searchTerms: ['off-page', 'off page'], color: '#f472b6', groupKey: 'advanced' },
    { shape: 'internal-storage', labelKey: 'storage', searchTerms: ['storage'], color: '#c084fc', groupKey: 'advanced' },

    // ── 思维导图 ──
    { shape: 'mindmap' as FlowchartShape, labelKey: 'mindMap', searchTerms: ['mind map', 'mindmap'], color: '#f43f5e', groupKey: 'mindMap' },
];

function buildOption(def: LocalizedShapeDef, centralTopicLabel: string): QuickConnectOption {
    if (String(def.shape) === 'mindmap') {
        return {
            label: def.label,
            icon: <div style={{width: 28, height: 20, borderRadius: 10, background: def.color, border: '2px solid rgba(0,0,0,0.1)'}}></div>,
            type: 'mindmap',
            data: {
                label: centralTopicLabel,
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
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const listboxId = `quick-connect-options-${useId().replace(/:/g, '')}`;
    const [search, setSearch] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);

    const reactFlow = useReactFlow();

    const localizedShapes = useMemo<LocalizedShapeDef[]>(() => SHAPE_CATALOG.map(def => ({
        ...def,
        label: t(`designer.quickConnect.shapes.${def.labelKey}`),
        group: t(`designer.quickConnect.groups.${def.groupKey}`),
    })), [t]);

    const restoreCanvasFocus = useCallback(() => {
        requestAnimationFrame(() => {
            if (sourceNodeId && focusFlowchartNodeById(document, sourceNodeId)) return;
            focusFlowchartCanvas(document);
        });
    }, [sourceNodeId]);

    const closeMenu = useCallback((restoreFocus: boolean) => {
        setSearch('');
        setSelectedIndex(0);
        onClose();
        if (restoreFocus) restoreCanvasFocus();
    }, [onClose, restoreCanvasFocus]);

    // Click outside or press ESC to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                closeMenu(false);
            }
        };
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeMenu(true);
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
    }, [visible, closeMenu]);

    // Filter shapes by search
    const { filteredGroups, flatFilteredShapes } = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? localizedShapes.filter(s => (
                s.label.toLowerCase().includes(q)
                || s.group.toLowerCase().includes(q)
                || s.searchTerms.some(term => term.includes(q))
            ))
            : localizedShapes;

        // Group by category
        const groups = new Map<string, LocalizedShapeDef[]>();
        for (const s of filtered) {
            const arr = groups.get(s.group) || [];
            arr.push(s);
            groups.set(s.group, arr);
        }
        return { filteredGroups: groups, flatFilteredShapes: filtered };
    }, [localizedShapes, search]);

    // Initial focus and search reset
    useEffect(() => {
        if (visible) {
            // Get focus so we can capture keyboard immediately
            requestAnimationFrame(() => {
                const input = ref.current?.querySelector('input');
                if (input) input.focus();
                if (sourceNodeId) {
                    const sourceNode = reactFlow.getNode(sourceNodeId);
                    const sourceShape = sourceNode?.data?.shape as FlowchartShape;
                    if (sourceShape) {
                        const index = localizedShapes.findIndex(item => item.shape === sourceShape);
                        if (index !== -1) {
                            setSelectedIndex(index);
                        }
                    }
                }
            });
        }
    }, [visible, reactFlow, sourceNodeId, localizedShapes]);

    // Trigger preview when selection changes
    useEffect(() => {
        if (visible && onPreview && flatFilteredShapes.length > 0 && selectedIndex >= 0 && selectedIndex < flatFilteredShapes.length) {
            onPreview(buildOption(
                flatFilteredShapes[selectedIndex],
                t('designer.quickConnect.centralTopic'),
            ));
        } else if (onPreview) {
            onPreview(null);
        }
    }, [selectedIndex, flatFilteredShapes, visible, onPreview, t]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const columns = 4;
        const maxIndex = flatFilteredShapes.length - 1;

        if (maxIndex < 0) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            const selectedDef = flatFilteredShapes[selectedIndex];
            if (selectedDef) {
                setSearch('');
                setSelectedIndex(0);
                onSelect(buildOption(selectedDef, t('designer.quickConnect.centralTopic')));
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
            const selectedEl = document.getElementById(`${listboxId}-option-${newIndex}`);
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
                role="dialog"
                aria-label={t('designer.quickConnect.title')}
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
                        role="combobox"
                        aria-label={t('designer.quickConnect.searchLabel')}
                        aria-autocomplete="list"
                        aria-expanded="true"
                        aria-controls={listboxId}
                        aria-activedescendant={flatFilteredShapes.length > 0
                            ? `${listboxId}-option-${selectedIndex}`
                            : undefined}
                        placeholder={t('designer.quickConnect.searchPlaceholder')}
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
            <div
                id={listboxId}
                role="listbox"
                aria-label={t('designer.quickConnect.optionsLabel')}
                style={{ overflowY: 'auto', padding: '4px 6px 8px', flex: 1 }}
            >
                {flatFilteredShapes.length === 0 && (
                    <div role="status" style={{ padding: 16, textAlign: 'center', color: token.colorTextTertiary, fontSize: 12 }}>
                        {t('designer.quickConnect.noResults')}
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
                                const opt = buildOption(
                                    def,
                                    t('designer.quickConnect.centralTopic'),
                                );
                                const currentIndex = globalIndexCounter++;
                                const isSelected = currentIndex === selectedIndex;
                                return (
                                    <button
                                        key={def.shape}
                                        id={`${listboxId}-option-${currentIndex}`}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        tabIndex={-1}
                                        onClick={() => {
                                            setSearch('');
                                            setSelectedIndex(0);
                                            onSelect(opt);
                                        }}
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
                                    </button>
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
