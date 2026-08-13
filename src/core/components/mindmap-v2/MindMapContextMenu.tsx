/**
 * MindMapContextMenu.tsx — 自定义右键上下文菜单
 * 替换 mind-elixir 内置菜单，集成所有自定义操作
 *
 * v2: 修复 getObjById → findNodeById，新增形状快速选择
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
    ApartmentOutlined,
    ArrowDownOutlined,
    ArrowUpOutlined,
    BgColorsOutlined,
    BorderOutlined,
    BranchesOutlined,
    CaretDownOutlined,
    CaretRightOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    GatewayOutlined,
    LinkOutlined,
    MinusOutlined,
    NodeIndexOutlined,
    PlusOutlined,
    RadiusSettingOutlined,
} from '@ant-design/icons';
import { getMindElixirInstance } from './mindElixirStore';
import { findNodeById } from './migrate';
import { toSafeExternalUrl } from '../../utils/sanitizeHtml';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import type { NodeObj } from 'mind-elixir';
import { logMindmapContextMenuFailure } from './mindmapInteractionLogging';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { createMindMapSummaryForSelection } from './mindMapSummaryCreation';
import { useMindMapNodeDeletion } from './useMindMapNodeDeletion';
import { useTranslation } from 'react-i18next';
import { resolveMindMapContextMenuPosition } from './mindMapContextMenuLayout';

interface CtxPos { visible: boolean; x: number; y: number; nodeId: string | null; }
interface Props extends CtxPos {
    onClose: () => void;
    onRestoreFocus?: () => void;
}

const ITEM_STYLE: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 14px', cursor: 'pointer', borderRadius: 7,
    fontSize: 13, color: 'rgba(255,255,255,0.82)',
    transition: 'background 0.12s',
    userSelect: 'none', whiteSpace: 'nowrap',
    border: 'none', width: '100%', background: 'transparent', textAlign: 'left',
};
const DIVIDER = <div aria-orientation="horizontal" role="separator" style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 8px' }} />;

const KBD: React.FC<{ k: string }> = ({ k }) => (
    <kbd aria-hidden="true" style={{
        marginLeft: 'auto', padding: '1px 5px', borderRadius: 4,
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
        fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)',
    }}>{k}</kbd>
);

// ─── Shape options ────────────────────────────────────────────────────────────
const SHAPES = [
    { key: '',          labelKey: 'default', preview: <NodeIndexOutlined /> },
    { key: 'oval',      labelKey: 'oval', preview: <RadiusSettingOutlined /> },
    { key: 'rect',      labelKey: 'rectangle', preview: <BorderOutlined /> },
    { key: 'underline', labelKey: 'underline', preview: <MinusOutlined /> },
    { key: 'diamond',   labelKey: 'diamond', preview: <GatewayOutlined /> },
];

const MindMapContextMenu: React.FC<Props> = ({ visible, x, y, nodeId, onClose, onRestoreFocus }) => {
    const { t } = useTranslation();
    const mind = getMindElixirInstance();
    const ref = useRef<HTMLDivElement>(null);
    const shapeOptionsRef = useRef<HTMLDivElement>(null);
    const shapeTriggerRef = useRef<HTMLButtonElement>(null);
    const shapeGroupId = useId();
    const [shapeOpen, setShapeOpen] = useState(false);
    const closeContextMenu = useCallback(() => {
        setShapeOpen(false);
        onClose();
    }, [onClose]);
    const dismissContextMenu = useCallback(() => {
        closeContextMenu();
        requestAnimationFrame(() => onRestoreFocus?.());
    }, [closeContextMenu, onRestoreFocus]);
    const {
        deleteDialog,
        isDeleteDialogOpen,
        requestDelete,
    } = useMindMapNodeDeletion({
        mind,
        onDeleted: dismissContextMenu,
        onFailure: error => logMindmapContextMenuFailure('removeNode', error),
    });

    const moveMenuFocus = useCallback((key: string): boolean => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return false;
        const items = Array.from(
            ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
        );
        if (items.length === 0 || !ref.current?.contains(document.activeElement)) return false;
        const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
        if (currentIndex < 0) return false;
        if (key === 'Home') items[0]?.focus();
        else if (key === 'End') items[items.length - 1]?.focus();
        else if (key === 'ArrowDown') items[(currentIndex + 1 + items.length) % items.length]?.focus();
        else items[(currentIndex - 1 + items.length) % items.length]?.focus();
        return true;
    }, []);

    useEffect(() => {
        if (!shapeOpen) return;
        const focusFrame = requestAnimationFrame(() => {
            shapeOptionsRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
        });
        return () => cancelAnimationFrame(focusFrame);
    }, [shapeOpen]);

    // Close on outside click or Escape
    useEffect(() => {
        if (!visible) return;
        const focusFrame = requestAnimationFrame(() => {
            if (!ref.current?.contains(document.activeElement)) {
                ref.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
            }
        });
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isDeleteDialogOpen) {
                if (shapeOptionsRef.current?.contains(document.activeElement)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setShapeOpen(false);
                    requestAnimationFrame(() => shapeTriggerRef.current?.focus());
                    return;
                }
                dismissContextMenu();
                return;
            }
            if (moveMenuFocus(e.key)) e.preventDefault();
        };
        const onClick = (e: MouseEvent) => {
            if (!isDeleteDialogOpen && ref.current && !ref.current.contains(e.target as Node)) dismissContextMenu();
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onClick, true);
        return () => {
            cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('mousedown', onClick, true);
        };
    }, [dismissContextMenu, isDeleteDialogOpen, moveMenuFocus, visible]);

    if (!visible || !nodeId || !mind) return deleteDialog;

    const getTpc = () => {
        try { return mind.findEle(nodeId); } catch (error) {
            logMindmapContextMenuFailure('findTopicElement', error);
            return null;
        }
    };
    // ✅ Using our own DFS instead of mind-elixir's getObjById (which doesn't exist in v5)
    const getObj = () => {
        try { return findNodeById(mind.getData().nodeData, nodeId); } catch (error) {
            logMindmapContextMenuFailure('findNodeObject', error);
            return null;
        }
    };
    const obj = getObj();
    const isRoot = nodeId === mind.getData()?.nodeData?.id;
    const isExpanded = obj?.expanded !== false;
    const hasChildren = (obj?.children?.length ?? 0) > 0;
    const currentShape = (obj as NodeObj & { shapeClass?: string })?.shapeClass ?? '';
    const safeHyperLink = obj?.hyperLink ? toSafeExternalUrl(String(obj.hyperLink)) : null;

    const MENU_W = 230;
    const menuPosition = resolveMindMapContextMenuPosition({
        x,
        y,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        menuWidth: MENU_W,
    });

    const act = (fn: () => void, restoreFocus = true) => {
        try {
            fn();
        } finally {
            if (restoreFocus) dismissContextMenu();
            else closeContextMenu();
        }
    };

    const Item: React.FC<{ icon: React.ReactNode; label: string; kbd?: string; danger?: boolean; onClick: () => void }> =
        ({ icon, label, kbd: k, danger, onClick }) => (
            <button
                type="button"
                role="menuitem"
                aria-label={label}
                style={{ ...ITEM_STYLE, color: danger ? '#f87171' : ITEM_STYLE.color }}
                onClick={onClick}
                onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                <span aria-hidden="true" style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {k && <KBD k={k} />}
            </button>
        );

    return (
        <>
        <div
            ref={ref}
            className="mind-map-context-menu"
            role="menu"
            aria-label={t('plugins.mindmap.actions.contextMenuLabel')}
            onClick={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            style={{
                position: 'fixed', left: menuPosition.left, top: menuPosition.top, zIndex: 99999,
                background: 'rgba(12,12,18,0.92)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '6px 0',
                boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                minWidth: MENU_W,
                maxHeight: 'calc(100vh - 16px)',
                overflowY: 'auto',
                animation: 'ctxMenuIn 0.12s ease',
            }}
        >
            <style>{`
                @keyframes ctxMenuIn { from { opacity:0; transform:scale(0.95) } to { opacity:1; transform:scale(1) } }
                .mind-map-context-menu [role="menuitem"]:focus-visible,
                .mind-map-context-menu [role="menuitemradio"]:focus-visible {
                    outline: 2px solid #a5b4fc;
                    outline-offset: -2px;
                    background: rgba(99,102,241,0.2) !important;
                }
                @media (prefers-reduced-motion: reduce) {
                    .mind-map-context-menu { animation: none !important; }
                }
            `}</style>

            {/* Node info header */}
            {obj && (
                <div style={{ padding: '6px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>
                        {t('plugins.mindmap.contextMenu.nodeLabel')}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {obj.topic}
                    </div>
                </div>
            )}

            <Item icon={<EditOutlined />} label={t('plugins.mindmap.contextMenu.edit')} kbd="F2"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.editTopic(tpc); }, false)} />
            <Item icon={<PlusOutlined />} label={t('plugins.mindmap.contextMenu.addChild')} kbd="Tab"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.addChild(tpc, cleanMindMapChildNode()); })} />
            {!isRoot && (
                <>
                    <Item icon={<BranchesOutlined />} label={t('plugins.mindmap.contextMenu.addSibling')} kbd="Enter"
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.insertSibling('after', tpc, cleanMindMapChildNode()); })} />
                    <Item icon={<CopyOutlined />} label={t('plugins.mindmap.contextMenu.duplicate')} kbd="Ctrl+D"
                        onClick={() => act(() => {
                            try {
                                const tpc = getTpc();
                                if (tpc) mind.copyNode(tpc, tpc);
                            } catch (error) {
                                logMindmapContextMenuFailure('copyNode', error);
                            }
                        })} />
                </>
            )}

            {DIVIDER}

            {!isRoot && (
                <>
                    <Item icon={<ArrowUpOutlined />} label={t('plugins.mindmap.contextMenu.moveUp')}
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.moveUpNode(tpc); })} />
                    <Item icon={<ArrowDownOutlined />} label={t('plugins.mindmap.contextMenu.moveDown')}
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.moveDownNode(tpc); })} />
                    {DIVIDER}
                </>
            )}

            {hasChildren && (
                <Item
                    icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                    label={t(isExpanded
                        ? 'plugins.mindmap.actions.collapse'
                        : 'plugins.mindmap.actions.expand')}
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.expandNode(tpc, !isExpanded); })} />
            )}
            <Item icon={<ApartmentOutlined />} label={t('plugins.mindmap.contextMenu.createSummary')}
                onClick={() => act(() => {
                    const result = createMindMapSummaryForSelection(mind, nodeId);
                    if (result.ok) {
                        appMessage.success(result.message);
                        return;
                    }
                    if (result.error) logMindmapContextMenuFailure('createSummary', result.error);
                    if (result.code === 'create-failed') appMessage.error(result.message);
                    else appMessage.warning(result.message);
                })} />

            {DIVIDER}

            {/* ── Shape quick-pick ─────────────────────────────────────────── */}
            <button
                ref={shapeTriggerRef}
                type="button"
                role="menuitem"
                aria-expanded={shapeOpen}
                aria-controls={shapeGroupId}
                aria-haspopup="menu"
                style={ITEM_STYLE}
                onClick={() => setShapeOpen(value => !value)}
                onKeyDown={event => {
                    if (event.key === 'ArrowRight') {
                        event.preventDefault();
                        setShapeOpen(true);
                    }
                }}
            >
                <span aria-hidden="true" style={{ fontSize: 14, width: 18, textAlign: 'center' }}><BgColorsOutlined /></span>
                <span style={{ flex: 1 }}>{t('plugins.mindmap.contextMenu.shape')}</span>
                <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.4 }}>{shapeOpen ? <CaretDownOutlined rotate={180} /> : <CaretDownOutlined />}</span>
            </button>
            {shapeOpen && (
                <div
                    ref={shapeOptionsRef}
                    id={shapeGroupId}
                    role="menu"
                    aria-label={t('plugins.mindmap.contextMenu.shapeOptions')}
                    style={{ display: 'flex', gap: 4, padding: '0 14px 10px 42px' }}
                    onKeyDown={event => {
                        const options = Array.from(
                            shapeOptionsRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
                        );
                        const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
                        if (event.key === 'ArrowLeft' && currentIndex <= 0) {
                            event.preventDefault();
                            setShapeOpen(false);
                            shapeTriggerRef.current?.focus();
                            return;
                        }
                        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                            event.preventDefault();
                            const nextIndex = event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                    ? options.length - 1
                                    : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
                            options[nextIndex]?.focus();
                        }
                    }}
                >
                    {SHAPES.map(({ key, labelKey, preview }) => {
                        const label = t(`plugins.mindmap.contextMenu.shapes.${labelKey}`);
                        return (
                            <button
                                key={key || 'default'}
                                type="button"
                                role="menuitemradio"
                                aria-checked={currentShape === key}
                                aria-label={label}
                                title={label}
                                onClick={() => {
                                    const tpc = getTpc();
                                    if (!tpc || !obj) { dismissContextMenu(); return; }
                                    try {
                                        mind.reshapeNode(tpc, { ...obj, ...cleanMindMapNodePatch({ shapeClass: key || undefined }) });
                                    } catch (error) {
                                        logMindmapContextMenuFailure('setShapeClass', error);
                                    }
                                    dismissContextMenu();
                                }}
                                style={{
                                    flex: 1, padding: '4px 2px', borderRadius: 5, cursor: 'pointer',
                                    fontSize: 15, textAlign: 'center',
                                    border: currentShape === key
                                        ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                                    background: currentShape === key
                                        ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                                    color: currentShape === key ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
                                }}
                            >
                                <span aria-hidden="true" style={{ display: 'block' }}>{preview}</span>
                                <span aria-hidden="true" style={{ display: 'block', fontSize: 9, opacity: 0.6, marginTop: 1 }}>
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {safeHyperLink && (
                <>
                    {DIVIDER}
                    <Item icon={<LinkOutlined />} label={t('plugins.mindmap.contextMenu.openLink')}
                        onClick={() => act(() => {
                            window.open(safeHyperLink, '_blank', 'noopener,noreferrer');
                        })} />
                </>
            )}

            {!isRoot && (
                <>
                    {DIVIDER}
                    <Item icon={<DeleteOutlined />} label={t('plugins.mindmap.actions.deleteNode')} kbd="Del" danger
                        onClick={() => obj && requestDelete(obj)} />
                </>
            )}
        </div>
        {deleteDialog}
        </>
    );
};

export type { CtxPos };
export default MindMapContextMenu;
