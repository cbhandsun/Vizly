import { Node } from '@xyflow/react';
import { StandardNodeData } from '../models/DiagramModels';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import type { Theme } from '../themes/types/ThemeTypes';
import { enhancedTextMeasurement } from '../utils/EnhancedTextMeasurement';
import { LayoutOptimizer } from '../components/layout/LayoutOptimizer';
import { getDomainTheme, resolveThemeDomainKey } from '../utils/domainKey';
import { diagramStyleManager } from '../components/shared/DiagramStyleManager';

/**
 * 模块级调试开关 — 避免每次 createNode 都读 localStorage
 */
const debugEnabled = (() => {
  try { const v = localStorage.getItem('architecture-diagram-debug'); return v === '1' || v === 'true'; } catch { return false; }
})();

/**
 * 紧凑域缩放系数（模块级常量，保证 createNode 与 createNodes 一致）
 */
const COMPACT_DOMAINS: Record<string, { fontScale: number; widthScale: number; paddingHScale: number; paddingVScale: number }> = {
  strategy: { fontScale: 0.85, widthScale: 0.85, paddingHScale: 0.85, paddingVScale: 0.85 },
  data:     { fontScale: 0.85, widthScale: 0.85, paddingHScale: 0.85, paddingVScale: 0.85 },
  interface:{ fontScale: 0.85, widthScale: 0.85, paddingHScale: 0.85, paddingVScale: 0.85 },
};

/**
 * 节点类型枚举
 */
export enum NodeType {
  CUSTOM = 'custom',
  SUB_GROUP = 'subGroup',
  DOMAIN = 'domain',
  INPUT = 'input',
  OUTPUT = 'output',
  DEFAULT = 'default'
}

/**
 * 节点创建配置接口
 */
export interface NodeConfig {
  id: string;
  type?: NodeType;
  position: { x: number; y: number };
  description: string;
  draggable?: boolean;
  theme?: any; // 暂时使用any类型
  /**
   * 函数级注释：域类标识（强制）
   * - 新数据必须显式提供，用于唯一域主题解析。
   */
  domainClass?: string;
  domain?: string;
  /**
   * 函数级注释：新增字段 subDomain
   * - 目的：标准化数据中的顶层 `subDomain` 能被工厂透传到 `node.data.subDomain`
   * - 背景：布局的 applySubGrouping 按 `node.data.subDomain` 聚合；若未透传则不会生成子域容器
   */
  subDomain?: string;
  parentId?: string;
  zIndex?: number;
  width?: number;
  height?: number;
  style?: Record<string, any>;
  data?: Record<string, any>;
  shape?: string;
  metadata?: any;
}

/**
 * 节点验证结果接口
 */
export interface NodeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 节点工厂类 - 统一管理节点的创建和配置
 * 
 * 职责：
 * 1. 标准化节点创建流程
 * 2. 类型安全检查和验证
 * 3. 自动应用主题和样式
 * 4. 智能计算节点尺寸
 */
export class NodeFactory {
  private static instance: NodeFactory;

  /**
   * 获取单例实例
   */
  static getInstance(): NodeFactory {
    if (!NodeFactory.instance) {
      NodeFactory.instance = new NodeFactory();
    }
    return NodeFactory.instance;
  }

  /**
  * 创建节点 - 主要创建方法
  * 函数级注释：负责标准化节点配置并输出 React Flow `Node`
  * - 同步并规范 `description` 与 `label`，避免渲染层使用的字段缺失或不一致
  * - 按域与配置计算宽高与样式，写入 `measured` 以保证 MiniMap/适配器正确渲染
  * - 所有传入的 `data` 字段会被保留，但会补充/修正 `description` 与 `label`
  */
  /**
   * 函数级注释：主题类型统一
   * - 参数 `diagramTheme` 统一为增强主题管理器的 `Theme` 类型；
   * - 避免使用过期的 `DiagramTheme`，以保证与 `utils/domainKey.getDomainTheme` 的签名一致。
   */
  createNode(config: NodeConfig, diagramTheme?: Theme, precalculatedSize?: { width: number, height: number }): Node {
    /**
     * 函数级注释：域主题解析（domainClass 优先）
     * - 修复域读取：从 config.domain 读取业务域，避免错误从 data.domain 导致颜色兜底
     * - 主题解析：以 domainClass 优先命中主题键，缺失时由 domain 推导
     */
    // 验证配置
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`节点创建失败: ${validation.errors.join(', ')}`);
    }

    // 规范化节点类型（函数级注释）
    // - 允许字符串类型并做别名映射：titlegroup -> titleGroup，subgroup -> subGroup
    // - 未注册或未知类型统一回退为 custom，确保使用已注册的自定义节点渲染
    const normalizedType = (() => {
      const raw = (config.type as any);
      if (typeof raw === 'string') {
        const s = raw.trim();
        const lowerS = s.toLowerCase();
        if (lowerS === 'titlegroup') return 'titleGroup';
        if (lowerS === 'subgroup') return 'subGroup';
        if (lowerS === 'networknode') return 'networkNode';
        if (lowerS === 'networkcontainer') return 'networkContainer';
        if (lowerS === 'architecturenode') return 'architectureNode';
        if (lowerS === 'flowchart') return 'flowchart';
        if (lowerS === 'swimlane') return 'swimlane';
        if (lowerS === 'mindmap') return 'mindmap';
        if (lowerS === 'sticky-note') return 'sticky-note';
        return s; // 保留原始类型，不要强制转为 custom
      }
      return raw ?? 'custom';
    })();

    /**
     * 函数级注释：域类校验（按类型）
     * 目标：在业务节点类型上强制要求 `domainClass` 存在；容器类节点跳过校验。
     */
    const mustHaveDomainClass = !new Set(['subGroup', 'titleGroup', 'domain', 'networkContainer']).has(String(normalizedType));
    const dcPresent = String((config.domainClass ?? (config.data as any)?.domainClass ?? '')).trim().length > 0;
    if (mustHaveDomainClass && !dcPresent) {
      throw new Error(`节点缺少 domainClass: ${config.id}`);
    }

    // 获取当前配置和主题
    const diagramConfig = diagramConfigManager.getConfig();
    const maxWidthCap = (typeof diagramConfig?.node?.maxWidth === 'number' && isFinite(diagramConfig.node.maxWidth) && diagramConfig.node.maxWidth > 0)
      ? diagramConfig.node.maxWidth
      : 300;
    const currentTheme = {}; // 暂时使用空对象，需要集成增强主题管理器

    // 计算节点尺寸（支持特定域的紧凑化）
    const layoutOptimizer = LayoutOptimizer.getInstance();

    // 读取业务域与域类（domainClass 优先）
    const domainKey: string | undefined = (config as any).domain ?? ((config.data as any)?.domain);
    const domainClass: string | undefined = (config as any).domainClass ?? ((config.data as any)?.domainClass);
    const compactDomains: Record<string, { fontScale: number; widthScale: number; paddingHScale: number; paddingVScale: number }> = {
      strategy: { fontScale: 0.85, widthScale: 0.85, paddingHScale: 0.85, paddingVScale: 0.85 },
      data: { fontScale: 0.85, widthScale: 0.85, paddingHScale: 0.85, paddingVScale: 0.85 },
      interface: { fontScale: 0.85, widthScale: 0.85, paddingHScale: 0.85, paddingVScale: 0.85 },
    };

    const isCompact = domainKey && COMPACT_DOMAINS[String(domainKey)] !== undefined;
    const fontSizeOverride = isCompact
      ? Math.round(diagramConfig.node.font.size * COMPACT_DOMAINS[domainKey].fontScale)
      : diagramConfig.node.font.size;
    // 结合样式预设缩放内边距
    const preset = diagramStyleManager.getPreset();
    const paddingScale = Math.max(0.6, Math.min(1.5, preset?.node?.paddingScale ?? 1));
    const paddingOverride = {
      horizontal: Math.round(((isCompact ? Math.round((diagramConfig.node.padding?.horizontal ?? 14) * COMPACT_DOMAINS[domainKey].paddingHScale) : (diagramConfig.node.padding?.horizontal ?? 14)) * paddingScale)),
      vertical: Math.round(((isCompact ? Math.round((diagramConfig.node.padding?.vertical ?? 10) * COMPACT_DOMAINS[domainKey].paddingVScale) : (diagramConfig.node.padding?.vertical ?? 10)) * paddingScale)),
    };

    const widthScale = isCompact ? COMPACT_DOMAINS[domainKey].widthScale : 1;

    // 形状内边距补尝（函数级注释）
    // - 必须与 CustomNode.tsx 中的 shapePaddingH / shapePaddingV 保持一致
    // - 确保工厂计算的宽高能容纳 CustomNode 强加的形状安全边距，防止文本溢出
    // 函数级注释：形状回撤
    // 说明：统一回撤形状对尺寸的影响，额外内边距归零
    const shape = 'rectangle';
    const shapePaddingH = 0;
    const shapePaddingV = 0;

    // 回撤紧凑型形状特殊处理：统一采用标准矩形布局与尺寸计算
    const isCompactShape = false;
    const isSquareShape = false;

    let calculatedWidth: number;
    let calculatedHeight: number;

    if (precalculatedSize) {
      // 使用预计算结果（补回安全边距），始终基于内容宽度
      calculatedWidth = (precalculatedSize.width + 8);
      calculatedHeight = config.height || precalculatedSize.height;
    } else if (isCompactShape && !config.width && !config.height) {
      // 垂直布局尺寸计算策略（函数级注释）
      // 目标：为紧凑形状（如圆形、菱形）计算适配垂直布局（Icon Top, Text Bottom）的尺寸。
      // 1. 获取纯文本尺寸（去除大部分内边距影响，仅保留文字本身）；
      // 2. 叠加 Icon 高度与间距；
      // 3. 对于圆形/菱形等，强制取宽高的最大值以保持正方形（Aspect Ratio ≈ 1）。

      // 1. 获取纯文本近似宽度（去除 LayoutOptimizer 的默认 minWidth 限制）
      const textWidthRaw = layoutOptimizer.calculateNodeWidthWithOverrides(config.description, {
        fontSize: fontSizeOverride,
        fontFamily: diagramConfig.node.font.family,
        fontWeight: diagramConfig.node.font.weight,
        padding: { horizontal: 0, vertical: 0 }, // 纯文本
        minWidth: 0,
        scale: 1
      });
      // 修正：LayoutOptimizer 返回值包含 8px 安全边距，此处保留作为文本安全区
      const textWidth = textWidthRaw;

      const textHeight = layoutOptimizer.calculateNodeHeightWithOverrides(config.description, {
        fontSize: fontSizeOverride,
        fontFamily: diagramConfig.node.font.family,
        fontWeight: diagramConfig.node.font.weight,
        padding: { horizontal: 0, vertical: 0 },
        minHeight: 0
      });

      // 2. 垂直布局结构尺寸（紧凑形状采用“角标叠加”图标，不占据文本布局空间）
      // 函数级注释：为了最大化圆形/菱形等紧凑形状的文本空间，图标改为绝对定位角标，因此在尺寸计算中不再计入图标高度。
      const iconSize = 0;
      const iconGap = 0;

      // 宽度：取（文本宽度, 图标宽度）最大值 + 内边距 + 形状边距
      const contentWidth = Math.max(iconSize, textWidth);
      calculatedWidth = contentWidth + paddingOverride.horizontal + shapePaddingH;

      // 高度：仅文本 + 内边距 + 形状边距（图标为角标叠加，不参与高度）
      const contentHeight = textHeight;
      calculatedHeight = contentHeight + paddingOverride.vertical + shapePaddingV;

      // 3. 正方形约束
      if (isSquareShape) {
        // 回撤正方形约束
      }
    } else {
      // 始终根据内容动态计算宽度（不使用存储的固定宽度）
      const contentWidth = layoutOptimizer.calculateNodeWidthWithOverrides(config.description, {
        fontSize: fontSizeOverride,
        fontFamily: diagramConfig.node.font.family,
        fontWeight: diagramConfig.node.font.weight,
        padding: {
          horizontal: paddingOverride.horizontal + shapePaddingH,
          vertical: paddingOverride.vertical + shapePaddingV
        },
        minWidth: diagramConfig.node.minWidth,
        maxWidth: maxWidthCap,
        scale: widthScale,
      });
      calculatedWidth = contentWidth;

      calculatedHeight = config.height || layoutOptimizer.calculateNodeHeightWithOverrides(config.description, {
        fontSize: fontSizeOverride,
        fontFamily: diagramConfig.node.font.family,
        fontWeight: diagramConfig.node.font.weight,
        padding: {
          horizontal: paddingOverride.horizontal + shapePaddingH,
          vertical: paddingOverride.vertical + shapePaddingV
        },
        minHeight: diagramConfig.node.height || 60,
      });
    }

    // 添加 NaN 值验证，确保 measured 属性中的数值有效
    // 针对紧凑形状（如圆形、菱形），降低最小宽度限制以避免节点过大导致比例失调
    const defaultMinWidth = isCompactShape ? 60 : (diagramConfig.node.minWidth || 200);

    const safeWidth = (typeof calculatedWidth === 'number' && !isNaN(calculatedWidth) && isFinite(calculatedWidth) && calculatedWidth > 0)
      ? calculatedWidth
      : defaultMinWidth;
    const clampedWidth = Math.max(defaultMinWidth, Math.min(safeWidth, maxWidthCap));
    const safeHeight = (typeof calculatedHeight === 'number' && !isNaN(calculatedHeight) && isFinite(calculatedHeight) && calculatedHeight > 0)
      ? calculatedHeight
      : diagramConfig.node.height || 60;

    // 确定主题
    const theme = diagramTheme;
    if (debugEnabled) {
    }

    // 以 domainClass 优先解析域主题颜色；若缺失则最小回退
    const normalizedDomainKey = resolveThemeDomainKey(theme as any, {
      domainClass,
    } as any);
    const domainThemeColor = getDomainTheme(theme as any, {
      domainClass,
    } as any);
    if (debugEnabled) {
    }

    // 规范化文案字段：统一使用 description（函数级注释）
    // - 优先读取 config.description；其次读取 data.description；最后兜底为节点 id
    // - 不再写入或同步 label，避免与 description 混淆
    const normalizedDescription = (
      typeof config.description === 'string' && config.description.trim().length > 0
        ? config.description
        : (config.data as any)?.description ?? config.id
    );

    // 构建节点数据（并保持传入 data 字段）
    const nodeData: any = {
      id: config.id,
      description: normalizedDescription,
      theme: domainThemeColor, // 传递解析后的域主题颜色
      domain: domainKey,
      domainClass,
      /**
       * 函数级注释：显式透传子域键
       * - 优先使用顶层 `config.subDomain`，其次回退到 `config.data.subDomain`
       * - 这样布局阶段的 applySubGrouping(nodes, whitelist) 能正确读取并生成子域容器
       */
      subDomain: (config as any).subDomain ?? (config.data as any)?.subDomain,
      // 形状字段回撤：不再为普通节点透传 shape
      fontSize: fontSizeOverride,
      padding: paddingOverride,
      metadata: config.metadata,
      ...config.data
    };

    // 基于域为节点应用角色样式与层级（主流程/支撑/数据/接口）
    // 已在上方解析 domainKey
    const themeBorder = domainThemeColor?.border || '#9E9E9E';
    const themeBg =
      domainThemeColor?.background ||
      domainThemeColor?.light ||
      domainThemeColor?.main ||
      '#FFFFFF';


    const roleZIndex = (() => {
      switch (domainKey) {
        case 'core':
          return 50; // 主流程更靠上
        case 'strategy':
          return 30;
        case 'interface':
          return 25;
        case 'data':
          return 20;
        default:
          return 10;
      }
    })();

    const roleStyle: Record<string, any> = (() => {
      const borderStyle = preset?.node?.borderStyle ?? 'solid';
      const borderWidth = preset?.node?.borderWidth ?? 1.5;
      const shadowToken = preset?.node?.shadow ?? 'medium';
      const shadowMap: Record<string, string> = {
        none: 'none',
        soft: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        medium: '0 1px 3px rgba(0,0,0,0.08), 0 4px 14px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)',
        strong: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
      };
      switch (domainKey) {
        case 'core':
          return {
            border: `${borderWidth + 0.5}px ${borderStyle} ${themeBorder}`,
            boxShadow: shadowMap[shadowToken],
          };
        case 'strategy':
          return {
            border: `${borderWidth}px ${borderStyle} ${themeBorder}`,
            boxShadow: shadowMap[shadowToken],
          };
        case 'interface':
          return {
            border: `${borderWidth}px ${borderStyle} ${themeBorder}`,
            boxShadow: shadowMap[shadowToken],
          };
        case 'data':
          return {
            border: `${Math.max(1.5, borderWidth)}px ${borderStyle === 'solid' ? 'dashed' : borderStyle} ${themeBorder}`,
            boxShadow: shadowMap[shadowToken],
          };
        default:
          return {
            border: `${borderWidth}px ${borderStyle} ${themeBorder}`,
            boxShadow: shadowMap[shadowToken],
          };
      }
    })();

    // 将角色样式写入 data.customStyle，并设置层级基准
    nodeData.baseZIndex = roleZIndex;
    nodeData.customStyle = {
      ...(nodeData.customStyle || {}),
      ...roleStyle,
    };

    // 构建节点样式
    const nodeStyle = {
      width: clampedWidth,
      height: safeHeight,
      zIndex: config.zIndex ?? roleZIndex,
      borderRadius: preset?.node?.radius ?? 16,
      backgroundColor: (() => {
        const policy = preset?.node?.backgroundPolicy ?? 'theme';
        if (policy === 'white') return '#FFFFFF';
        return themeBg;
      })(),
      ...config.style
    };

    // 创建节点
    const node: Node<any> = {
      id: config.id,
      type: normalizedType || NodeType.CUSTOM,
      position: config.position,
      data: nodeData,
      style: nodeStyle,
      // 为 MiniMap / 内部渲染提供初始几何尺寸，避免等待 DOM 测量
      width: clampedWidth,
      height: safeHeight,
      // 添加measured属性，确保MiniMap能正确计算viewBox - 使用验证后的安全数值
      measured: {
        width: clampedWidth,
        height: safeHeight
      }
    };

    // 如果有父节点，设置parentId
    if (config.parentId) {
      node.parentId = config.parentId;
    }

    // 锁定节点，禁止移动
    node.draggable = false;
    // 连接点模式（函数级注释）：确保节点可作为 target/source 连接
    // 默认即为 true，显式声明以防默认变更
    node.connectable = true;

    return node;
  }

  /**
   * 创建域群组节点
   */
  createDomainGroup(domain: string, nodesInDomain: Node[], domainTheme: any, options: any): Node {
    const id = `domain-${domain}`;
    const nodeConfig: NodeConfig = {
      id,
      type: NodeType.DOMAIN,
      position: { x: 0, y: 0 },
      description: domain,
      data: {
        label: domain,
        children: nodesInDomain.map(n => n.id),
      },
      theme: domainTheme,
      zIndex: -10,
      draggable: false, // 锁定域，禁止移动
      // 形状字段回撤
    };
    return this.createNode(nodeConfig);
  }

  /**
   * 创建子域群组节点
   */
  createSubDomainGroup(subDomain: string, nodesInSubDomain: Node[], domainTheme: any, options?: { shape?: string }): Node {
    const id = `subdomain-${subDomain}`;
    const nodeConfig: NodeConfig = {
      id,
      type: NodeType.SUB_GROUP,
      position: { x: 0, y: 0 },
      description: subDomain,
      data: {
        label: subDomain,
        children: nodesInSubDomain.map(n => n.id),
      },
      theme: domainTheme,
      zIndex: -5,
      draggable: false, // 锁定子域，禁止移动
      // 形状字段回撤
    };
    return this.createNode(nodeConfig);
  }

  /**
   * 批量创建节点（优化版）
   */
  createNodes(configs: NodeConfig[], diagramTheme?: Theme): Node[] {
    // 1. 分组：根据测量参数（字体、内边距）对节点归类
    const groups = new Map<string, {
      params: any,
      items: { config: NodeConfig, index: number }[]
    }>();

    const diagramConfig = diagramConfigManager.getConfig();
    const preset = diagramStyleManager.getPreset();

    configs.forEach((config, index) => {
      // 不跳过已有宽高的节点 — 始终根据内容重新计算宽度

      const domainKey: string | undefined = (config as any).domain ?? ((config.data as any)?.domain);
      const isCompact = domainKey && COMPACT_DOMAINS[String(domainKey)] !== undefined;
      const fontSizeOverride = isCompact
        ? Math.round(diagramConfig.node.font.size * COMPACT_DOMAINS[domainKey].fontScale)
        : diagramConfig.node.font.size;

      const paddingScale = Math.max(0.6, Math.min(1.5, preset?.node?.paddingScale ?? 1));
      const paddingOverride = {
        horizontal: Math.round(((isCompact ? Math.round((diagramConfig.node.padding?.horizontal ?? 14) * COMPACT_DOMAINS[domainKey].paddingHScale) : (diagramConfig.node.padding?.horizontal ?? 14)) * paddingScale)),
        vertical: Math.round(((isCompact ? Math.round((diagramConfig.node.padding?.vertical ?? 10) * COMPACT_DOMAINS[domainKey].paddingVScale) : (diagramConfig.node.padding?.vertical ?? 10)) * paddingScale)),
      };

      const params = {
        fontSize: fontSizeOverride,
        fontFamily: diagramConfig.node.font.family,
        fontWeight: diagramConfig.node.font.weight,
        padding: paddingOverride
      };

      const key = `${params.fontSize}|${params.fontFamily}|${params.fontWeight}|${params.padding.horizontal}|${params.padding.vertical}`;

      if (!groups.has(key)) {
        groups.set(key, { params, items: [] });
      }
      groups.get(key)!.items.push({ config, index });
    });

    // 2. 批量测量：对每组调用一次 measureMultipleNodes
    const precalculated = new Map<string, { width: number, height: number }>();

    groups.forEach(({ params, items }) => {
      const descriptions = items.map(i => i.config.description || i.config.id);
      const measurements = enhancedTextMeasurement.measureMultipleNodes(descriptions, params);

      items.forEach((item, i) => {
        precalculated.set(item.config.id, measurements[i]);
      });
    });

    // 3. 创建节点：注入预计算结果
    return configs.map(config => {
      const measured = precalculated.get(config.id);
      return this.createNode(config, diagramTheme, measured);
    });
  }

  /**
   * 创建分组节点
   */
  /**
   * 函数级注释：创建子分组(SubGroup)节点
   * - 用于在某一域内包裹一组业务节点（如“运输主流程”）。
   * - 支持注入 domain 字段，便于布局策略按域纳入边界计算，避免溢出。
   */
  createGroupNode(config: {
    id: string;
    label: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    theme?: any; // 暂时使用any类型
    zIndex?: number;
    domain?: string; // 新增：所属域键，用于布局归属
    children?: string[]; // 新增：子组包含的子节点ID，用于布局策略计算包围盒
  }): Node {
    const currentTheme = {}; // 暂时使用空对象
    const theme = config.theme || {};

    // 添加 NaN 值验证，确保 measured 属性中的数值有效
    const safeWidth = (typeof config.size.width === 'number' && !isNaN(config.size.width) && isFinite(config.size.width) && config.size.width > 0)
      ? config.size.width
      : 200;
    const safeHeight = (typeof config.size.height === 'number' && !isNaN(config.size.height) && isFinite(config.size.height) && config.size.height > 0)
      ? config.size.height
      : 100;

    return {
      id: config.id,
      type: NodeType.SUB_GROUP,
      position: config.position,
      style: {
        width: safeWidth,
        height: safeHeight,
        zIndex: config.zIndex || -1
      },
      width: safeWidth,
      height: safeHeight,
      data: {
        label: config.label,
        themeColor: theme.border,
        domain: config.domain,
        // 函数级注释：children用于在布局策略阶段计算子组的边界
        // 通过这些子节点的位置信息求包围盒，严格包含以避免溢出
        children: Array.isArray(config.children) ? config.children : []
      },
      // 添加measured属性 - 使用验证后的安全数值
      measured: {
        width: safeWidth,
        height: safeHeight
      },
      draggable: false // 锁定分组，禁止移动
    };
  }

  /**
   * 创建域节点
   */
  createDomainNode(config: {
    id: string;
    label: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    theme: any; // 暂时使用any类型
    zIndex?: number;
  }): Node {
    // 添加 NaN 值验证，确保 measured 属性中的数值有效
    const safeWidth = (typeof config.size.width === 'number' && !isNaN(config.size.width) && isFinite(config.size.width) && config.size.width > 0)
      ? config.size.width
      : 300;
    const safeHeight = (typeof config.size.height === 'number' && !isNaN(config.size.height) && isFinite(config.size.height) && config.size.height > 0)
      ? config.size.height
      : 200;

    return {
      id: config.id,
      type: NodeType.DOMAIN,
      position: config.position,
      style: {
        width: safeWidth,
        height: safeHeight,
        zIndex: config.zIndex || 1
      },
      width: safeWidth,
      height: safeHeight,
      data: {
        label: config.label,
        theme: config.theme
      },
      // 添加measured属性 - 使用验证后的安全数值
      measured: {
        width: safeWidth,
        height: safeHeight
      },
      draggable: false // 锁定域节点，禁止移动
    };
  }

  /**
   * 根据节点类型创建节点
   */
  createNodeByType(
    type: NodeType,
    id: string,
    position: { x: number; y: number },
    data: any,
    style?: any
  ): Node {
    const config: NodeConfig = {
      id,
      type,
      position,
      description: data.description || id,
      // Provide a fallback domainClass so the guard in createNode doesn't throw.
      // createNodeByType is a generic utility that doesn't operate in domain context.
      domainClass: data.domainClass || 'generic',
      data,
      style
    };

    return this.createNode(config);
  }

  /**
   * 克隆节点
   */
  cloneNode(node: Node, newId?: string, newPosition?: { x: number; y: number }): Node {
    const clonedNode: Node = {
      ...node,
      id: newId || `${node.id}_clone`,
      position: newPosition || { ...node.position }
    };

    return clonedNode;
  }

  /**
   * 更新节点配置
   * 函数级注释：支持位置、文案、主题、样式与数据的增量更新
   * - 当 `description` 更新时：同步 `label`（仅在未显式提供 `updates.label` 且原先无 label 时）
   * - 同步重新计算宽高与 measured，避免 UI 与 MiniMap 几何滞后
   */
  updateNode(node: Node, updates: Partial<NodeConfig>): Node {
    const updatedNode = { ...node };

    if (updates.position) {
      updatedNode.position = updates.position;
    }

    if (updates.description) {
      const nextDesc = updates.description;
      updatedNode.data = {
        ...updatedNode.data,
        description: nextDesc,
      };

      // 重新计算宽高（按内容）
      if (!updates.width || !updates.height) {
        // [N-3] Use singleton instance instead of creating a new LayoutOptimizer on every edit.
        const layoutOptimizer = LayoutOptimizer.getInstance();
        const newWidth = updates.width ?? layoutOptimizer.calculateNodeWidth(nextDesc);
        const newHeight = updates.height ?? layoutOptimizer.calculateNodeHeight(nextDesc);
        updatedNode.style = {
          ...updatedNode.style,
          width: newWidth,
          height: newHeight,
        };
        // 同步节点几何尺寸，确保 MiniMap 能立即渲染
        (updatedNode as any).width = newWidth;
        (updatedNode as any).height = newHeight;
        // 同步 measured，确保 MiniMap 与自适应计算准确
        (updatedNode as any).measured = {
          width: newWidth,
          height: newHeight,
        };
      }
    }

    if (updates.theme) {
      updatedNode.data = {
        ...updatedNode.data,
        theme: updates.theme
      };
    }

    if (updates.style) {
      updatedNode.style = {
        ...updatedNode.style,
        ...updates.style
      };
    }

    if (updates.data) {
      updatedNode.data = {
        ...updatedNode.data,
        ...updates.data
      };
    }

    return updatedNode;
  }

  /**
   * 验证节点配置
   */
  private validateConfig(config: NodeConfig): NodeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必填字段验证
    if (!config.id) {
      errors.push('节点ID不能为空');
    }

    if (!config.description) {
      errors.push('节点描述不能为空');
    }

    if (!config.position) {
      errors.push('节点位置不能为空');
    } else {
      if (typeof config.position.x !== 'number' || typeof config.position.y !== 'number') {
        errors.push('节点位置必须是数字');
      }
    }

    // ID格式验证
    if (config.id && !/^[a-zA-Z0-9_-]+$/.test(config.id)) {
      warnings.push('节点ID建议只包含字母、数字、下划线和连字符');
    }

    // 尺寸验证
    if (config.width && config.width < 50) {
      warnings.push('节点宽度过小，可能影响显示效果');
    }

    if (config.height && config.height < 30) {
      warnings.push('节点高度过小，可能影响显示效果');
    }

    // zIndex验证
    if (config.zIndex && config.zIndex < 0) {
      warnings.push('负的zIndex可能导致节点被其他元素遮挡');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取节点类型的默认配置
   */
  getDefaultConfigForType(type: NodeType): Partial<NodeConfig> {
    const diagramConfig = diagramConfigManager.getConfig();

    const baseConfig = {
      width: diagramConfig.node.minWidth,
      height: diagramConfig.node.height,
      zIndex: 10
    };

    switch (type) {
      case NodeType.CUSTOM:
        return {
          ...baseConfig,
          type: NodeType.CUSTOM
        };

      case NodeType.SUB_GROUP:
        return {
          ...baseConfig,
          type: NodeType.SUB_GROUP,
          zIndex: -1
        };

      case NodeType.DOMAIN:
        return {
          ...baseConfig,
          type: NodeType.DOMAIN,
          zIndex: 1
        };

      case NodeType.INPUT:
        return {
          ...baseConfig,
          type: NodeType.INPUT,
          zIndex: 15
        };

      case NodeType.OUTPUT:
        return {
          ...baseConfig,
          type: NodeType.OUTPUT,
          zIndex: 15
        };

      default:
        return baseConfig;
    }
  }
}

// 导出单例实例
export const nodeFactory = NodeFactory.getInstance();
