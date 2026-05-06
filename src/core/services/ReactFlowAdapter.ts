import type { Node, Edge } from '@xyflow/react';
import type { StandardDiagramData, StandardNodeData, StandardEdgeData } from '../models/DiagramModels';
import { NodeFactory } from '../factories/NodeFactory';
import { EdgeFactory, EdgeStyleType, EdgeType } from '../factories/EdgeFactory';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import type { Theme } from '../themes/types/ThemeTypes';
import { getThemeManager } from '../themes';

/**
 * React Flow 视图数据适配器
 * - 负责将标准化图表数据转换为 React Flow 可用的节点和边
 * - 保持与 NodeFactory / EdgeFactory 的一致性，避免服务层重复实现
 */
export class ReactFlowAdapter {
  /**
   * 将标准化图表数据转换为 React Flow 节点与边
   * 函数级注释：节点与边适配
   * - 节点：向 NodeFactory 传入 `description` 与 `label`，由工厂层进行字段同步，保证自定义节点渲染一致。
   * - 边：根据全局配置选择智能/原生路径与样式，并写入必要的元数据供渲染与布局策略使用。
   */
  toReactFlow(standardData: StandardDiagramData): { nodes: Node[]; edges: Edge[] } {
    // 获取当前主题
    const themeManager = getThemeManager();
    const currentTheme = themeManager.getCurrentTheme();


    const styleTypeMap: Record<string, EdgeStyleType> = {
      main: EdgeStyleType.MAIN,
      dependency: EdgeStyleType.DEPENDENCY,
      data: EdgeStyleType.DATA,
      support: EdgeStyleType.SUPPORT,
      core: EdgeStyleType.CORE,
      channel: EdgeStyleType.CHANNEL,
      midend: EdgeStyleType.MIDEND,
      scm: EdgeStyleType.SCM,
      logistics: EdgeStyleType.LOGISTICS,
      corp: EdgeStyleType.CORP,
      infra: EdgeStyleType.INFRA,
      feedback: EdgeStyleType.FEEDBACK
    };

    // 建立节点域索引，以便为边提供域主题信息
    const idToDomain = new Map<string, string | undefined>();
    for (const node of standardData.nodes) {
      idToDomain.set(node.id, (node as any).domain);
    }

    // 将标准数据映射为 React Flow 节点
    // 函数级注释：规范节点类型与数据字段
    // - 统一未知/自定义类型为 `custom`，保证使用我们注册的 CustomNode 渲染（优先显示 description）
    // - 保留并同步 `label` 与 `description` 到 data，便于渲染层选择
    const nodes = standardData.nodes.map((nodeData: StandardNodeData) => {
      const domain = (nodeData as any).domain;
      // 说明：标准数据的 node.data.theme 通常为域颜色（ThemeColor），
      // 不是增强主题的完整 Theme；为避免类型不匹配，这里不传递主题对象，
      // 交由 NodeFactory 使用统一的 getDomainTheme 从全局主题或兜底计算颜色。
      const domainClass = (nodeData as any).domainClass;
      const subDomain = (nodeData as any).subDomain; // 顶层 subDomain 需要透传到 data 供分组使用
      const extraData = (nodeData.metadata || {}) as Record<string, any>;
      // 规范节点类型：保留原始类型，若为空则回退为 custom
      const rawType = String((nodeData as any).type || '').trim();
      const normalizedType = rawType ? rawType : 'custom';
      /**
       * 函数级注释：节点数据透传与规范
       * - 直传 `domainClass` 到 `node.data`，以便渲染层按域类解析主题颜色。
       * - 保留顶层字段 `domain`、`description`，并显式透传 `subDomain` 用于子域分组（applySubGrouping 读取 node.data.subDomain）。
       */
      // 函数级注释：忽略外部 zIndex，统一由 NodeFactory 的角色层级控制
      // - 目的：避免标准数据中的 zIndex 破坏容器层级与主题分层；提升一致性
      return NodeFactory.getInstance().createNode({
        id: nodeData.id,
        description: nodeData.description || '',
        type: normalizedType as any,
        position: (nodeData as any).position || { x: 0, y: 0 },
        width: (nodeData as any).width,
        height: (nodeData as any).height,
        // 将域与元数据（如 stage）写入节点数据，供布局策略使用
        data: {
          ...(nodeData as any).data,
          ...extraData,
          domain,
          domainClass,
          subDomain,
          description: nodeData.description
        }
      }, currentTheme);
    });

    const edges = standardData.edges.map((edgeData: StandardEdgeData) => {
      const styleType = (() => {
        if (edgeData.style?.stroke) {
          return EdgeStyleType.CUSTOM;
        }
        if (edgeData.type === 'feedback') {
          // 映射到依赖/支撑的样式，或使用反馈专用样式（由 EdgeFactory 扩展）
          return EdgeStyleType.DEPENDENCY as EdgeStyleType;
        }
        return styleTypeMap[edgeData.type] || EdgeStyleType.MAIN;
      })();

       const metadata = edgeData.metadata || {};
      const isElkEdge = (metadata as any).elk?.sections;

      // 默认边类型计算（移除贝塞尔/平滑的隐式回退）
      /**
       * 函数级注释：默认边类型选择
       * - 当标准数据未显式指定类型或类型非法时：
       *   依据全局 edge.mode 与 edge.pathType 映射到明确类型；
       * - 移除任何“无法识别→贝塞尔/平滑”的回退；未知/auto 一律映射为阶梯（step）。
       */
      const cfgEdge = diagramConfigManager.getConfig().edge as any;
      /**
       * 函数级注释：默认类型选择收敛
       * 行为：适配层不参与类型智能选择，默认统一为 STEP；类型最终由稳定窗口后统一处理。
       */
      const defaultEdgeType: EdgeType = EdgeType.STEP;

      // 优先使用边数据中定义的类型，若未定义或无效，则回退到全局默认值
      const edgeType = isElkEdge
        ? EdgeType.ELK
        : (edgeData.type && Object.values(EdgeType).includes(edgeData.type as EdgeType))
          ? (edgeData.type as EdgeType)
          : defaultEdgeType;

  const data = {
    ...(edgeData as any).data,
    ...metadata,
    sourceDomain: idToDomain.get(edgeData.source),
    targetDomain: idToDomain.get(edgeData.target),
    /** 函数级注释：语义类型归一
     * - 仅使用 edgeType 表达业务语义（main/dependency/data/support）
     * - 移除 kind，避免与渲染类型或历史别名产生混淆
     */
    edgeType: edgeData.type,
  };

      if (isElkEdge) {
        (data as any).sections = (metadata as any).elk.sections;
      }

      return EdgeFactory.getInstance().createEdge({
        id: edgeData.id ?? `e-${edgeData.source}-${edgeData.target}-${Math.random().toString(36).substring(2,9)}`,
        source: edgeData.source,
        target: edgeData.target,
        type: edgeType as EdgeType, // 显式类型断言
        styleType,
        label: edgeData.label,
        animated: (edgeData.style as any)?.animated,
        strokeWidth: (edgeData.style as any)?.strokeWidth,
        strokeColor: (edgeData.style as any)?.stroke,
        strokeDasharray: (edgeData.style as any)?.strokeDasharray,
        data,
      });
    });

    return { nodes, edges };
  }
}

export const reactFlowAdapter = new ReactFlowAdapter();
