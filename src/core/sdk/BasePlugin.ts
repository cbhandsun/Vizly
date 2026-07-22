import React from 'react';
import { MarkerType } from '@xyflow/react';
import type { Node, Edge, NodeTypes, EdgeTypes } from '@xyflow/react';
import { 
  DiagramTypePlugin, 
  PluginContext, 
  SidebarPanel, 
  KeyboardShortcut, 
  CommandItem,
  PropertyEditorExtension
} from '../types/plugin';

import { coerceToStandardDiagramData } from '../utils/coerceDiagram';
import { coerceClipboardData } from '../utils/flowchartClipboard';
import type { StandardDiagramData } from '../models/DiagramModels';
import { diagramStyleManager } from '../components/shared/DiagramStyleManager';
import { logBasePluginStandardDataCoercionFailure } from './basePluginLogging';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const finiteDimension = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
);

const optionalString = (value: unknown): string | undefined => (
  typeof value === 'string' ? value : undefined
);

const standardDataToReactFlowLightweight = (standardData: StandardDiagramData): { nodes: Node[]; edges: Edge[] } => {
  const nodes = standardData.nodes.map((nodeData, index) => {
    const nodeRecord = nodeData as unknown as Record<string, unknown>;
    const metadata = isRecord(nodeData.metadata) ? nodeData.metadata : {};
    const metadataStyle = isRecord(metadata.style) ? metadata.style : {};
    const description = nodeData.description || nodeData.label || '';
    const label = nodeData.label || String(description).replace(/<[^>]*>?/gm, '').slice(0, 40) || nodeData.id;
    const width = finiteDimension(metadata.width ?? nodeData.width ?? metadataStyle.width, 160);
    const height = finiteDimension(metadata.height ?? nodeData.height ?? metadataStyle.height, 80);
    const positionValue = metadata.canvasPosition ?? nodeRecord.position;
    const positionRecord = isRecord(positionValue) ? positionValue : {};
    const position = {
      x: typeof positionRecord.x === 'number' && Number.isFinite(positionRecord.x)
        ? positionRecord.x
        : 120 + (index % 4) * 180,
      y: typeof positionRecord.y === 'number' && Number.isFinite(positionRecord.y)
        ? positionRecord.y
        : 120 + Math.floor(index / 4) * 120,
    };
    const customData = isRecord(nodeData.data) ? nodeData.data : {};

    return {
      id: nodeData.id,
      type: nodeData.type || 'custom',
      position,
      parentId: typeof nodeRecord.parentId === 'string'
        ? nodeRecord.parentId
        : typeof metadata.parentId === 'string' ? metadata.parentId : undefined,
      data: {
        ...customData,
        ...metadata,
        label,
        description,
        domain: nodeData.domain,
        domainClass: nodeData.domainClass,
        subDomain: nodeData.subDomain,
      },
      style: {
        ...metadataStyle,
        width,
        height,
      },
      width,
      height,
      measured: { width, height },
    } satisfies Node;
  });

  const edges = standardData.edges.map((edgeData) => {
    const edgeRecord = edgeData as unknown as Record<string, unknown>;
    const metadata = isRecord(edgeData.metadata) ? edgeData.metadata : {};
    const customData = isRecord(edgeRecord.data) ? edgeRecord.data : {};
    return {
      id: edgeData.id ?? `e-${edgeData.source}-${edgeData.target}`,
      source: edgeData.source,
      target: edgeData.target,
      sourceHandle: edgeData.sourceHandle ?? optionalString(metadata.sourceHandle),
      targetHandle: edgeData.targetHandle ?? optionalString(metadata.targetHandle),
      type: edgeData.type === 'main' ? 'advanced-smart-step' : edgeData.type || 'advanced-smart-step',
      label: edgeData.label,
      markerEnd: edgeData.markerEnd || { type: MarkerType.ArrowClosed },
      style: edgeData.style,
      data: {
        ...customData,
        ...metadata,
      },
    } satisfies Edge;
  });

  return { nodes, edges };
};

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
  async migrate<T>(data: T, _fromVersion: string | undefined): Promise<T> {
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

    const raw = source as Record<string, unknown>;

    // 1. 如果源数据已经是标准的 React Flow 格式 (节点带有明确的 position)
    const isRfFormat = Array.isArray(raw.nodes) && 
                      raw.nodes.length > 0 && 
                      isRecord(raw.nodes[0]) && raw.nodes[0].position !== undefined;

    if (isRfFormat) {
      const canvas = coerceClipboardData({
        nodes: raw.nodes,
        edges: Array.isArray(raw.edges) ? raw.edges : [],
      });
      if (!canvas) return { nodes: [], edges: [] };
      // [FIX] RF 格式数据跳过了 EdgeFactory，手动为缺失 style 的边注入 preset 默认值
      const preset = (() => { try { return diagramStyleManager.getPreset(); } catch { return null; } })();
      const defaultStroke = preset?.edges?.main?.color || '#3E8EDE';
      const defaultWidth = preset?.edges?.main?.width || 1.8;
      const defaultDash = preset?.edges?.main?.dash || undefined;
      const defaultArrowW = preset?.edges?.main?.arrow?.width ?? 10;
      const defaultArrowH = preset?.edges?.main?.arrow?.height ?? 10;

      const patchedEdges = canvas.edges.map((e) => {
        const hasStyle = e.style && (e.style.stroke || e.style.strokeWidth);
        if (hasStyle) return e;
        return {
          ...e,
          style: {
            ...e.style,
            stroke: defaultStroke,
            strokeWidth: defaultWidth,
            ...(defaultDash ? { strokeDasharray: defaultDash } : {}),
          },
          markerEnd: e.markerEnd || {
            type: MarkerType.ArrowClosed,
            color: defaultStroke,
            width: defaultArrowW,
            height: defaultArrowH,
          },
        };
      });
      return { nodes: canvas.nodes, edges: patchedEdges };
    }

    // 2. 尝试从 StandardDiagramData 标准化格式转换
    try {
      // 检查是否具备标准化数据的特征字段，或者只包含基础的节点与连线数组
      const hasStandardTraits = Array.isArray(raw.nodes) && Array.isArray(raw.edges);
      
      if (hasStandardTraits) {
        const standardData = coerceToStandardDiagramData(raw, { 
          id: this.id + '_' + Date.now(),
          title: this.name 
        });
        return standardDataToReactFlowLightweight(standardData);
      }
    } catch (e) {
      logBasePluginStandardDataCoercionFailure(this.id, e);
    }

    // 3. 兜底解析
    return { 
      ...(coerceClipboardData(raw) ?? { nodes: [], edges: [] }),
    };
  }

  /**
   * 将 ReactFlow 状态序列化回领域数据
   */
  serializeData(nodes: Node[], edges: Edge[]): unknown {
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
  getNodeTypes(): NodeTypes {
    return {};
  }

  getEdgeTypes(): EdgeTypes {
    return {};
  }

  // ====== UI 扩展贡献 ======
  contributeToolbar?(_ctx: PluginContext): React.ReactNode {
    return null;
  }

  contributeSidebarPanels?(_ctx: PluginContext): SidebarPanel[] {
    return [];
  }

  contributeShortcuts?(_ctx: PluginContext): KeyboardShortcut[] {
    return [];
  }

  contributeCommands?(_ctx: PluginContext): CommandItem[] {
    return [];
  }

  contributePropertyEditors?(_ctx: PluginContext): PropertyEditorExtension[] {
    return [];
  }

  // ====== 工具方法 ======
  
  /** 分发全局事件 */
  protected emit(eventName: string, detail?: unknown): void {
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
