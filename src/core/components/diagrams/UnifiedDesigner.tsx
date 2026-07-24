import React, { useMemo, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { PluginRegistry } from '../../services/PluginRegistry';
import { DiagramTypePlugin, PluginContext, SidebarPanel } from '../../types/plugin';
import {
  logUnifiedDesignerInitialDataFallback,
  logUnifiedDesignerUnsupportedAction,
} from '../shared/componentFallbackLogging';
import { resolveUnifiedDesignerCanvasState } from './unifiedDesignerState';

export interface UnifiedDesignerProps {
  /** 插件 ID。如果不传，则使用默认插件 */
  pluginId?: string;
  /** 初始数据区 */
  initialData?: unknown;
  /** 类名 */
  className?: string;
  /** 样式 */
  style?: React.CSSProperties;
}

export const UnifiedDesigner: React.FC<UnifiedDesignerProps> = ({
  pluginId,
  initialData,
  className,
  style,
}) => {
  const pluginRegistry = PluginRegistry.getInstance();
  const plugin = useMemo<DiagramTypePlugin | undefined>(() => {
    return pluginId ? pluginRegistry.getPlugin(pluginId) : pluginRegistry.getDefaultPlugin();
  }, [pluginId, pluginRegistry]);

  const resolveCanvasState = React.useCallback(() => {
    if (!plugin) {
      return { nodes: [], edges: [] };
    }

    try {
      return resolveUnifiedDesignerCanvasState(plugin, initialData);
    } catch (error) {
      logUnifiedDesignerInitialDataFallback(plugin.id, error);
      return resolveUnifiedDesignerCanvasState(plugin);
    }
  }, [initialData, plugin]);

  // 基础画布状态集中管理
  const [nodes, setNodes] = useState<Node[]>(() => resolveCanvasState().nodes);
  const [edges, setEdges] = useState<Edge[]>(() => resolveCanvasState().edges);

  React.useEffect(() => {
    const nextState = resolveCanvasState();
    setNodes(nextState.nodes);
    setEdges(nextState.edges);
  }, [resolveCanvasState]);

  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  React.useEffect(() => {
      nodesRef.current = nodes;
      edgesRef.current = edges;
  }, [nodes, edges]);

  // 插件状态沙箱
  const [pluginStates, setPluginStates] = useState<Record<string, unknown>>({});
  const activePluginStateKey = plugin?.id || pluginId || '__default__';
  const getPluginState = React.useCallback(<T,>() => pluginStates[activePluginStateKey] as T | undefined, [pluginStates, activePluginStateKey]);
  const setPluginState = React.useCallback(<T,>(patch: Partial<T> | ((prev: T) => T)) => {
      setPluginStates(prev => {
          const current = (prev[activePluginStateKey] || {}) as T;
          const updated = typeof patch === 'function'
            ? (patch as (value: T) => T)(current)
            : { ...current, ...patch };
          return { ...prev, [activePluginStateKey]: updated };
      });
  }, [activePluginStateKey]);

  const unsupportedAction = React.useCallback(
    (method: 'updateNodesBatch' | 'updateEdgesBatch' | 'takeSnapshot' | 'addNode') => {
      logUnifiedDesignerUnsupportedAction(method, plugin?.id);
    },
    [plugin?.id]
  );

  // 组装透传给各插件面板的统一上下文
  const pluginCtx = useMemo<PluginContext>(() => ({
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    get nodes() { return nodesRef.current; },
    get edges() { return edgesRef.current; },
    updateNodesBatch: () => { unsupportedAction('updateNodesBatch'); },
    updateEdgesBatch: () => { unsupportedAction('updateEdgesBatch'); },
    takeSnapshot: () => { unsupportedAction('takeSnapshot'); },
    setNodes,
    setEdges,
    addNode: () => {
      unsupportedAction('addNode');
      return '';
    },
    getPluginState,
    setPluginState,
    // TODO: 之后在内部真正实例化 ReactFlow 时放入 reactFlowInstance
  }), [setNodes, setEdges, getPluginState, setPluginState, unsupportedAction]);

  const sidebarPanels = useMemo<SidebarPanel[]>(
    () => (plugin?.contributeSidebarPanels ? plugin.contributeSidebarPanels(pluginCtx) : []),
    [plugin, pluginCtx]
  );

  if (!plugin) {
    return (
      <div style={{ padding: 20, color: 'red' }}>
        Failed to load DiagramTypePlugin: {pluginId || 'default'}
      </div>
    );
  }

  return (
    <div className={`unified-designer ${className || ''}`} style={{ ...style, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="unified-toolbar" style={{ height: 48, borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <div className="toolbar-left" style={{ fontWeight: 600, marginRight: 16 }}>Unified Designer ({plugin.name})</div>
        <div className="toolbar-center">
          {plugin.contributeToolbar && plugin.contributeToolbar(pluginCtx)}
        </div>
      </div>
      <div className="unified-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div className="unified-sidebar-left" style={{ width: 240, borderRight: '1px solid #e8e8e8', padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Plugin Shell</div>
          <div style={{ fontSize: 12, color: '#666', lineHeight: 1.6 }}>
            <div>ID: {plugin.id}</div>
            <div>Nodes: {nodes.length}</div>
            <div>Edges: {edges.length}</div>
            <div>Panels: {sidebarPanels.length}</div>
          </div>
        </div>
        <div className="unified-canvas" style={{ flex: 1, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{plugin.name}</div>
            <div>Standalone shell loaded.</div>
            <div>Interactive canvas runtime is not mounted in this component.</div>
          </div>
        </div>
        <div className="unified-sidebar-right" style={{ width: 300, borderLeft: '1px solid #e8e8e8' }}>
          {sidebarPanels.length === 0 ? (
            <div style={{ padding: 16, color: '#999' }}>No plugin sidebar panels.</div>
          ) : sidebarPanels.map(panel => (
            <div key={panel.id} style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #e8e8e8', fontWeight: 'bold' }}>
                {panel.icon} <span style={{ marginLeft: 8 }}>{panel.title}</span>
              </div>
              <div style={{ overflow: 'auto', maxHeight: 320 }}>
                {panel.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
