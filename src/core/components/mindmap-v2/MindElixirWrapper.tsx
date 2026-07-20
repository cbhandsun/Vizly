/**
 * MindElixirWrapper.tsx — Core integration component
 *
 * Embeds a mind-elixir instance inside the Vizly canvas.
 * Handles:
 *   - Lifecycle management (init / destroy)
 *   - Data load from PluginContext and save back on change
 *   - Keyboard shortcuts bridging (Ctrl+Z undo, Ctrl+Y redo)
 *   - Theme sync when Vizly theme changes
 *   - Context ref exposure via MindElixirContext
 *   - CSS gradient-bg fix (background-color can't handle gradients)
 */

import React, {
    useEffect,
    useRef,
    useCallback,
    useState,
} from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, MindElixirData, NodeObj, Topic } from 'mind-elixir';
import 'mind-elixir/style.css';
import './MindElixirWrapper.css';

import { PluginContext } from '../../types/plugin';
import { VIZLY_HYPER_THEME, VIZLY_HYPER_DARK_THEME, VIZLY_THEMES } from './theme';
import { migrateV1ToV2, directionStringToInt, findNodeById } from './migrate';
import { isMindMapV2 } from './types';
import { registerMindElixirInstance, unregisterMindElixirInstance } from './mindElixirStore';
import { MindElixirContext } from './MindElixirContext';
import MindMapContextMenu, { type CtxPos } from './MindMapContextMenu';
import MindMapFloatingBar from './MindMapFloatingBar';
import MindMapBatchBar from './MindMapBatchBar';
import MindMapEmptyGuide from './MindMapEmptyGuide';
import MindMapOutlinePanel from './MindMapOutlinePanel';
import MindMapHistoryPanel from './MindMapHistoryPanel';
import { MindMapTaskKanban } from './MindMapTaskKanban';
import { setCurrentDiagramId, addHistoryRecord, emitToggleHistory } from './mindmapHistoryStore';
import MindMapYjsIntegration from './MindMapYjsIntegration';
import MindMapBoundaries from './MindMapBoundaries';
import MindMapMultiplayerCursors from './MindMapMultiplayerCursors';
import { MindMapAIPanel } from './MindMapAIPanel';
import { emitToggleOutline } from './mindmapOutlineStore';
import { MindMapSpeakerNotes } from './MindMapSpeakerNotes';
import { marked } from 'marked';
import { sanitizeMarkdownHtml, toSafeExternalUrl } from '../../utils/sanitizeHtml';
import { cleanMindMapData } from './mindmapTreeSanitizer';
import { cleanMindMapBridgeNode, cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { parseMindElixirClipboardNodes } from './mindmapClipboardSecurity';
import { createSafeMindMapV2Payload } from './mindmapPersistenceSecurity';
import { getSafeMindMapShortcutAction } from './mindmapKeyboardSecurity';
import { persistMindMapThemeKey, readStoredMindMapThemeKey, resolveMindMapThemeKey } from './mindmapThemeStorage';
import {
    logMindmapWrapperAiBridgeFailure,
    logMindmapWrapperClipboardPayloadBlocked,
    logMindmapWrapperCopyTopicFailure,
    logMindmapWrapperHyperlinkOpenFailure,
    logMindmapWrapperNotePreviewFailure,
    logMindmapWrapperSafePasteFailure,
    logMindmapWrapperSafeShortcutFailure,
    logMindmapWrapperSaveFailure,
} from './mindmapWrapperLogging';
import { coerceMindElixirDirection } from './mindElixirDirection';
import { projectMindMapTreeToBridge } from './mindmapBridgeProjection';
import { bindMindElixirOperationEffects } from './mindElixirOperationEffects';
import { applyMindElixirPalette, clearMindElixirPalette } from './mindElixirThemeDom';
import { useMindElixirFileDrop } from './useMindElixirFileDrop';

// ─── Default data shown for a fresh mindmap ──────────────────────────────────
const DEFAULT_DATA: MindElixirData = {
    nodeData: {
        id: 'root',
        topic: '中心主题',
        // 'root' is not in NodeObj type but mind-elixir uses it at runtime for the root node
        ...({ root: true } as any),
        children: [
            { id: 'b1', topic: '分支一', children: [] },
            { id: 'b2', topic: '分支二', children: [] },
            { id: 'b3', topic: '分支三', children: [] },
        ],
    },
    direction: MindElixir.SIDE as 0 | 1 | 2,
};

// ─── Load / Save helpers ──────────────────────────────────────────────────────
function loadData(ctx: PluginContext): MindElixirData {
    try {
        const nodes = (ctx as any).getNodes?.() ?? [];
        const edges = (ctx as any).getEdges?.() ?? [];

        // Restore persisted direction from localStorage (user may have changed it)
        const { directionStringToInt: d2i } = { directionStringToInt };
        const lsDir = localStorage.getItem('vizly_mindmap_dir');
        const persistedDir = lsDir ? coerceMindElixirDirection(d2i(lsDir)) : null;

        if (nodes.length === 0) return {
            ...DEFAULT_DATA,
            direction: persistedDir ?? DEFAULT_DATA.direction,
        };

        // Detect v2 format stored in a special "meta" node
        const metaNode = nodes.find((n: any) => n.id === '__mindmap_meta__');
        if (metaNode?.data?.mindmapV2) {
            const v2 = metaNode.data.mindmapV2;
            if (isMindMapV2(v2)) {
                // If themeKey persisted separately, sync localStorage
                if (v2.themeKey) persistMindMapThemeKey(v2.themeKey);
                return {
                    nodeData: v2.nodeData,
                    direction: persistedDir ?? coerceMindElixirDirection(v2.direction),
                    theme: v2.theme ?? VIZLY_HYPER_THEME,
                };
            }
        }

        // Fallback: migrate from v1 (RF nodes/edges)
        const mindmapNodes = nodes.filter((n: any) => n.type === 'mindmap');
        if (mindmapNodes.length === 0) return {
            ...DEFAULT_DATA,
            direction: persistedDir ?? DEFAULT_DATA.direction,
        };

        // If only the root node exists with no children edges, treat as fresh mindmap
        const childEdges = edges.filter((e: any) => e.type !== 'relationshipEdge');
        const realNodes = mindmapNodes.filter((n: any) => n.id !== '__mindmap_meta__');
        if (realNodes.length === 1 && childEdges.length === 0) {
            const rootLabel = (realNodes[0].data?.label as string) || '中心主题';
            return {
                ...DEFAULT_DATA,
                direction: persistedDir ?? DEFAULT_DATA.direction,
                nodeData: { ...DEFAULT_DATA.nodeData, topic: rootLabel },
            };
        }

        const v2 = migrateV1ToV2({ nodes: mindmapNodes, edges });
        return {
            nodeData: v2.nodeData,
            direction: persistedDir ?? coerceMindElixirDirection(v2.direction),
            theme: VIZLY_HYPER_THEME,
        };
    } catch {
        return DEFAULT_DATA;
    }
}


function saveData(ctx: PluginContext, mind: MindElixirInstance): void {
    try {
        const themeKey = resolveMindMapThemeKey();
        const v2Payload = createSafeMindMapV2Payload(mind.getData(), themeKey, MindElixir.SIDE as 0 | 1 | 2 | 3);

        const setNodes = (ctx as any).setNodes;
        if (!setNodes) return;

        setNodes((prev: any[]) => {
            // Remove old meta node if present
            const filtered = prev.filter((n: any) => n.id !== '__mindmap_meta__');
            return [
                ...filtered,
                {
                    id: '__mindmap_meta__',
                    type: 'mindmap',
                    position: { x: -9999, y: -9999 }, // off-screen, invisible
                    hidden: true,
                    data: { mindmapV2: v2Payload, depth: -1, label: '' },
                },
            ];
        });
    } catch (e) {
        logMindmapWrapperSaveFailure(e);
    }
}

function isMindMapTextEditingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.closest('#input-box')) return true;
    if (target.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

// ─── Wrapper Component ────────────────────────────────────────────────────────
interface MindElixirWrapperProps {
    ctx: PluginContext;
    isDark?: boolean;
    onNodeSelect?: (node: NodeObj | null) => void;
}

const MindElixirWrapper: React.FC<MindElixirWrapperProps> = ({ ctx, isDark, onNodeSelect }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mindRef = useRef<MindElixirInstance | null>(null);
    const [instance, setInstance] = useState<MindElixirInstance | null>(null);
    const [selectedNode, setSelectedNode] = useState<NodeObj | null>(null);
    const saveRef = useRef<() => void>(() => {});

    // Keep save callback fresh without recreating the debounced fn
    saveRef.current = useCallback(() => {
        if (mindRef.current) saveData(ctx, mindRef.current);
    }, [ctx]);

    const [ctxMenu, setCtxMenu] = useState<CtxPos>({ visible: false, x: 0, y: 0, nodeId: null });
    const [notePreview, setNotePreview] = useState<{ safeHtml: string; x: number; y: number } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const themeStyle = containerRef.current.style;

        const initialData = loadData(ctx);

        // Theme priority: localStorage key > isDark flag > default
        const storedThemeKey = readStoredMindMapThemeKey();
        const theme = storedThemeKey
            ? (VIZLY_THEMES[storedThemeKey] ?? (isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME))
            : (isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME);

        const diagramId = ctx.diagramId;
        if (diagramId) {
            setCurrentDiagramId(diagramId);
        }

        const mind = new MindElixir({
            el: containerRef.current,
            direction: (initialData.direction ?? MindElixir.SIDE) as 0 | 1 | 2,
            editable: true,
            contextMenu: false,   // disabled: using custom MindMapContextMenu
            toolBar: false,
            keypress: true,
            overflowHidden: false,
            mouseSelectionButton: 0,
            theme,
            // ── Inline Markdown rendering (bold, italic, code, links) ────────
            markdown: (text: string) => {
                try {
                    // parseInline returns string, no wrapping <p> tags
                    return sanitizeMarkdownHtml((marked.parseInline(text) as string) ?? text);
                } catch {
                    return text;
                }
            },
        });

        mind.init(initialData);
        mindRef.current = mind;
        setInstance(mind);
        registerMindElixirInstance(mind);  // expose to toolbar and other out-of-tree consumers

        if (diagramId) {
            addHistoryRecord('加载思维导图', initialData.nodeData);
        }

        // ── 拦截 changeTheme 并同步彩虹色样式 ──────────────────────────
        const originalChangeTheme = mind.changeTheme.bind(mind);
        mind.changeTheme = (newTheme: Parameters<MindElixirInstance['changeTheme']>[0]) => {
            originalChangeTheme(newTheme);
            applyMindElixirPalette(themeStyle, newTheme);
        };

        applyMindElixirPalette(themeStyle, theme);

        // ── 系统深色/浅色主题自动跟随 ─────────────────────────────────────────
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handleColorScheme = (e: MediaQueryListEvent) => {
            // 只在用户没有手动选主题时自动切换
            const hasManualTheme = readStoredMindMapThemeKey();
            if (hasManualTheme) return;
            mind.changeTheme(e.matches ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME);
        };
        mq.addEventListener('change', handleColorScheme);

        // ── Ctrl+Click → open hyperLink ──────────────────────────────────────
        const handleHyperLinkClick = (e: MouseEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            const tpc = (e.target as HTMLElement)?.closest?.('me-tpc') as HTMLElement | null;
            if (!tpc) return;
            // me-tpc elements have a data-nodeid or we can find the id from mind.currentNode
            const nodeId = tpc.getAttribute('data-nodeid')
                || (mind.currentNode as any)?.id
                || (mind.currentNodes?.[0] as any)?.id;
            if (!nodeId) return;
            try {
                const obj = mind.getObjById(nodeId, mind.getData().nodeData);
                if (obj?.hyperLink) {
                    e.preventDefault();
                    const safeUrl = toSafeExternalUrl(obj.hyperLink);
                    if (safeUrl) window.open(safeUrl, '_blank', 'noopener,noreferrer');
                }
            } catch (error) {
                logMindmapWrapperHyperlinkOpenFailure(error);
            }
        };
        mind.container.addEventListener('click', handleHyperLinkClick);

        // ── Custom contextmenu ────────────────────────────────────────────────
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const tpc = (e.target as HTMLElement)?.closest?.('me-tpc') as HTMLElement | null;
            if (!tpc) return;
            const wrapper = tpc.closest('me-wrapper') as HTMLElement | null;
            const nodeId = tpc.getAttribute('data-nodeid')
                || wrapper?.getAttribute('data-nodeid')
                || (mind.currentNode as any)?.id
                || null;
            if (!nodeId) return;
            setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, nodeId });
        };
        mind.container.addEventListener('contextmenu', handleContextMenu);

        const unbindOperationEffects = bindMindElixirOperationEffects({
            mind,
            root: containerRef.current,
            onSave: () => saveRef.current(),
        });

        const handleSafeMindElixirPaste = (event: ClipboardEvent) => {
            const text = event.clipboardData?.getData('text/plain') ?? '';
            let nodes: NodeObj[] | null;
            try {
                nodes = parseMindElixirClipboardNodes(text);
            } catch (err) {
                event.preventDefault();
                event.stopImmediatePropagation();
                logMindmapWrapperClipboardPayloadBlocked(err);
                return;
            }
            if (!nodes) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const target = mind.currentNode;
            if (!target || nodes.length === 0) return;
            try {
                mind.copyNodes(nodes.map(nodeObj => ({ nodeObj })) as any, target);
            } catch (err) {
                logMindmapWrapperSafePasteFailure(err);
            }
        };
        mind.container.addEventListener('paste', handleSafeMindElixirPaste, true);

        const handleSafeNodeShortcut = (event: KeyboardEvent) => {
            const action = getSafeMindMapShortcutAction(event);
            if (!action || !mind.editable || isMindMapTextEditingTarget(event.target)) return;

            const tpc: Topic | null = mind.currentNode;
            if (!tpc) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            try {
                const nodeObj = tpc.nodeObj;
                if (action === 'addChild') {
                    mind.addChild(tpc, cleanMindMapChildNode());
                } else if (action === 'insertParent') {
                    if (nodeObj?.parent) {
                        mind.insertParent(tpc, cleanMindMapChildNode());
                    }
                } else if (nodeObj?.parent) {
                    mind.insertSibling(
                        action === 'insertSiblingBefore' ? 'before' : 'after',
                        tpc,
                        cleanMindMapChildNode(),
                    );
                } else {
                    mind.addChild(tpc, cleanMindMapChildNode());
                }
            } catch (err) {
                logMindmapWrapperSafeShortcutFailure(err);
            }
        };
        mind.container.addEventListener('keydown', handleSafeNodeShortcut, true);

        // ── Keyboard shortcuts: Alt+O (outline), Ctrl+Shift+C (copy text) ────
        const handleGlobalKeys = (e: KeyboardEvent) => {
            // Alt+O — toggle outline panel
            if (e.altKey && e.key.toLowerCase() === 'o') {
                e.preventDefault();
                emitToggleOutline();
                return;
            }
            // Alt+H — toggle history panel
            if (e.altKey && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                emitToggleHistory();
                return;
            }
            // Ctrl+Shift+C — copy selected node topic to clipboard
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
                try {
                    const currentNode = (mind as any).currentNode as HTMLElement | null;
                    const nodeId = currentNode?.dataset?.nodeid ?? '';
                    if (!nodeId) return;
                    const obj = findNodeById(mind.getData().nodeData, nodeId);
                    if (obj?.topic) {
                        navigator.clipboard.writeText(obj.topic).catch((error) => {
                            logMindmapWrapperCopyTopicFailure(error);
                        });
                    }
                } catch (error) {
                    logMindmapWrapperCopyTopicFailure(error);
                }
                return;
            }
        };
        document.addEventListener('keydown', handleGlobalKeys);

        // Track selected node for property panel
        // EventMap has 'selectNodes' (array) and 'selectNewNode' (single), not 'selectNode'
        const handleSelectNodes = (nodes: NodeObj[]) => {
            const nodeObj = nodes[0] ?? null;
            setSelectedNode(nodeObj);
            onNodeSelect?.(nodeObj);
        };
        const handleSelectNewNode = (nodeObj: NodeObj) => {
            setSelectedNode(nodeObj);
            onNodeSelect?.(nodeObj);
        };
        const handleUnselectNodes = () => {
            setSelectedNode(null);
            onNodeSelect?.(null);
        };
        mind.bus.addListener('selectNodes', handleSelectNodes);
        mind.bus.addListener('selectNewNode', handleSelectNewNode);
        mind.bus.addListener('unselectNodes', handleUnselectNodes);

        // ── Note hover preview ────────────────────────────────────────────────────
        const handleNoteOver = (e: MouseEvent) => {
            const wrapper = (e.target as HTMLElement).closest('me-wrapper[data-note]') as HTMLElement | null;
            if (!wrapper) { setNotePreview(null); return; }
            const tpcEl = wrapper.querySelector('[nodeid]') as HTMLElement | null;
            const nodeId = tpcEl?.getAttribute('nodeid') ?? '';
            if (!nodeId) return;
            try {
                const node = findNodeById(mind.getData().nodeData, nodeId);
                if (node?.note) {
                    const safeHtml = sanitizeMarkdownHtml(marked.parse(node.note) as string);
                    const rect = wrapper.getBoundingClientRect();
                    setNotePreview({ safeHtml, x: rect.left, y: rect.top });
                }
            } catch (error) {
                logMindmapWrapperNotePreviewFailure(error);
            }
        };
        const handleNoteOut = (e: MouseEvent) => {
            const related = e.relatedTarget as HTMLElement | null;
            if (!related?.closest?.('me-wrapper[data-note]')) setNotePreview(null);
        };
        mind.container?.addEventListener('mouseover', handleNoteOver);
        mind.container?.addEventListener('mouseout', handleNoteOut);

        return () => {
            mq.removeEventListener('change', handleColorScheme);
            unbindOperationEffects();
            mind.container.removeEventListener('paste', handleSafeMindElixirPaste, true);
            mind.container.removeEventListener('keydown', handleSafeNodeShortcut, true);
            mind.bus.removeListener('selectNodes', handleSelectNodes);
            mind.bus.removeListener('selectNewNode', handleSelectNewNode);
            mind.bus.removeListener('unselectNodes', handleUnselectNodes);
            mind.container?.removeEventListener('click', handleHyperLinkClick);
            mind.container?.removeEventListener('contextmenu', handleContextMenu);
            mind.container?.removeEventListener('mouseover', handleNoteOver);
            mind.container?.removeEventListener('mouseout', handleNoteOut);
            document.removeEventListener('keydown', handleGlobalKeys);
            clearMindElixirPalette(themeStyle);
            // mind-elixir doesn't have a formal destroy() — unmounting the div is enough
            unregisterMindElixirInstance();
            mindRef.current = null;
            setInstance(null);
            setSelectedNode(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — only init once

    // Sync theme when dark mode changes
    useEffect(() => {
        if (!mindRef.current) return;
        mindRef.current.changeTheme(isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME);
    }, [isDark]);

    // Register __flowDataBridge for AI chat panel & other global integrations
    useEffect(() => {
        const diagramId = ctx.diagramId;
        if (!diagramId) return;

        if (!(window as any).__flowDataBridge) {
            (window as any).__flowDataBridge = {};
        }

        const bridgeObj = {
            get nodes() {
                if (!mindRef.current) return [];
                const data = mindRef.current.getData();
                return projectMindMapTreeToBridge(data.nodeData).nodes;
            },
            get edges() {
                if (!mindRef.current) return [];
                const data = mindRef.current.getData();
                return projectMindMapTreeToBridge(data.nodeData).edges;
            },
            importData: async (newData: any) => {
                if (!mindRef.current) return;
                try {
                    const v2 = isMindMapV2(newData) || newData?.nodeData
                        ? newData
                        : migrateV1ToV2(newData);
                    const safeData = cleanMindMapData(v2);
                    mindRef.current.refresh({
                        ...safeData,
                        direction: coerceMindElixirDirection(safeData.direction),
                    });
                    saveData(ctx, mindRef.current);
                } catch (err) {
                    logMindmapWrapperAiBridgeFailure('importData', err);
                }
            },
            addNode: async (args: { label: string; shape?: string }) => {
                if (!mindRef.current) return;
                try {
                    const parentId = mindRef.current.currentNode?.id || 'root';
                    const parent = mindRef.current.findEle(parentId);
                    if (parent) {
                        const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
                        mindRef.current.addChild(parent, cleanMindMapBridgeNode(args, newId));
                        saveData(ctx, mindRef.current);
                        return newId;
                    }
                } catch (err) {
                    logMindmapWrapperAiBridgeFailure('addNode', err);
                }
            },
            addChild: async (args: { parentId: string; label: string; side?: 'left' | 'right' }) => {
                if (!mindRef.current) return;
                try {
                    const parent = mindRef.current.findEle(args.parentId);
                    if (parent) {
                        const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
                        mindRef.current.addChild(parent, cleanMindMapBridgeNode(args, newId));
                        saveData(ctx, mindRef.current);
                        return newId;
                    }
                } catch (err) {
                    logMindmapWrapperAiBridgeFailure('addChild', err);
                }
            },
            deleteNodes: async (ids: string[]) => {
                if (!mindRef.current) return;
                try {
                    const els = ids.map(id => mindRef.current!.findEle(id)).filter(Boolean);
                    if (els.length > 0) {
                        mindRef.current.removeNodes(els);
                        saveData(ctx, mindRef.current);
                    }
                } catch (err) {
                    logMindmapWrapperAiBridgeFailure('deleteNodes', err);
                }
            },
            collapse: async (id: string, collapsed: boolean) => {
                if (!mindRef.current) return;
                try {
                    const el = mindRef.current.findEle(id);
                    if (el) {
                        mindRef.current.expandNode(el, !collapsed);
                        saveData(ctx, mindRef.current);
                    }
                } catch (err) {
                    logMindmapWrapperAiBridgeFailure('collapse', err);
                }
            }
        };

        (window as any).__flowDataBridge[diagramId] = bridgeObj;

        return () => {
            delete (window as any).__flowDataBridge?.[diagramId];
        };
    }, [ctx, instance]);

    const { handleDragOver, handleDrop } = useMindElixirFileDrop(mindRef);

    const [isDragOver, setIsDragOver] = useState(false);

    return (
        <MindElixirContext.Provider value={{ instance, selectedNode }}>
            <div
                onDragOver={(e) => { handleDragOver(e); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => { handleDrop(e); setIsDragOver(false); }}
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 10,
                    background: isDark ? '#0f172a' : '#f8fafc',
                    overflow: 'hidden',
                    outline: isDragOver ? '3px dashed rgba(99,102,241,0.6)' : 'none',
                    outlineOffset: '-4px',
                    transition: 'outline 0.15s ease',
                }}
            >
                <div
                    ref={containerRef}
                    id="vizly-mind-elixir-root"
                    style={{ width: '100%', height: '100%', position: 'relative' }}
                >
                    <MindMapSpeakerNotes />
                </div>
                {isDragOver && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(99,102,241,0.08)',
                        pointerEvents: 'none',
                    }}>
                        <div style={{
                            padding: '16px 28px',
                            background: 'rgba(99,102,241,0.15)',
                            backdropFilter: 'blur(12px)',
                            border: '2px dashed rgba(99,102,241,0.5)',
                            borderRadius: 16,
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#6366f1',
                        }}>
                            📥 释放以导入 Markdown / OPML
                        </div>
                    </div>
                )}

                {/* Empty state guide — shown only when map has just the root node */}
                {instance && <MindMapEmptyGuide />}

                {/* Outline view panel — slides in from the right */}
                <MindMapOutlinePanel />

                {/* Revision History panel — slides in from the right */}
                <MindMapHistoryPanel />

                {/* AI Task Kanban panel — slides in from the right */}
                <MindMapTaskKanban />

                {/* Unified AI assistant panel — create, expand, refine */}
                <MindMapAIPanel />
            </div>

            {/* Custom context menu */}
            <MindMapContextMenu
                {...ctxMenu}
                onClose={() => setCtxMenu(m => ({ ...m, visible: false }))}
            />

            {/* Floating quick action bar — appears above selected node (Whimsical-style) */}
            <MindMapFloatingBar />

            {/* Multi-select batch operation bar — appears at bottom when 2+ nodes selected */}
            <MindMapBatchBar />

            {/* Yjs CRDT Collaboration Engine */}
            <MindMapYjsIntegration />

            {/* Boundary Geometry Engine (React Portal) */}
            <MindMapBoundaries />

            {/* Multiplayer Cursor Overlay */}
            <MindMapMultiplayerCursors />

            {/* Note hover preview tooltip */}
            {notePreview && (
                <div
                    style={{
                        position: 'fixed',
                        left: Math.min(notePreview.x, window.innerWidth - 310),
                        top: notePreview.y - 12,
                        transform: 'translateY(-100%)',
                        zIndex: 8500,
                        maxWidth: 300,
                        maxHeight: 200,
                        overflowY: 'auto',
                        background: 'rgba(10,10,18,0.95)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        fontSize: 12,
                        lineHeight: 1.55,
                        color: 'rgba(255,255,255,0.78)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                        pointerEvents: 'none',
                        animation: 'noteTooltipIn 0.14s ease',
                    }}
                    dangerouslySetInnerHTML={{ __html: notePreview.safeHtml }}
                />
            )}
        </MindElixirContext.Provider>
    );
};

export default MindElixirWrapper;
