import React from 'react';
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
import { Button, Tooltip, Select, Divider } from 'antd';

export class MindMapPlugin implements DiagramTypePlugin {
  id = 'mindmap';
  name = 'Mind Map Pro';
  version = '1.1';

  async migrate(data: any, fromVersion: string | undefined): Promise<any> {
    console.log(`[MindMapPlugin] Migrating data from ${fromVersion || '1.0'} to ${this.version}`);
    // Future-proof migration stub
    return { ...data };
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
          data: { label: '中心主题 (Root)', direction: 'LR' }
        }
      ],
      edges: []
    };
  }

  // Parse & Serialize just passthrough data as React Flow format for now
  parseData(source: any) {
    if (!source || typeof source !== 'object') return { nodes: [], edges: [] };
    return { nodes: source.nodes || [], edges: source.edges || [] };
  }

  serializeData(nodes: Node[], edges: Edge[]) {
    return { nodes, edges };
  }

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
      title: '大纲与导航',
      icon: <UnorderedListOutlined />,
      content: <MindMapOutlinePanel ctx={ctx} />
    }];
  }
}

// ====== 思维导图专属工具栏 ======
const MindMapToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    // Defense: ctx may be null during first render cycle
    if (!ctx) return null;

    const handleDirectionChange = (direction: string) => {
        // Update root node direction, triggering orchestrator cascade
        const nodes = ctx.getNodes();
        const root = nodes.find(n => n.type === 'mindmap' && (n.data?.depth === 0 || n.data?.depth === undefined));
        if (root) {
            ctx.setNodes(nds => nds.map(n => {
                if (n.id === root.id) {
                    return { ...n, data: { ...n.data, direction } };
                }
                return n;
            }));
        }
    };

    const handleCollapseAll = () => {
        window.dispatchEvent(new CustomEvent('mindmap:collapseAll'));
    };

    const handleExpandAll = () => {
        window.dispatchEvent(new CustomEvent('mindmap:expandAll'));
    };

    const handleFitView = () => {
        ctx.reactFlowInstance?.fitView({ duration: 600, padding: 0.2 });
    };

    // Read current direction from root
    const nodes = ctx.getNodes();
    const root = nodes.find(n => n.type === 'mindmap' && (n.data?.depth === 0 || n.data?.depth === undefined));
    const currentDirection = (root?.data?.direction as string) || 'LR';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            <Select
                size="small"
                variant="borderless"
                value={currentDirection}
                onChange={handleDirectionChange}
                style={{ width: 120 }}
                options={[
                    { label: '↔ 双向展开', value: 'LR' },
                    { label: '→ 向右展开', value: 'R' },
                    { label: '← 向左展开', value: 'L' },
                ]}
            />

            <Divider type="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title="折叠所有分支">
                <Button size="small" type="text" icon={<MenuFoldOutlined />} onClick={handleCollapseAll} />
            </Tooltip>
            <Tooltip title="展开所有分支">
                <Button size="small" type="text" icon={<MenuUnfoldOutlined />} onClick={handleExpandAll} />
            </Tooltip>

            <Divider type="vertical" style={{ height: 16, margin: '0 2px' }} />

            <Tooltip title="适应视口">
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={handleFitView} />
            </Tooltip>
        </div>
    );
};
