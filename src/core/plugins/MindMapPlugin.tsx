/**
 * MindMapPlugin.tsx — Vizly MindMap Plugin (v2, powered by mind-elixir)
 *
 * Architecture:
 *   - mind-elixir handles all rendering, layout, keyboard, undo/redo
 *   - Vizly's PluginContext only used for save/load/toolbar/sidebar
 *   - React Flow is retained as the outer canvas shell
 *     but no RF nodes/edges are used for mindmap content
 */

import React, { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
    DiagramTypePlugin,
    PluginContext,
} from '../types/plugin';
import { SidebarPanel } from '../types/plugin';
import { UnorderedListOutlined, SettingOutlined } from '@ant-design/icons';
import { BaseDiagramPlugin } from '../sdk/BasePlugin';
import i18n from '@/i18n';
import MindElixirWrapper from '../components/mindmap-v2/MindElixirWrapper';
import MindElixirToolbar from '../components/mindmap-v2/MindElixirToolbar';
import MindMapPropertyPanel from '../components/mindmap-v2/MindMapPropertyPanel';
import MindMapOutlinePanel from '../components/mindmap-v2/MindMapOutlinePanel';
import { migrateV1ToV2 } from '../components/mindmap-v2/migrate';
import { isMindMapV2 } from '../components/mindmap-v2/types';
import { getMindElixirInstance } from '../components/mindmap-v2/mindElixirStore';
import { VIZLY_THEMES } from '../components/mindmap-v2/theme';

// ── Theme-aware canvas wrapper ─────────────────────────────────────────────────
// Keeps theme state at plugin level so toolbar & property panel share the same key
const MindMapCanvas: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const [themeKey, setThemeKey] = useState<string>(() => {
        return localStorage.getItem('vizly_mindmap_theme') || 'indigo';
    });
    const isDark = themeKey === 'dark'
        || document.documentElement.classList.contains('dark')
        || localStorage.getItem('vizly-theme') === 'dark';

    return <MindElixirWrapper ctx={ctx} isDark={isDark} />;
};

// ── Property Panel wrapper (stateful theme) ────────────────────────────────────
const PropertyPanelWrapper: React.FC = () => {
    const [themeKey, setThemeKey] = useState<string>(() => {
        return localStorage.getItem('vizly_mindmap_theme') || 'indigo';
    });

    const handleThemeChange = (key: string) => {
        const mind = getMindElixirInstance();
        const theme = VIZLY_THEMES[key];
        if (mind && theme) {
            mind.changeTheme(theme);
            localStorage.setItem('vizly_mindmap_theme', key);
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

    async migrate(data: any, fromVersion: string | undefined): Promise<any> {
        const migratedData = await super.migrate(data, fromVersion);

        if (!isMindMapV2(migratedData) && Array.isArray(migratedData?.nodes)) {
            const mindmapNodes = migratedData.nodes.filter((n: any) => n.type === 'mindmap');
            if (mindmapNodes.length > 0) {
                const v2 = migrateV1ToV2({ nodes: mindmapNodes, edges: migratedData.edges ?? [] });
                return {
                    nodes: [{
                        id: '__mindmap_meta__',
                        type: 'mindmap',
                        position: { x: -9999, y: -9999 },
                        hidden: true,
                        data: { mindmapV2: v2, depth: -1, label: '' },
                    }],
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
    hideFlowFocusControls = true;
    // Also hide the bottom toolbar's undo/redo and zoom (mind-elixir handles them)
    hideZoomControls = false;  // Keep zoom for pan/zoom convenience

    // ── Initial State ─────────────────────────────────────────────────────────
    getEmptyState() {
        return { nodes: [], edges: [] };
    }

    getSupportedLayouts() { return ['MindElixirLayout']; }
    getDefaultLayout() { return 'MindElixirLayout'; }

    getNodeTypes(): Record<string, any> { return {}; }
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
}
