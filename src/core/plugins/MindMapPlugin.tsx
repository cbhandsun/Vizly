/**
 * MindMapPlugin.tsx — Vizly MindMap Plugin (v2, powered by mind-elixir)
 *
 * Architecture:
 *   - mind-elixir handles all rendering, layout, keyboard, undo/redo
 *   - Vizly's PluginContext only used for save/load/toolbar/sidebar
 *   - React Flow is retained as the outer canvas shell
 *     but no RF nodes/edges are used for mindmap content
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { Node, Edge, NodeTypes } from '@xyflow/react';
import {
    DiagramTypePlugin,
    PluginContext,
} from '../types/plugin';
import { SidebarPanel } from '../types/plugin';
import { UnorderedListOutlined } from '@ant-design/icons';
import { BaseDiagramPlugin } from '../sdk/BasePlugin';
import i18n from '@/i18n';
import MindElixirWrapper from '../components/mindmap-v2/MindElixirWrapper';
import MindElixirToolbar from '../components/mindmap-v2/MindElixirToolbar';
import MindMapPropertyPanel from '../components/mindmap-v2/MindMapPropertyPanel';
import MindMapOutlinePanel from '../components/mindmap-v2/MindMapOutlinePanel';
import MindMapSearch from '../components/mindmap-v2/MindMapSearch';
import { migrateV1ToV2 } from '../components/mindmap-v2/migrate';
import { isMindMapV2 } from '../components/mindmap-v2/types';
import { getMindElixirInstance } from '../components/mindmap-v2/mindElixirStore';
import { VIZLY_THEMES } from '../components/mindmap-v2/theme';
import { subscribeSearchOpen } from '../components/mindmap-v2/mindmapSearchStore';
import {
    isStoredApplicationThemeDark,
    persistMindMapThemeKey,
    resolveMindMapThemeKey,
} from '../components/mindmap-v2/mindmapThemeStorage';
import { getFlowDataBridge } from '../utils/flowDataBridge';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const boundedText = (value: unknown, maxLength = 1000): string | undefined => (
    typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
        ? value.trim()
        : undefined
);

// ── Theme-aware canvas wrapper ─────────────────────────────────────────────────
// Keeps theme state at plugin level so toolbar & property panel share the same key
const MindMapCanvas: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const [themeKey] = useState<string>(resolveMindMapThemeKey);
    const isDark = themeKey === 'dark'
        || document.documentElement.classList.contains('dark')
        || isStoredApplicationThemeDark();

    const [searchOpen, setSearchOpen] = useState(false);

    // Subscribe to search event from Toolbar
    useEffect(() => {
        return subscribeSearchOpen(() => setSearchOpen(prev => !prev));
    }, []);

    // Ctrl+F / Cmd+F to open search;  Ctrl+D to duplicate node
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const isInput = ['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement)?.tagName);
        if (isInput) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault(); e.stopPropagation();
            setSearchOpen(prev => !prev);
            return;
        }

        // Ctrl+D — duplicate selected node as sibling (with all children)
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
            e.preventDefault(); e.stopPropagation();
            const mind = getMindElixirInstance();
            if (!mind) return;
            try {
                const nodeId = mind.currentNode?.id ?? mind.currentNodes?.[0]?.id;
                if (!nodeId) return;
                const rootId = mind.getData()?.nodeData?.id;
                if (nodeId === rootId) return; // can't duplicate root
                const tpc = mind.findEle(nodeId);
                if (tpc) mind.copyNode(tpc, tpc);  // copy to same parent as sibling
            } catch {}
            return;
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown, true);
        return () => document.removeEventListener('keydown', handleKeyDown, true);
    }, [handleKeyDown]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <MindElixirWrapper ctx={ctx} isDark={isDark} />
            <MindMapSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
        </div>
    );
};

// ── Property Panel wrapper (stateful theme) ────────────────────────────────────
const PropertyPanelWrapper: React.FC = () => {
    const [themeKey, setThemeKey] = useState<string>(resolveMindMapThemeKey);

    const handleThemeChange = (key: string) => {
        const mind = getMindElixirInstance();
        const theme = VIZLY_THEMES[key];
        if (mind && theme) {
            mind.changeTheme(theme);
            persistMindMapThemeKey(key);
            setThemeKey(key);
        }
    };

    return (
        <MindMapPropertyPanel
            activeTheme={themeKey}
            onThemeChange={handleThemeChange}
        />
    );
};

// ── Plugin Class ───────────────────────────────────────────────────────────────
export class MindMapPlugin extends BaseDiagramPlugin implements DiagramTypePlugin {
    id = 'mindmap';

    get name() {
        return i18n.t('plugins.mindmap.title');
    }

    version = '2.1';

    async migrate<T>(data: T, fromVersion: string | undefined): Promise<T> {
        const migratedData = await super.migrate(data, fromVersion);

        if (!isMindMapV2(migratedData) && isRecord(migratedData) && Array.isArray(migratedData.nodes)) {
            const mindmapNodes = migratedData.nodes.filter((node) => isRecord(node) && node.type === 'mindmap');
            if (mindmapNodes.length > 0) {
                const v2 = migrateV1ToV2({
                    nodes: mindmapNodes,
                    edges: Array.isArray(migratedData.edges) ? migratedData.edges : [],
                });
                return {
                    nodes: [{
                        id: '__mindmap_meta__',
                        type: 'mindmap',
                        position: { x: -9999, y: -9999 },
                        hidden: true,
                        data: { mindmapV2: v2, depth: -1, label: '' },
                    }],
                    edges: [],
                } as T;
            }
        }

        return migratedData;
    }

    // ── Plugin Flags ─────────────────────────────────────────────────────────
    hideDefaultSidebar = true;
    hideContextToolbar = true;
    hideGridControls = true;
    hideLayoutControls = true;
    hideFlowFocusControls = true;
    hideZoomControls = true;
    hideUndoRedoControls = true;
    hideCenterIsland = true;

    // ── Initial State ─────────────────────────────────────────────────────────
    getEmptyState() {
        return { nodes: [], edges: [] };
    }

    getSupportedLayouts() { return ['MindElixirLayout']; }
    getDefaultLayout() { return 'MindElixirLayout'; }

    getNodeTypes(): NodeTypes { return {}; }
    getEdgeTypes() { return {}; }

    // ── Canvas Component ── mind-elixir renders here ──────────────────────────
    contributeCanvasComponents(ctx: PluginContext) {
        return <MindMapCanvas ctx={ctx} />;
    }

    // ── Toolbar ───────────────────────────────────────────────────────────────
    contributeToolbar(_ctx: PluginContext) {
        return <MindElixirToolbar />;
    }

    // ── Property Panel ────────────────────────────────────────────────────────
    renderCustomPropertyPanel(_ctx: PluginContext, _selectedNodes: Node[], _selectedEdges: Edge[]) {
        return <PropertyPanelWrapper />;
    }

    // ── Sidebar Panels ────────────────────────────────────────────────────────
    contributeSidebarPanels(_ctx: PluginContext): SidebarPanel[] {
        return [
            {
                id: 'mindmap-outline',
                title: i18n.t('plugins.mindmap.outline.title') || '大纲视图',
                icon: <UnorderedListOutlined />,
                content: <MindMapOutlinePanel />,
            },
        ];
    }

    // ── AI Actions (GAP-10 Phase 2) ──
    async onAIAction(action: string, params: unknown, ctx: PluginContext): Promise<boolean> {
        const diagramId = ctx.diagramId;
        if (!diagramId) return false;
        const bridge = getFlowDataBridge(diagramId);
        if (!bridge || !isRecord(params)) return false;

        switch (action) {
            case 'addChild': {
                const label = boundedText(params.label);
                if (bridge.addChild && label) {
                    await bridge.addChild({
                        parentId: boundedText(params.parentId, 200) || 'root',
                        label,
                        side: params.side === 'left' || params.side === 'right' ? params.side : undefined,
                    });
                    return true;
                }
                return false;
            }

            case 'deleteNodes': {
                const ids = Array.isArray(params.ids)
                    ? params.ids.map((id) => boundedText(id, 200)).filter((id): id is string => Boolean(id)).slice(0, 1000)
                    : [];
                if (bridge.deleteNodes && ids.length > 0) {
                    await bridge.deleteNodes(ids);
                    return true;
                }
                return false;
            }

            case 'collapse': {
                const id = boundedText(params.id, 200);
                if (bridge.collapse && id && typeof params.collapsed === 'boolean') {
                    await bridge.collapse(id, params.collapsed);
                    return true;
                }
                return false;
            }

            case 'exportMindmapMd':
                if (bridge.exportMindmapMd) {
                    await bridge.exportMindmapMd();
                    return true;
                }
                return false;

            case 'export': {
                const type = boundedText(params.type, 40);
                if (bridge.export && type) {
                    await bridge.export({ type });
                    return true;
                }
                return false;
            }

            default:
                return false;
        }
    }
}
