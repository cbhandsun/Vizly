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
    useContext,
    createContext,
    useCallback,
    useState,
} from 'react';
import MindElixir from 'mind-elixir';
import type { MindElixirInstance, MindElixirData, NodeObj } from 'mind-elixir';
import 'mind-elixir/style.css';

import { PluginContext } from '../../types/plugin';
import { VIZLY_HYPER_THEME, VIZLY_HYPER_DARK_THEME, VIZLY_THEMES } from './theme';
import { migrateV1ToV2, directionStringToInt, markdownToNodeObj, opmlToNodeObj } from './migrate';
import { isMindMapV2 } from './types';
import { registerMindElixirInstance, unregisterMindElixirInstance } from './mindElixirStore';

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

// ─── Context: expose mind-elixir instance + selected node to siblings ─────────
export interface MindElixirContextValue {
    instance: MindElixirInstance | null;
    selectedNode: NodeObj | null;
}

export const MindElixirContext = createContext<MindElixirContextValue>({
    instance: null,
    selectedNode: null,
});

export function useMindElixir() {
    return useContext(MindElixirContext);
}

// ─── CSS fix: inject a style override so gradient backgrounds actually render ──
// mind-elixir uses `background-color: var(--main-bgcolor)` but CSS gradients are
// not valid values for background-color — they need the `background` shorthand.
const ME_GRADIENT_FIX_ID = 'me-gradient-bg-fix';
function injectGradientFix() {
    if (document.getElementById(ME_GRADIENT_FIX_ID)) return;
    const style = document.createElement('style');
    style.id = ME_GRADIENT_FIX_ID;
    // Note: mind-elixir uses `background-color: var(--main-bgcolor)` for first-level branches,
    // but CSS gradients are not valid for background-color — they need the `background` shorthand.
    // We override with background shorthand to fix this. DO NOT also set background-color: transparent
    // for the root node — it would override the root's valid hex color (#312e81).
    style.textContent = `
        /* ── First-level branch nodes: gradient background fix ────────────────── */
        /* background-color can't hold gradients; use background shorthand instead */
        .map-container me-main > me-wrapper > me-parent > me-tpc {
            background: var(--main-bgcolor) !important;
            color: var(--main-color) !important;
            font-weight: 500;
            letter-spacing: 0.01em;
        }

        /* ── Root node: solid color from --root-bgcolor ────────────────────────── */
        .map-container me-root me-tpc {
            background: var(--root-bgcolor, #312e81) !important;
            color: var(--root-color, #ffffff) !important;
            font-weight: 700 !important;
            font-size: 15px !important;
            padding: 10px 20px !important;
        }

        /* ── Deeper nodes (2nd level+): transparent bg, dark text ─────────────── */
        .map-container me-wrapper me-wrapper me-parent me-tpc {
            background: transparent !important;
            color: var(--color) !important;
        }

        /* ── All nodes: smooth transitions ─────────────────────────────────────── */
        .map-container me-tpc {
            transition: box-shadow 0.18s ease, transform 0.12s ease, opacity 0.15s ease !important;
            cursor: default;
        }

        /* ── Hover: subtle lift effect ──────────────────────────────────────────── */
        .map-container me-tpc:hover {
            box-shadow: 0 2px 10px rgba(0,0,0,0.12) !important;
            transform: translateY(-1px) !important;
        }

        /* ── Selected node: indigo ring + lift ─────────────────────────────────── */
        .map-container me-tpc.selected {
            box-shadow: 0 0 0 3px var(--selected),
                        0 4px 16px rgba(99,102,241,0.28) !important;
            transform: translateY(-1px) !important;
        }

        /* ── Editing (inline input) ─────────────────────────────────────────────── */
        .map-container me-tpc.editing {
            box-shadow: 0 0 0 2px #6366f1, 0 4px 16px rgba(99,102,241,0.3) !important;
        }

        /* ── Connection lines: smooth ───────────────────────────────────────────── */
        .map-container svg path {
            transition: stroke 0.25s ease, opacity 0.2s ease;
        }

        /* ── Context menu: rounded, glassmorphism ───────────────────────────────── */
        me-context-menu {
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.16), 0 1px 4px rgba(0,0,0,0.08) !important;
            backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(255,255,255,0.12) !important;
            overflow: hidden !important;
        }
        me-context-menu li {
            padding: 7px 14px !important;
            font-size: 13px !important;
            border-radius: 0 !important;
            transition: background 0.12s ease !important;
        }
        me-context-menu li:first-child {
            border-radius: 12px 12px 0 0 !important;
        }
        me-context-menu li:last-child {
            border-radius: 0 0 12px 12px !important;
        }

        /* ── Thin scrollbar on canvas ───────────────────────────────────────────── */
        #vizly-mind-elixir-root .map-container {
            scrollbar-width: thin;
            scrollbar-color: rgba(99,102,241,0.3) transparent;
        }
        #vizly-mind-elixir-root .map-container::-webkit-scrollbar {
            width: 5px; height: 5px;
        }
        #vizly-mind-elixir-root .map-container::-webkit-scrollbar-thumb {
            background: rgba(99,102,241,0.25);
            border-radius: 10px;
        }

        /* ── 折叠数量气泡 ────────────────────────────────────────────────────────── */
        me-tpc .node-children-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            margin-left: 6px;
            background: rgba(99,102,241,0.15);
            color: #6366f1;
            font-size: 10px;
            font-weight: 700;
            border-radius: 9px;
            border: 1px solid rgba(99,102,241,0.25);
            vertical-align: middle;
            line-height: 1;
        }

        /* ── 节点图片 ────────────────────────────────────────────────────────────── */
        me-tpc img {
            border-radius: 6px;
            display: block;
            margin: 4px auto 2px;
            max-width: 200px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }

        /* ── 关联箭头（Arrow）样式 ───────────────────────────────────────────────── */
        .map-container .custom-link {
            stroke: rgba(99,102,241,0.6) !important;
            stroke-width: 2px !important;
            stroke-dasharray: 6 3 !important;
            transition: stroke 0.2s ease !important;
        }
        .map-container .custom-link:hover {
            stroke: rgba(99,102,241,1) !important;
            stroke-width: 2.5px !important;
        }
        .map-container .custom-link.selected {
            stroke: #6366f1 !important;
            stroke-width: 3px !important;
        }

        /* ── Summary 汇总括号 ────────────────────────────────────────────────────── */
        .map-container .summary-tpc {
            background: rgba(99,102,241,0.06) !important;
            border: 1.5px dashed rgba(99,102,241,0.35) !important;
            border-radius: 8px !important;
            color: #6366f1 !important;
            font-size: 12px !important;
            font-style: italic;
        }
        .map-container path.summary-link {
            stroke: rgba(99,102,241,0.4) !important;
            stroke-width: 1.5px !important;
        }

        /* ── 节点内 Tags 渲染 ────────────────────────────────────────────────────── */
        me-tpc .node-tag {
            display: inline-flex;
            align-items: center;
            padding: 1px 7px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 600;
            margin: 2px 2px 0;
            line-height: 16px;
        }
    `;
    document.head.appendChild(style);
}


// ─── Debounce utility ─────────────────────────────────────────────────────────
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout>;
    return ((...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    }) as T;
}

// ─── Load / Save helpers ──────────────────────────────────────────────────────
function loadData(ctx: PluginContext): MindElixirData {
    try {
        const nodes = (ctx as any).getNodes?.() ?? [];
        const edges = (ctx as any).getEdges?.() ?? [];

        // Restore persisted direction from localStorage (user may have changed it)
        const { directionStringToInt: d2i } = { directionStringToInt };
        const lsDir = localStorage.getItem('vizly_mindmap_dir');
        const persistedDir = lsDir ? (d2i(lsDir) as 0 | 1 | 2) : null;

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
                if (v2.themeKey) localStorage.setItem('vizly_mindmap_theme', v2.themeKey);
                return {
                    nodeData: v2.nodeData,
                    direction: persistedDir ?? (v2.direction ?? MindElixir.SIDE) as 0 | 1 | 2,
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
            direction: persistedDir ?? (v2.direction ?? MindElixir.SIDE) as 0 | 1 | 2,
            theme: VIZLY_HYPER_THEME,
        };
    } catch {
        return DEFAULT_DATA;
    }
}


function saveData(ctx: PluginContext, mind: MindElixirInstance): void {
    try {
        const data = mind.getData();
        const themeKey = localStorage.getItem('vizly_mindmap_theme') ?? 'indigo';
        const v2Payload = {
            _version: 'mindmap-v2' as const,
            nodeData: data.nodeData,
            direction: data.direction ?? MindElixir.SIDE,
            themeKey,  // persist theme key so it survives refresh
        };

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
        console.warn('[MindElixirWrapper] saveData failed:', e);
    }
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

    useEffect(() => {
        // Inject gradient CSS fix once globally
        injectGradientFix();

        if (!containerRef.current) return;

        const initialData = loadData(ctx);

        // Theme priority: localStorage key > isDark flag > default
        const storedThemeKey = localStorage.getItem('vizly_mindmap_theme');
        const theme = storedThemeKey
            ? (VIZLY_THEMES[storedThemeKey] ?? (isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME))
            : (isDark ? VIZLY_HYPER_DARK_THEME : VIZLY_HYPER_THEME);

        const mind = new MindElixir({
            el: containerRef.current,
            direction: (initialData.direction ?? MindElixir.SIDE) as 0 | 1 | 2,
            editable: true,
            contextMenu: true,   // enable built-in context menu for node ops
            toolBar: false,
            keypress: true,
            overflowHidden: false,
            mouseSelectionButton: 0,
            theme,
        });

        mind.init(initialData);
        mindRef.current = mind;
        setInstance(mind);
        registerMindElixirInstance(mind);  // expose to toolbar and other out-of-tree consumers

        // Debounced auto-save on every operation
        const debouncedSave = debounce(() => saveRef.current(), 800);
        mind.bus.addListener('operation', debouncedSave);

        // ── Collapsed count badges ───────────────────────────────────────────
        // After each operation, refresh child count badges on collapsed nodes
        const updateCollapsedBadges = () => {
            const container = document.getElementById('vizly-mind-elixir-root');
            if (!container) return;
            // Remove all existing badges first
            container.querySelectorAll('.me-collapsed-badge').forEach(el => el.remove());
            // For each collapsed wrapper, find the parent tpc and inject badge
            container.querySelectorAll('me-wrapper[data-nodeid]').forEach(wrapper => {
                const isCollapsed = (wrapper as HTMLElement).classList.contains('me-collapsed')
                    || (wrapper as HTMLElement).getAttribute('data-expanded') === 'false'
                    || (wrapper as HTMLElement).hasAttribute('data-collapsed');
                // Try to find hidden children count
                const children = wrapper.querySelectorAll(':scope > me-children > me-wrapper');
                if (!isCollapsed || children.length === 0) return;
                const tpc = wrapper.querySelector(':scope > me-parent > me-tpc');
                if (!tpc || tpc.querySelector('.me-collapsed-badge')) return;
                const badge = document.createElement('span');
                badge.className = 'me-collapsed-badge node-children-count';
                badge.textContent = String(children.length);
                tpc.appendChild(badge);
            });
        };

        // Simpler approach: check expand state via node data
        const updateBadgesFromData = () => {
            try {
                const data = mind.getData();
                const container = document.getElementById('vizly-mind-elixir-root');
                if (!container) return;
                container.querySelectorAll('.me-collapsed-badge').forEach(el => el.remove());
                function walkNodes(node: NodeObj) {
                    if (node.expanded === false && node.children && node.children.length > 0) {
                        try {
                            const tpc = mind.findEle(node.id);
                            if (tpc && !tpc.querySelector('.me-collapsed-badge')) {
                                const badge = document.createElement('span');
                                badge.className = 'me-collapsed-badge node-children-count';
                                badge.textContent = String(node.children.length);
                                tpc.appendChild(badge);
                            }
                        } catch {}
                    }
                    (node.children ?? []).forEach(walkNodes);
                }
                walkNodes(data.nodeData);
            } catch {}
        };

        mind.bus.addListener('operation', updateBadgesFromData);
        // Initial badge update after layout settles
        setTimeout(updateBadgesFromData, 350);

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

        return () => {
            mind.bus.removeListener('operation', debouncedSave);
            mind.bus.removeListener('operation', updateBadgesFromData);
            mind.bus.removeListener('selectNodes', handleSelectNodes);
            mind.bus.removeListener('selectNewNode', handleSelectNewNode);
            mind.bus.removeListener('unselectNodes', handleUnselectNodes);
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

    // Drag-to-import handler: drop .md / .opml files onto canvas
    const handleDragOver = useCallback((e: React.DragEvent) => {
        const files = Array.from(e.dataTransfer.items || []);
        const hasCompatible = files.some(item =>
            item.kind === 'file' && (
                item.type === 'text/markdown' ||
                item.type === 'text/plain' ||
                item.type === 'application/xml' ||
                item.type === 'text/xml' ||
                (item.getAsFile()?.name.match(/\.(md|markdown|opml|xml|txt)$/i) ?? false)
            )
        );
        if (hasCompatible || files.some(f => f.kind === 'file')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const mind = mindRef.current;
        if (!mind) return;
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result as string;
                let nodeData;
                if (file.name.match(/\.(opml|xml)$/i)) {
                    nodeData = opmlToNodeObj(text);
                } else {
                    nodeData = markdownToNodeObj(text);
                }
                mind.refresh({ nodeData });
                mind.toCenter();
                mind.clearHistory?.();
            } catch (err) {
                console.error('[Drag Import]', err);
            }
        };
        reader.readAsText(file);
    }, []);

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
                    style={{ width: '100%', height: '100%' }}
                />
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
            </div>
        </MindElixirContext.Provider>
    );
};

export default MindElixirWrapper;
