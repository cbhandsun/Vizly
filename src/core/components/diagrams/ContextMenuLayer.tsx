import React from 'react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { DiagramContextMenu } from './DiagramContextMenu';
import type { Node, Edge } from '@xyflow/react';

import { DiagramTypePlugin, PluginContext } from '../../types/plugin';

interface ContextMenuLayerProps {
  onAction: (action: string, targetId?: string) => void;
  activePlugin?: DiagramTypePlugin | null;
  pluginCtx?: PluginContext;
  canUndo: boolean;
  canRedo: boolean;
}

const EMPTY_NODES: Node[] = [];
const EMPTY_EDGES: Edge[] = [];

export const ContextMenuLayer: React.FC<ContextMenuLayerProps> = ({
  onAction,
  activePlugin,
  pluginCtx,
  canUndo,
  canRedo,
}) => {
  const contextMenu = useDiagramStore((state) => state.contextMenu);
  const setContextMenu = useDiagramStore((state) => state.setContextMenu);
  const selectedNodes = useDiagramStore((state) => state.selectedNodes);
  const selectedEdges = useDiagramStore((state) => state.selectedEdges);
  
  // ⭐ 性能优化：当菜单未打开时，切断对完整 nodes 数组的订阅，防止拖拽节点时引发该组件以 60FPS 重绘
  const nodes = useDiagramStore((state) => contextMenu ? state.nodes : EMPTY_NODES);
  const edges = useDiagramStore((state) => contextMenu ? state.edges : EMPTY_EDGES);
  const extraItems = React.useMemo(() => {
    if (!contextMenu || !activePlugin?.contributeContextMenu || !pluginCtx) return [];
    
    let targetElement: Node | Edge | null = null;
    if (contextMenu.type === 'node' && contextMenu.targetId) {
      targetElement = nodes.find((n: Node) => n.id === contextMenu.targetId) || null;
    } else if (contextMenu.type === 'edge' && contextMenu.targetId) {
      targetElement = pluginCtx.getEdges().find((e: Edge) => e.id === contextMenu.targetId) || null;
    }

    return activePlugin.contributeContextMenu(targetElement, pluginCtx) || [];
  }, [activePlugin, pluginCtx, contextMenu, nodes]);

  if (!contextMenu) return null;

  return (
    <DiagramContextMenu
      {...contextMenu}
      onClose={() => setContextMenu(null)}
      onAction={onAction}
      selectedNodes={selectedNodes}
      selectedEdges={selectedEdges}
      nodes={nodes}
      edges={edges}
      extraItems={extraItems}
      canUndo={canUndo}
      canRedo={canRedo}
    />
  );
};
