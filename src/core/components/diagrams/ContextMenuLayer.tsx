import React from 'react';
import { useDiagramStore } from '../../store/useDiagramStore';
import { DiagramContextMenu } from './DiagramContextMenu';
import { useReactFlow } from '@xyflow/react';
import type { Node, Edge } from '@xyflow/react';

import { DiagramTypePlugin, PluginContext } from '../../types/plugin';

interface ContextMenuLayerProps {
  onAction: (action: string, targetId?: string) => void;
  activePlugin?: DiagramTypePlugin | null;
  pluginCtx?: PluginContext;
}

const EMPTY_ARRAY: any[] = [];

export const ContextMenuLayer: React.FC<ContextMenuLayerProps> = ({ onAction, activePlugin, pluginCtx }) => {
  const contextMenu = useDiagramStore((state: any) => state.contextMenu);
  const selectedNodes = useDiagramStore((state: any) => state.selectedNodes);
  const selectedEdges = useDiagramStore((state: any) => state.selectedEdges);
  
  // ⭐ 性能优化：当菜单未打开时，切断对完整 nodes 数组的订阅，防止拖拽节点时引发该组件以 60FPS 重绘
  const nodes = useDiagramStore((state: any) => contextMenu ? state.nodes : EMPTY_ARRAY);
  const setContextMenu = useDiagramStore((state: any) => state.setContextMenu);

  if (!contextMenu) return null;

  const extraItems = React.useMemo(() => {
    if (!activePlugin?.contributeContextMenu || !pluginCtx) return [];
    
    let targetElement: Node | Edge | null = null;
    if (contextMenu.type === 'node' && contextMenu.targetId) {
      targetElement = nodes.find((n: Node) => n.id === contextMenu.targetId) || null;
    } else if (contextMenu.type === 'edge' && contextMenu.targetId) {
      targetElement = pluginCtx.getEdges().find((e: Edge) => e.id === contextMenu.targetId) || null;
    }

    return activePlugin.contributeContextMenu(targetElement, pluginCtx) || [];
  }, [activePlugin, pluginCtx, contextMenu.type, contextMenu.targetId, nodes]);

  return (
    <DiagramContextMenu
      {...contextMenu}
      onClose={() => setContextMenu(null)}
      onAction={onAction}
      selectedNodes={selectedNodes}
      selectedEdges={selectedEdges}
      nodes={nodes}
      extraItems={extraItems}
    />
  );
};
