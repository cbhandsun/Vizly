import React, { useState } from 'react';
import { Button } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { FaShapes } from 'react-icons/fa';
import type { Node, Edge } from '@xyflow/react';
import type { DiagramTypePlugin, PluginContext, SidebarPanel } from '@/core/types/plugin';
import { JsonEditorModal } from '@/core/components/diagrams/JsonEditorModal';
import { FlowchartShapesPanel } from '@/core/components/diagrams/FlowchartShapesPanel';
import { TemplateCascaderMenu } from '../ui/TemplateCascaderMenu';
import { parseRemoteDiagramContent } from '@/services/remoteDiagramContent';
import { PRESET_MAP, defaultStandardData } from '@/data/standardized';
import { getCustomPreset } from '@/core/utils/customPresetStorage';
import { appMessage } from '@/core/utils/antdStaticBridge';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import {
  coerceRemoteDiagramSelection,
  selectDiagramViewerTemplate,
  type DiagramViewerTemplateData,
} from '@/components/diagramViewerTemplateSelection';
import { logStandardFlowTemplateLoadFailure } from './standardFlowPluginLogging';

export class StandardFlowPlugin implements DiagramTypePlugin {
  id = 'standard-flow';
  name = '标准流程图';
  version = '2.1.0';
  description = '功能强大的通用流程图引擎，支持多种自动布局策略与智能连线，是业务逻辑编排的首选工具。';
  author = 'Vizly Core Team';
  category: 'Core' | 'Productivity' | 'Integration' | 'Beta' = 'Core';
  tags = ['Flow', 'Logic', 'BPMN'];
  brandColor = '#1890ff';

  parseData(_source: unknown) {
    // 依赖核心设计器的 parser，因此此处返回空，由加载方调用 designerUtils.standardDataToCanvas 处理
    return { nodes: [], edges: [] };
  }

  serializeData(nodes: Node[], edges: Edge[]) {
    // 依赖核心设计器的 serializer
    return { nodes, edges };
  }

  getEmptyState() {
    return { nodes: [], edges: [] };
  }

  getSupportedLayouts() {
    return [
      'DomainVerticalLayout',
      'DomainHorizontalLayout',
      'DomainElkLayout',
      'DomainDagreLayout',
    ];
  }

  getDefaultLayout() {
    return 'DomainVerticalLayout';
  }

  getNodeTypes() { return {}; }
  getEdgeTypes() { return {}; }

  contributeToolbar(ctx: PluginContext) {
    return <StandardTemplateToolbar ctx={ctx} />;
  }

  contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
    return [
      {
        id: 'shapes',
        title: '基础形状',
        icon: <FaShapes />,
        content: <FlowchartShapesPanel ctx={ctx} />,
      },
      {
        id: 'json-editor',
        title: '模型数据',
        icon: <CodeOutlined />,
        content: <JsonEditorPanelWrapper ctx={ctx} />,
      },
    ];
  }

  // ====== AI Actions (GAP-10 Phase 2) ======
  async onAIAction(action: string, params: unknown, ctx: PluginContext): Promise<boolean> {
    
    switch (action) {
      case 'smart-optimize':
        // 插件特定的智能优化逻辑
        import('@/core/utils/layoutRecommender').then(({ recommendLayout }) => {
          const recommendation = recommendLayout(ctx.getNodes(), ctx.getEdges());
          if (recommendation) {
            window.dispatchEvent(new CustomEvent('editor:command', { 
              detail: { action: 'apply-layout', strategy: recommendation.domainStrategy } 
            }));
          }
        });
        return true;

      case 'add-service':
        if (!params || typeof params !== 'object' || Array.isArray(params)) return false;
        {
          const safeParams = params as Record<string, unknown>;
        // 假设 AI 想专门添加一个微服务节点
        ctx.addNode('customNode', { 
          label: typeof safeParams.label === 'string' ? safeParams.label.slice(0, 1000) : 'New Service',
          domainClass: typeof safeParams.domainClass === 'string' ? safeParams.domainClass.slice(0, 100) : 'mid',
          type: 'microservice'
        });
        return true;
        }

      default:
        return false; // 继续由系统默认处理
    }
  }
}

/**
 * 将选择器隔离在 Wrapper 中，维护自己的选中路径状态。
 * 当用户选中模板时，调用 ctx.setNodes 等去更新全局
 */
const StandardTemplateToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
  const [selectedPath, setSelectedPath] = useState<string[]>(['gallery', 'all-demos', 'SupplyChainReceivingFlow']);

  const handlePresetChange = async (val: string[], key: string, rootGroup: string) => {
    setSelectedPath(val);
    if (!key) return;

    await selectDiagramViewerTemplate(key, rootGroup, {
      loadRemoteDiagram: async (providerName, id) => {
        const { unifiedStorage } = await import('@/services/UnifiedStorageService');
        const savedDiagram = await unifiedStorage.getProvider(providerName).loadDiagram(id);
        return coerceRemoteDiagramSelection(savedDiagram, id);
      },
      loadSystemTemplate: async (id) => {
        const { supabase } = await import('@/services/supabase');
        if (!supabase) return null;
        const { data, error } = await supabase
          .from('system_templates')
          .select('content, title, id')
          .eq('id', id)
          .single();
        if (error) throw error;
        return coerceRemoteDiagramSelection(data, id);
      },
      loadStandardPreset: async (id) => (
        (PRESET_MAP[id] ?? defaultStandardData) as unknown as DiagramViewerTemplateData
      ),
      getLocalPreset: (id) => getCustomPreset(id) as unknown as DiagramViewerTemplateData | null,
      parseRemoteContent: (content, fallback) => parseRemoteDiagramContent(content, {
        id: fallback.id,
        title: fallback.title ?? fallback.id,
      }) as unknown as DiagramViewerTemplateData,
      seedAndNavigate: async (data) => {
        const { standardDataToCanvas } = await import('@/core/components/diagrams/designerUtils');
        const { nodes, edges } = await standardDataToCanvas(data as unknown as StandardDiagramData);
        ctx.setNodes(nodes);
        ctx.setEdges(edges);
        setTimeout(() => {
          ctx.reactFlowInstance?.fitView({ duration: 800, padding: 0.35, minZoom: 0.55 });
        }, 50);
      },
      clearBlankTemplate: () => undefined,
      selectDiagram: () => undefined,
      showLoading: (message) => appMessage.loading(message, 0),
      showError: (message) => appMessage.error(message),
      logFailure: (_source, _id, error) => logStandardFlowTemplateLoadFailure(error),
      translate: (translationKey, values) => {
        if (translationKey === 'storage.manager.downloading') return '正在加载云端模板...';
        if (translationKey === 'storage.manager.noContent') return '模板内容为空';
        return `模板加载失败: ${values?.message ?? '未知错误'}`;
      },
    });
  };

  return (
    <div style={{ paddingLeft: 12 }}>
      <TemplateCascaderMenu
        value={selectedPath}
        onChange={handlePresetChange}
      />
    </div>
  );
};

const JsonEditorPanelWrapper: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ color: '#666', marginBottom: 16, fontSize: 13, lineHeight: '1.6' }}>
        <p>通过 JSON 数据定义您的业务架构标准模型。</p>
        <p>支持域、子域和具体节点的三层结构声明。编辑保存后画布将自动重绘与拉线。</p>
      </div>
      <Button icon={<CodeOutlined />} type="primary" onClick={() => setVisible(true)} block>
        打开 JSON 架构编辑器
      </Button>

      {visible && (
        <JsonEditorModal
          visible={visible}
          onClose={() => setVisible(false)}
          nodes={ctx.nodes}
          edges={ctx.edges}
          setNodes={ctx.setNodes}
          setEdges={ctx.setEdges}
          reactFlowInstance={ctx.reactFlowInstance!}
        />
      )}
    </div>
  );
};
