import React, { useMemo, useCallback } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  DiagramTypePlugin,
  PluginContext,
} from '../types/plugin';

import MindMapNode from '../components/custom-nodes/MindMapNode';
import { MindMapBeautifyPanel } from '../components/diagrams/mindmap-pro/MindMapBeautifyPanel';
import { MindMapCanvasContext } from '../components/diagrams/mindmap-pro/MindMapCanvasContext';
import { MindMapOutlinePanel } from '../components/diagrams/mindmap-pro/MindMapOutlinePanel';
import { SidebarPanel } from '../types/plugin';
import { UnorderedListOutlined, PartitionOutlined, FullscreenOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { BaseDiagramPlugin } from '../sdk/BasePlugin';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { Select, Divider, Tooltip, Button } from 'antd';

export class MindMapPlugin extends BaseDiagramPlugin implements DiagramTypePlugin {
  id = 'mindmap';
  
  get name() {
    return i18n.t('plugins.mindmap.title');
  }

  version = '1.1';

  async migrate(data: any, fromVersion: string | undefined): Promise<any> {
    const migratedData = await super.migrate(data, fromVersion);
    return migratedData;
  }

  // Professional Mind Map disables legacy generic panels
  hideDefaultSidebar = true;
  hideContextToolbar = true;
  hideGridControls = true;
  hideLayoutControls = true;

  // Initial structure for an empty diagram
  getEmptyState() {
    return {
      nodes: [
        {
          id: 'root',
          type: 'mindmap',
          position: { x: 0, y: 0 },
          data: { label: i18n.t('designer.flowchart.mindMapCenter') || '中心主题 (Root)', direction: 'LR' },
          selected: true
        }
      ],
      edges: []
    };
  }

  // parseData and serializeData are now inherited from BaseDiagramPlugin

  // Layouts supported (We hook into the autoLayout engine for Mind Map)
  getSupportedLayouts() { return ['MindMapDirectionalLayout']; }
  getDefaultLayout() { return 'MindMapDirectionalLayout'; }

  // Custom Types registration
  getNodeTypes(): Record<string, any> {
    return {
      mindmap: MindMapNode
    };
  }

  
  getEdgeTypes() {
    return {};
  }

  renderCustomPropertyPanel(ctx: PluginContext, selectedNodes: Node[], selectedEdges: Edge[]) {
    return <MindMapBeautifyPanel ctx={ctx} selectedNodes={selectedNodes} selectedEdges={selectedEdges} />;
  }

  contributeToolbar(ctx: PluginContext) {
    return <MindMapToolbar ctx={ctx} />;
  }

  contributeCanvasComponents(ctx: PluginContext) {
    return <MindMapCanvasContext />;
  }

  contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
    return [{
      id: 'mindmap-outline',
      title: i18n.t('plugins.mindmap.outline.title') || '大纲视图',
      icon: <UnorderedListOutlined />,
      content: <MindMapOutlinePanel ctx={ctx} />
    }];
  }
}

// ====== 思维导图专属工具栏 ======
const MindMapToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    // Defense: ctx may be null during first render cycle
    if (!ctx) return null;
    const { t } = useTranslation();

    // [S-3] Memoize root node — ctx.getNodes().find() in component body runs O(N) on every render.
    // Use useMemo so re-computation only happens when getNodes reference changes (i.e. nodes mutate).
    const root = useMemo(() => {
        const nodes = ctx.getNodes();
        return nodes.find(n => n.type === 'mindmap' && (n.data?.depth === 0 || n.data?.depth === undefined));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ctx.getNodes]);
    const currentDirection = (root?.data?.direction as string) || 'LR';

    const handleDirectionChange = useCallback((direction: string) => {
        if (!root) return;
        ctx.setNodes(nds => nds.map(n => {
            if (n.id === root.id) {
                return { ...n, data: { ...n.data, direction } };
            }
            return n;
        }));
    }, [root, ctx.setNodes]);

    const handleCollapseAll = () => {
        window.dispatchEvent(new CustomEvent('mindmap:collapseAll'));
    };

    const handleExpandAll = () => {
        window.dispatchEvent(new CustomEvent('mindmap:expandAll'));
    };

    const handleFitView = () => {
        ctx.reactFlowInstance?.fitView({ duration: 600, padding: 0.2, minZoom: 0.55 });
    };


    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            <Select
                size="small"
                variant="borderless"
                value={currentDirection}
                onChange={handleDirectionChange}
                style={{ width: 140 }}
                options={[
                    { label: t('plugins.mindmap.direction.LR'), value: 'LR' },
                    { label: t('plugins.mindmap.direction.R'), value: 'R' },
                    { label: t('plugins.mindmap.direction.L'), value: 'L' },
                    { label: t('plugins.mindmap.direction.TB'), value: 'TB' },
                    { label: t('plugins.mindmap.direction.BT'), value: 'BT' },
                    { label: t('plugins.mindmap.direction.FISHBONE'), value: 'FISHBONE' },
                ]}
            />

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title={t('plugins.mindmap.collapseAll')}>
                <Button size="small" type="text" icon={<MenuFoldOutlined />} onClick={handleCollapseAll} />
            </Tooltip>
            <Tooltip title={t('plugins.mindmap.expandAll')}>
                <Button size="small" type="text" icon={<MenuUnfoldOutlined />} onClick={handleExpandAll} />
            </Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title={t('plugins.mindmap.fitView')}>
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={handleFitView} />
            </Tooltip>
        </div>
    );
};
