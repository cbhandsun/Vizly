import React, { useState } from 'react';
import { Button } from 'antd';
import { CodeOutlined } from '@ant-design/icons';
import { FaShapes } from 'react-icons/fa';
import type { Node, Edge } from '@xyflow/react';
import {
  DiagramTypePlugin,
  PluginContext,
  SidebarPanel,
  JsonEditorModal,
  FlowchartShapesPanel
} from '@/core';
import { TemplateCascaderMenu } from '../ui/TemplateCascaderMenu';
import { dataService } from '@/services/DataService';
import { PRESET_MAP, defaultStandardData } from '@/data/standardized';

export class StandardFlowPlugin implements DiagramTypePlugin {
  id = 'standard-flow';
  name = '标准流程图';

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

    // TODO: 这里应接入真正的加载逻辑（如调用 loadFromCloud 或解析 PRESET_MAP）
    // 为了简化 Plugin 的状态，可以触发一个全局事件或暴露给父级，也可以直接通过 import('@/core') 解析
    let data;
    if (rootGroup === 's3' || rootGroup === 'supabase') {
       // 需要通过 dataService 获取（如果有缓存）或后续再处理云加载
       data = dataService.getDiagram(key);
    } else {
       data = PRESET_MAP[key] || defaultStandardData;
    }

    if (data) {
      import('@/core').then(({ standardDataToCanvas }) => {
        standardDataToCanvas(data).then(({ nodes, edges }: { nodes: Node[], edges: Edge[] }) => {
           ctx.setNodes(nodes);
           ctx.setEdges(edges);
           setTimeout(() => {
             ctx.reactFlowInstance?.fitView({ duration: 800, padding: 0.35 });
           }, 50);
        });
      });
    }
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
