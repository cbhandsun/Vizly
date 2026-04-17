import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import { 
  DiagramTypePlugin, 
  PluginContext, 
  SidebarPanel, 
  KeyboardShortcut, 
  CommandItem,
  PropertyEditorExtension
} from '../types/plugin';

import { reactFlowAdapter } from '../services/ReactFlowAdapter';
import { coerceToStandardDiagramData } from '../utils/coerceDiagram';

/**
 * BaseDiagramPlugin - Vizly 插件基类
 * 
 * 提供了标准的插件接口实现与辅助工具，降低插件开发门槛。
 * 兼容 StandardDiagramData 标准化数据文件。
 */
export abstract class BaseDiagramPlugin implements DiagramTypePlugin {
  abstract id: string;
  abstract name: string;
  icon?: React.ReactNode;
  version: string = '1.0';

  /** 
   * 生命周期：图表初始化 
   */
  onInit?(ctx: PluginContext): void | Promise<void>;

  /** 
   * 生命周期：插件卸载 
   */
  onDestroy?(ctx: PluginContext): void | Promise<void>;

  /** 
   * 生命周期：捕获旧版本数据并洗牌升迁至当前最新结构 
   */
  async migrate(data: any, fromVersion: string | undefined): Promise<any> {
    return data;
  }

  /**
   * 将外部数据源解析为 ReactFlow nodes/edges
   * 自动支持 StandardDiagramData 格式的识别与转换
   */
  parseData(source: unknown): { nodes: Node[]; edges: Edge[] } {
    if (!source || typeof source !== 'object') {
      return { nodes: [], edges: [] };
    }

    const raw = source as any;

    // 1. 如果源数据已经是标准的 React Flow 格式 (节点带有明确的 position)
    const isRfFormat = Array.isArray(raw.nodes) && 
                      raw.nodes.length > 0 && 
                      (raw.nodes[0] as any).position !== undefined;

    if (isRfFormat) {
      return { nodes: raw.nodes || [], edges: raw.edges || [] };
    }

    // 2. 尝试从 StandardDiagramData 标准化格式转换
    try {
      // 检查是否具备标准化数据的特征字段
      const hasStandardTraits = Array.isArray(raw.nodes) && 
                               (raw.type || raw.layout || (raw.nodes.length > 0 && 'description' in raw.nodes[0]));
      
      if (hasStandardTraits) {
        const standardData = coerceToStandardDiagramData(raw, { 
          id: this.id + '_' + Date.now(),
          title: this.name 
        });
        return reactFlowAdapter.toReactFlow(standardData);
      }
    } catch (e) {
      console.warn(`[${this.id}] Standard data coercion failed, falling back to raw:`, e);
    }

    // 3. 兜底解析
    return { 
      nodes: Array.isArray(raw.nodes) ? raw.nodes : [], 
      edges: Array.isArray(raw.edges) ? raw.edges : [] 
    };
  }

  /**
   * 将 ReactFlow 状态序列化回领域数据
   */
  serializeData(nodes: Node[], edges: Edge[]): any {
    return { nodes, edges };
  }

  /**
   * 创建空白画布的初始数据
   */
  getEmptyState(): { nodes: Node[]; edges: Edge[] } {
    return { nodes: [], edges: [] };
  }

  // ====== 布局 (默认行为) ======
  getSupportedLayouts(): string[] {
    return [];
  }

  getDefaultLayout(): string {
    return '';
  }

  // ====== 渲染 (默认行为) ======
  getNodeTypes(): Record<string, React.ComponentType<any>> {
    return {};
  }

  getEdgeTypes(): Record<string, React.ComponentType<any>> {
    return {};
  }

  // ====== UI 扩展贡献 ======
  contributeToolbar?(ctx: PluginContext): React.ReactNode {
    return null;
  }

  contributeSidebarPanels?(ctx: PluginContext): SidebarPanel[] {
    return [];
  }

  contributeShortcuts?(ctx: PluginContext): KeyboardShortcut[] {
    return [];
  }

  contributeCommands?(ctx: PluginContext): CommandItem[] {
    return [];
  }

  contributePropertyEditors?(ctx: PluginContext): PropertyEditorExtension[] {
    return [];
  }

  // ====== 工具方法 ======
  
  /** 分发全局事件 */
  protected emit(eventName: string, detail?: any) {
    const event = new CustomEvent(eventName, { detail });
    window.dispatchEvent(event);
  }

  /** 显示通知 (通过 UI 系统监听的事件) */
  protected notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
    this.emit('vizly:notification', { message, type });
  }

  /** 触发自动视图适配 */
  protected fitView(ctx: PluginContext, duration = 600) {
    ctx.reactFlowInstance?.fitView({ duration, padding: 0.25, minZoom: 0.55 });
  }
}
