/**
 * MindMapPlugin.tsx — Vizly MindMap Plugin (v2, powered by mind-elixir)
 *
 * Architecture:
 *   - mind-elixir handles all rendering, layout, keyboard, undo/redo
 *   - Vizly's PluginContext only used for save/load/toolbar/sidebar
 *   - React Flow is retained as the outer canvas shell (pan/zoom/minimap)
 *     but no RF nodes/edges are used for mindmap content
 */

import React from 'react';
import type { Node, Edge } from '@xyflow/react';
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
import { migrateV1ToV2 } from '../components/mindmap-v2/migrate';
import { isMindMapV2 } from '../components/mindmap-v2/types';

// ── Inline Outline Panel (lightweight placeholder for Phase 1) ────────────────
const MindElixirOutlinePanelPlaceholder: React.FC<{ ctx: PluginContext }> = () => (
    <div style={{ padding: 16, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>🌿</div>
        <div>大纲视图将在 Phase 2 提供</div>
        <div style={{ marginTop: 8, fontSize: 11 }}>使用画布上的键盘导航即可</div>
    </div>
);

// ── Plugin Class ───────────────────────────────────────────────────────────────
export class MindMapPlugin extends BaseDiagramPlugin implements DiagramTypePlugin {
    id = 'mindmap';

    get name() {
        return i18n.t('plugins.mindmap.title');
    }

    version = '2.0';

    /**
     * Migrate old data formats to current format.
     * v1 (RF nodes/edges) → v2 (mind-elixir tree) is handled in MindElixirWrapper.
     * This method is a pass-through for any base plugin migration needed.
     */
    async migrate(data: any, fromVersion: string | undefined): Promise<any> {
        const migratedData = await super.migrate(data, fromVersion);

        // If data is in v1 RF format, convert to v2 now at the plugin level
        // so it gets stored in the correct format on next save.
        if (!isMindMapV2(migratedData) && Array.isArray(migratedData?.nodes)) {
            const mindmapNodes = migratedData.nodes.filter((n: any) => n.type === 'mindmap');
            if (mindmapNodes.length > 0) {
                const v2 = migrateV1ToV2({ nodes: mindmapNodes, edges: migratedData.edges ?? [] });
                // Embed v2 payload in the meta node convention that MindElixirWrapper reads
                return {
                    nodes: [
                        {
                            id: '__mindmap_meta__',
                            type: 'mindmap',
                            position: { x: -9999, y: -9999 },
                            hidden: true,
                            data: { mindmapV2: v2, depth: -1, label: '' },
                        },
                    ],
                    edges: [],
                };
            }
        }

        return migratedData;
    }

    // ── Plugin Flags ─────────────────────────────────────────────────────────
    hideDefaultSidebar = true;
    hideContextToolbar = true;
    hideGridControls = true;
    hideLayoutControls = true;

    // ── Initial State ─────────────────────────────────────────────────────────
    // We only need a placeholder — mind-elixir will init with DEFAULT_DATA if meta is empty
    getEmptyState() {
        return { nodes: [], edges: [] };
    }

    getSupportedLayouts() { return ['MindElixirLayout']; }
    getDefaultLayout() { return 'MindElixirLayout'; }

    // mind-elixir doesn't use RF custom node types (all rendering is internal SVG)
    getNodeTypes(): Record<string, any> { return {}; }
    getEdgeTypes() { return {}; }

    // ── Canvas Component ── mind-elixir renders here ──────────────────────────
    contributeCanvasComponents(ctx: PluginContext) {
        // isDark: detect from body class or localStorage (simple heuristic)
        const isDark = document.documentElement.classList.contains('dark')
            || localStorage.getItem('vizly-theme') === 'dark';
        return <MindElixirWrapper ctx={ctx} isDark={isDark} />;
    }

    // ── Toolbar ───────────────────────────────────────────────────────────────
    contributeToolbar(_ctx: PluginContext) {
        return <MindElixirToolbar />;
    }

    // ── Property Panel ────────────────────────────────────────────────────────
    renderCustomPropertyPanel(_ctx: PluginContext, _selectedNodes: Node[], _selectedEdges: Edge[]) {
        // Phase 1: no property panel, mind-elixir handles in-place editing
        return null;
    }

    // ── Sidebar Panels ────────────────────────────────────────────────────────
    contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
        return [{
            id: 'mindmap-outline',
            title: i18n.t('plugins.mindmap.outline.title') || '大纲视图',
            icon: <UnorderedListOutlined />,
            content: <MindElixirOutlinePanelPlaceholder ctx={ctx} />,
        }];
    }
}
