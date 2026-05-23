import React, { useMemo, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { PluginRegistry } from '../../services/PluginRegistry';
import { DiagramTypePlugin, PluginContext } from '../../types/plugin';

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
  _initialData,
  className,
  style,
}) => {
  const pluginRegistry = PluginRegistry.getInstance();
  const plugin = useMemo<DiagramTypePlugin | undefined>(() => {
    return pluginId ? pluginRegistry.getPlugin(pluginId) : pluginRegistry.getDefaultPlugin();
  }, [pluginId, pluginRegistry]);

  // 基础画布状态集中管理
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  React.useEffect(() => {
      nodesRef.current = nodes;
      edgesRef.current = edges;
  }, [nodes, edges]);

  // 插件状态沙箱
  const [pluginStates, setPluginStates] = useState<Record<string, any>>({});
  const getPluginState = React.useCallback(<T,>() => pluginStates[pluginId || ''] as T | undefined, [pluginStates, pluginId]);
  const setPluginState = React.useCallback(<T,>(patch: Partial<T> | ((prev: T) => T)) => {
      setPluginStates(prev => {
          const current = (prev[pluginId || ''] || {}) as T;
          const updated = typeof patch === 'function' ? (patch as any)(current) : { ...current, ...patch };
          return { ...prev, [pluginId || '']: updated };
      });
  }, [pluginId]);

  // 组装透传给各插件面板的统一上下文
  const pluginCtx = useMemo<PluginContext>(() => ({
    getNodes: () => nodesRef.current,
    getEdges: () => edgesRef.current,
    get nodes() { return nodesRef.current; },
    get edges() { return edgesRef.current; },
    updateNodesBatch: () => { console.warn('UnifiedDesigner: updateNodesBatch not implemented'); },
    updateEdgesBatch: () => { console.warn('UnifiedDesigner: updateEdgesBatch not implemented'); },
    takeSnapshot: () => {},
    setNodes,
    setEdges,
    getPluginState,
    setPluginState,
    // TODO: 之后在内部真正实例化 ReactFlow 时放入 reactFlowInstance
  }), [setNodes, setEdges, getPluginState, setPluginState]);

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
          {/* 左侧边面板通过 contributeSidebarPanels 挂载 */}
          Left Sidebar Placeholder
        </div>
        <div className="unified-canvas" style={{ flex: 1, background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           {/* 未来将接入 <FlowchartCanvasShell> 等抽象壳 */}
           Canvas Placeholder for {plugin.name}
        </div>
        <div className="unified-sidebar-right" style={{ width: 300, borderLeft: '1px solid #e8e8e8' }}>
          {/* 如果有右侧面板，可以展示 */}
          {plugin.contributeSidebarPanels && plugin.contributeSidebarPanels(pluginCtx).map(panel => (
            <div key={panel.id} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #e8e8e8', fontWeight: 'bold' }}>
                {panel.icon} <span style={{ marginLeft: 8 }}>{panel.title}</span>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {panel.content}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
