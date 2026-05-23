import { Edge, MarkerType } from '@xyflow/react';
import { ReactNode } from 'react';
import { diagramConfigManager } from '../components/config/DiagramConfig';
import { getConfigIntegration } from '../config/ConfigIntegration';
import { resolveThemeDomainKey } from '../utils/domainKey';
import { diagramStyleManager } from '../components/shared/DiagramStyleManager';

/**
 * 边缘类型枚举
 */
export enum EdgeType {
  DEFAULT = 'default',
  STRAIGHT = 'straight',
  STEP = 'step',
  SMOOTHSTEP = 'smoothstep',
  BEZIER = 'bezier',
  SMART_BEZIER = 'smart-bezier',
  SMART_STRAIGHT = 'smart-straight',
  SMART_STEP = 'smart-step',
  ADVANCED_SMART_STEP = 'advanced-smart-step',
  ADVANCED_SMART_BEZIER = 'advanced-smart-bezier',
  ADVANCED_SMART_STRAIGHT = 'advanced-smart-straight',
  ADVANCED_CUSTOM = 'advancedCustomEdge',
  ELK = 'elk' // 添加 ELK 类型
}

/**
 * 边缘样式类型枚举
 */
export enum EdgeStyleType {
  MAIN = 'main',           // 主流程
  DEPENDENCY = 'dependency', // 依赖关系
  DATA = 'data',           // 数据流
  SUPPORT = 'support',     // 支撑关系
  CORE = 'core',           // 核心流程
  CHANNEL = 'channel',     // 渠道
  MIDEND = 'midend',       // 中台
  SCM = 'scm',             // 供应链
  LOGISTICS = 'logistics', // 物流
  CORP = 'corp',           // 企业
  INFRA = 'infra',         // 基础设施
  FEEDBACK = 'feedback',    // 反馈/回流
  CUSTOM = 'custom'      // 自定义样式
}

/**
 * 连接点方向枚举
 */
export enum HandleDirection {
  TOP = 't',
  BOTTOM = 'b',
  LEFT = 'l',
  RIGHT = 'r'
}

/**
 * 边缘创建配置接口
 */
export interface EdgeConfig {
  id?: string;
  source: string;
  target: string;
  type?: EdgeType;
  styleType?: EdgeStyleType;
  // 允许更细粒度的角落把手，如 'r-t' | 'r-b' | 'l-t' | 'l-b'
  // 默认仍支持基础方向 't' | 'b' | 'l' | 'r'
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: ReactNode;
  animated?: boolean;
  strokeWidth?: number;
  strokeColor?: string;
  strokeDasharray?: string;
  /**
   * 是否启用终点箭头标记；默认启用
   * 说明：当值为 false 时，不设置 markerEnd；其他情况根据样式自动设置
   */
  markerEnd?: boolean;
  /**
   * 是否启用起点箭头标记；默认启用
   * 说明：为满足“连线有起止点”的可读性要求，默认在起点也添加箭头标记。
   * 当值为 false 时，不设置 markerStart。
   */
  markerStart?: boolean;
  style?: Record<string, any>;
  data?: Record<string, any>;
}

/**
 * 边缘验证结果接口
 */
export interface EdgeValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 边缘工厂类 - 统一管理边缘的创建和配置
 * 
 * 职责：
 * 1. 标准化边缘创建流程
 * 2. 类型安全检查和验证
 * 3. 自动应用主题和样式
 * 4. 智能连接点配置
 */
export class EdgeFactory {
  private static instance: EdgeFactory;

  /**
   * 获取单例实例
   */
  static getInstance(): EdgeFactory {
    if (!EdgeFactory.instance) {
      EdgeFactory.instance = new EdgeFactory();
    }
    return EdgeFactory.instance;
  }

  /**
   * 创建边缘 - 主要创建方法
   * 函数级注释：
   * - 统一验证与样式配置，保证颜色/线宽与主题联动；
   * - 设置 sourceHandle/targetHandle 以明确连接方向；
   * - 默认仅开启终点箭头 markerEnd；起点箭头 markerStart 默认关闭，需显式开启；
   * - 原生连线同步 React Flow 的 label，智能连线使用自定义渲染避免重复文本。
   */
  createEdge(config: EdgeConfig): Edge {
    // 验证配置
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`边缘创建失败: ${validation.errors.join(', ')}`);
    }

    // 生成ID
    const id = config.id || this.generateEdgeId(config.source, config.target);

    // 获取样式配置（接入主题管理器，按域/边类型动态取色）
    const styleConfig = this.getStyleConfig(
      config.styleType || EdgeStyleType.MAIN,
      {
        sourceDomain: (config.data as any)?.sourceDomain,
        targetDomain: (config.data as any)?.targetDomain,
        sourceDomainClass: (config.data as any)?.sourceDomainClass,
        targetDomainClass: (config.data as any)?.targetDomainClass,
        edgeKind: (config.data as any)?.edgeType || config.styleType
      }
    );

    // 构建边缘样式
    const edgeStyle = {
      strokeWidth: config.strokeWidth || styleConfig.strokeWidth,
      stroke: config.strokeColor || styleConfig.stroke,
      strokeDasharray: config.strokeDasharray || styleConfig.strokeDasharray,
      ...config.style
    };

    // 构建边缘数据
    const edgeData = {
      label: config.label,
      pathType: this.getPathTypeFromEdgeType(config.type || EdgeType.DEFAULT),
      ...config.data
    };

    // 创建边缘
    // 主题信息用于原生边标签样式（确保普通/智能文案一致且不被路径穿过）
    const theme = getConfigIntegration()?.getThemeManager?.()?.getCurrentTheme?.();
    const _labelBg = theme?.diagram?.canvas?.background || '#fff';
    const labelFontSize = theme?.typography?.fontSize?.sm || '0.85rem';
    const labelFontFamily = theme?.typography?.fontFamily;
    const strokeColor = (edgeStyle as any)?.stroke || (config.strokeColor) || '#64748b';

    const finalType = (config.type || EdgeType.DEFAULT);
    const isSmartType = (
      finalType === EdgeType.SMART_BEZIER ||
      finalType === EdgeType.SMART_STRAIGHT ||
      finalType === EdgeType.SMART_STEP
    );

    const edge: Edge = {
      id,
      source: config.source,
      target: config.target,
      type: finalType,
      style: edgeStyle,
      data: edgeData,
      // 同步给 React Flow 的标准 label 字段，保证原生/自定义/智能三类边文本一致
      // 仅原生连线设置 React Flow 的 label；智能连线由自定义渲染器绘制，避免重复
      label: isSmartType ? undefined : config.label,
      // 原生边的标签样式（对智能边无副作用）
      labelStyle: {
        ...(labelFontFamily ? { fontFamily: labelFontFamily } : {}),
        fontSize: labelFontSize,
        color: strokeColor
      } as any,
      // 为避免视觉上“连线被截断”，默认关闭原生标签背景（即使开启也仅对原生生效）
      labelShowBg: false,
      labelBgPadding: [0, 0] as any,
      labelBgBorderRadius: 0,
      labelBgStyle: { fill: 'transparent' }
    };

    // 设置连接点
    if (config.sourceHandle !== undefined) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      edge.sourceHandle = this.normalizeHandleId(config.sourceHandle);
    }
    if (config.targetHandle !== undefined) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      edge.targetHandle = this.normalizeHandleId(config.targetHandle);
    }

    // 设置动画
    if (config.animated) {
      edge.animated = true;
    }

    // 设置箭头标记（终点优先）
    // 函数级注释：
    // - 读取 DiagramConfig.edge.markerEnd 中的宽高，统一箭头尺寸，提升可见性；
    // - 默认仅设置终点箭头，以减少路径视觉干扰；
    // - 起点箭头需显式通过 config.markerStart === true 开启。
    const cfg = diagramConfigManager.getConfig();
    const markerCfg = (cfg?.edge as any)?.markerEnd;
    const presetArrow = (() => {
      try {
        const p = diagramStyleManager.getPreset();
        const t = (config.styleType === EdgeStyleType.DEPENDENCY) ? p?.edges?.dependency : (config.styleType === EdgeStyleType.DATA) ? p?.edges?.data : (config.styleType === EdgeStyleType.SUPPORT) ? p?.edges?.support : p?.edges?.main;
        return t?.arrow;
      } catch { return undefined as any; }
    })();
    const markerW = typeof presetArrow?.width === 'number' ? presetArrow!.width : (typeof markerCfg?.width === 'number' ? markerCfg.width : 10);
    const markerH = typeof presetArrow?.height === 'number' ? presetArrow!.height : (typeof markerCfg?.height === 'number' ? markerCfg.height : 10);

    // 终点：闭合箭头，强调指向性
    if (config.markerEnd !== false) {
      edge.markerEnd = {
        type: MarkerType.ArrowClosed,
        color: (presetArrow?.color || (edgeStyle as any)?.stroke || (config.strokeColor) || '#64748b'),
        width: markerW,
        height: markerH,
      } as any;
    }
    // 起点：默认关闭；仅当显式设置为 true 时开启
    const enableStartMarker = config.markerStart === true;
    if (enableStartMarker) {
      (edge as any).markerStart = {
        type: MarkerType.ArrowClosed,
        color: (presetArrow?.color || (edgeStyle as any)?.stroke || (config.strokeColor) || '#64748b'),
        width: markerW,
        height: markerH,
      } as any;
    }

    return edge;
  }

  /**
   * 批量创建边缘
   */
  createEdges(configs: EdgeConfig[]): Edge[] {
    return configs.map(config => this.createEdge(config));
  }

  /**
   * 创建主流程边缘
   */
  createMainFlowEdge(
    source: string,
    target: string,
    label?: string,
    options?: Partial<EdgeConfig>
  ): Edge {
    return this.createEdge({
      source,
      target,
      // 函数级注释：主流程默认使用智能阶梯路径，保证箭头水平/垂直对齐
      type: EdgeType.SMART_STEP,
      styleType: EdgeStyleType.MAIN,
      animated: true,
      label,
      ...options
    });
  }

  /**
   * 创建依赖关系边缘
   */
  createDependencyEdge(
    source: string,
    target: string,
    label?: string,
    options?: Partial<EdgeConfig>
  ): Edge {
    return this.createEdge({
      source,
      target,
      styleType: EdgeStyleType.DEPENDENCY,
      label,
      ...options
    });
  }

  /**
   * 创建数据流边缘
   */
  createDataFlowEdge(
    source: string,
    target: string,
    label?: string,
    options?: Partial<EdgeConfig>
  ): Edge {
    return this.createEdge({
      source,
      target,
      styleType: EdgeStyleType.DATA,
      label,
      ...options
    });
  }

  /**
   * 创建智能边缘（自动避障）
   */
  createSmartEdge(
    source: string,
    target: string,
    edgeType: EdgeType = EdgeType.SMART_BEZIER,
    options?: Partial<EdgeConfig>
  ): Edge {
    return this.createEdge({
      source,
      target,
      type: edgeType,
      data: {
        routingStrategy: 'interior-first',
        pathOptions: { gridRatio: 1.2 },
        // 函数级注释：增大避障 padding，减少路径贴近节点造成箭头“歪斜”的视觉问题
        obstaclePadding: (() => { try { return diagramConfigManager.getConfig()?.edge?.obstaclePadding ?? 48; } catch { return 48; } })()
      },
      ...options
    });
  }

  /**
   * 创建连续流程边缘
   */
  createSequentialEdges(
    nodeIds: string[],
    styleType: EdgeStyleType = EdgeStyleType.MAIN,
    options?: Partial<EdgeConfig>
  ): Edge[] {
    const edges: Edge[] = [];

    for (let i = 0; i < nodeIds.length - 1; i++) {
      edges.push(this.createEdge({
        source: nodeIds[i],
        target: nodeIds[i + 1],
        styleType,
        ...options
      }));
    }

    return edges;
  }

  /**
   * 创建域内连接边缘
   */
  createDomainInternalEdges(
    domain: string,
    nodeIds: string[],
    styleType: EdgeStyleType = EdgeStyleType.DEPENDENCY,
    options?: Partial<EdgeConfig>
  ): Edge[] {
    const edges: Edge[] = [];

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        edges.push(this.createEdge({
          source: `${domain}-${nodeIds[i]}`,
          target: `${domain}-${nodeIds[j]}`,
          styleType,
          ...options
        }));
      }
    }

    return edges;
  }

  /**
   * 创建多对多连接边缘
   */
  createManyToManyEdges(
    sourceIds: string[],
    targetIds: string[],
    styleType: EdgeStyleType = EdgeStyleType.DATA,
    options?: Partial<EdgeConfig>
  ): Edge[] {
    const edges: Edge[] = [];

    for (const sourceId of sourceIds) {
      for (const targetId of targetIds) {
        edges.push(this.createEdge({
          source: sourceId,
          target: targetId,
          styleType,
          ...options
        }));
      }
    }

    return edges;
  }

  /**
   * 克隆边缘
   */
  cloneEdge(edge: Edge, newId?: string): Edge {
    return {
      ...edge,
      id: newId || `${edge.id}_clone`
    };
  }

  /**
   * 更新边缘配置
   */
  updateEdge(edge: Edge, updates: Partial<EdgeConfig>): Edge {
    const updatedEdge = { ...edge };

    if (updates.type) {
      const previousNativeLabel = (edge as any)?.label;
      updatedEdge.type = updates.type;
      // 同步更新 data.pathType，确保渲染组件识别 smart/native 路径类型
      const newPathType = this.getPathTypeFromEdgeType(updates.type);
      updatedEdge.data = {
        ...updatedEdge.data,
        pathType: newPathType,
      } as any;

      // 为智能边类型注入默认的路径规划参数（若未设置）
      if (
        updates.type === EdgeType.SMART_BEZIER ||
        updates.type === EdgeType.SMART_STRAIGHT ||
        updates.type === EdgeType.SMART_STEP
      ) {
        const defaults = this.getDefaultConfigForType(updates.type);
        const defaultData = (defaults as any)?.data || {};
        updatedEdge.data = {
          ...defaultData,
          ...updatedEdge.data,
        } as any;
      }

      // 类型切换时，同步处理 React Flow 的 label：
      const nowSmart = (
        updatedEdge.type === EdgeType.SMART_BEZIER ||
        updatedEdge.type === EdgeType.SMART_STRAIGHT ||
        updatedEdge.type === EdgeType.SMART_STEP ||
        updatedEdge.type === EdgeType.ADVANCED_SMART_BEZIER ||
        updatedEdge.type === EdgeType.ADVANCED_SMART_STRAIGHT ||
        updatedEdge.type === EdgeType.ADVANCED_SMART_STEP
      );
      if (nowSmart) {
        const existingDataLabel = (updatedEdge as any)?.data?.label;
        if (typeof existingDataLabel === 'undefined' && typeof previousNativeLabel !== 'undefined') {
          updatedEdge.data = {
            ...(updatedEdge.data as any),
            label: previousNativeLabel,
          } as any;
        }
        // 切到智能连线：移除原生 label，避免与自定义标签重复
        (updatedEdge as any).label = undefined;
      } else {
        // 切到原生连线：把 data.label 同步给原生 label
        const text = (updatedEdge as any)?.data?.label;
        if (typeof text !== 'undefined') {
          (updatedEdge as any).label = text as any;
        }
      }
    }

    if (updates.styleType) {
      const styleConfig = this.getStyleConfig(updates.styleType, {
        sourceDomain: (updatedEdge.data as any)?.sourceDomain,
        targetDomain: (updatedEdge.data as any)?.targetDomain,
        edgeKind: (updatedEdge.data as any)?.edgeType || updates.styleType
      });
      updatedEdge.style = {
        ...updatedEdge.style,
        strokeWidth: updates.strokeWidth || styleConfig.strokeWidth,
        stroke: updates.strokeColor || styleConfig.stroke,
        strokeDasharray: updates.strokeDasharray || styleConfig.strokeDasharray
      };
      // 同步标签颜色为描边色
      (updatedEdge as any).labelStyle = {
        ...((updatedEdge as any).labelStyle || {}),
        color: (updatedEdge.style as any)?.stroke
      };
    }

    if (updates.sourceHandle) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      (updatedEdge as any).sourceHandle = this.normalizeHandleId(updates.sourceHandle);
    }

    if (updates.targetHandle) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      (updatedEdge as any).targetHandle = this.normalizeHandleId(updates.targetHandle);
    }

    if (updates.label !== undefined) {
      updatedEdge.data = {
        ...updatedEdge.data,
        label: updates.label
      } as any;
      // 仅当不是智能连线时，同步给 React Flow 的原生 label
      const isSmart = (
        updatedEdge.type === EdgeType.SMART_BEZIER ||
        updatedEdge.type === EdgeType.SMART_STRAIGHT ||
        updatedEdge.type === EdgeType.SMART_STEP
      );
      if (!isSmart) {
        (updatedEdge as any).label = updates.label as any;
      } else {
        (updatedEdge as any).label = undefined;
      }
      // 始终关闭原生标签背景
      (updatedEdge as any).labelShowBg = false;
      (updatedEdge as any).labelBgStyle = { fill: 'transparent' } as any;
    }

    if (updates.animated !== undefined) {
      updatedEdge.animated = updates.animated;
    }

    if (updates.style) {
      updatedEdge.style = {
        ...updatedEdge.style,
        ...updates.style
      };
    }

    // 独立更新描边颜色/宽度/虚线
    if (updates.strokeColor || updates.strokeWidth || updates.strokeDasharray) {
      updatedEdge.style = {
        ...updatedEdge.style,
        ...(updates.strokeColor ? { stroke: updates.strokeColor } : {}),
        ...(updates.strokeWidth ? { strokeWidth: updates.strokeWidth } : {}),
        ...(updates.strokeDasharray ? { strokeDasharray: updates.strokeDasharray } : {})
      };
      if (updates.strokeColor) {
        (updatedEdge as any).labelStyle = {
          ...((updatedEdge as any).labelStyle || {}),
          color: updates.strokeColor
        };
      }
    }

    if (updates.data) {
      updatedEdge.data = {
        ...updatedEdge.data,
        ...updates.data
      };
    }

    // 兜底：若存在 markerEnd/markerStart，但未设置宽高，则补齐为全局配置尺寸
    // 函数级注释：
    // - 某些页面可能直接覆写 markerEnd 仅设置 color；这里保证宽高统一
    const cfg = diagramConfigManager.getConfig();
    const markerCfg = (cfg?.edge as any)?.markerEnd;
    const markerW = typeof markerCfg?.width === 'number' ? markerCfg.width : 10;
    const markerH = typeof markerCfg?.height === 'number' ? markerCfg.height : 10;
    if ((updatedEdge as any).markerEnd) {
      const me: any = (updatedEdge as any).markerEnd;
      if (typeof me.width !== 'number') me.width = markerW;
      if (typeof me.height !== 'number') me.height = markerH;
    }
    if ((updatedEdge as any).markerStart) {
      const ms: any = (updatedEdge as any).markerStart;
      if (typeof ms.width !== 'number') ms.width = markerW;
      if (typeof ms.height !== 'number') ms.height = markerH;
    }

    return updatedEdge;
  }

  /**
   * 生成边缘ID
   */
  private generateEdgeId(source: string, target: string): string {
    return `${source}-${target}`;
  }

  /**
   * 获取样式配置
   */
  /**
   * 获取样式配置（域类优先）
   * 函数级注释：
   * - 优先使用 source/target 的 domainClass 解析主题颜色；若缺失则回退到 domain。
   * - 通过主题管理器统一解析域键，避免别名与细分域导致的取色不一致。
   */
  private getStyleConfig(styleType: EdgeStyleType, context?: { sourceDomain?: string; targetDomain?: string; sourceDomainClass?: string; targetDomainClass?: string; edgeKind?: string }): {
    strokeWidth: number;
    stroke: string;
    strokeDasharray?: string;
  } {
    const config = diagramConfigManager.getConfig();
    const integration = getConfigIntegration();
    const themeManager = integration?.getThemeManager();
    const preset = (() => { try { return diagramStyleManager.getPreset(); } catch { return undefined as any; } })();

    const baseConfig = {
      strokeWidth: config.edge.strokeWidth,
      stroke: '#333'
    };

    // 安全获取主题颜色工具
    const pickColor = (tc?: any): string | undefined => {
      if (!tc) return undefined;
      return tc.stroke || tc.border || tc.main || tc.text;
    };

    const getDomainColor = (domainClass?: string, domain?: string): string | undefined => {
      if (!themeManager) return undefined;
      /**
       * 函数级注释：按域键解析获取主题颜色
       * 使用 resolveThemeDomainKey 将 domainClass/domain 规范化为主题的域键，
       * 再从当前主题的 diagram.domains 中读取颜色对象。
       */
      const theme = themeManager.getCurrentTheme?.();
      const key = resolveThemeDomainKey(theme as any, { domainClass });
      const tc = (theme?.diagram?.domains || {})[key] as any;
      return pickColor(tc);
    };

    const getEdgeThemeColor = (key: 'default' | 'primary' | 'secondary' | 'dashed'): string | undefined => {
      if (!themeManager) return undefined;
      const themeId = themeManager.getCurrentThemeId();
      const tc = themeManager.getEdgeColor(themeId, key);
      return pickColor(tc);
    };

    const sDomain = context?.sourceDomain;
    const tDomain = context?.targetDomain;
    const sDomainClass = context?.sourceDomainClass;
    const tDomainClass = context?.targetDomainClass;
    const sourceColor = getDomainColor(sDomainClass, sDomain);
    const targetColor = getDomainColor(tDomainClass, tDomain);

    switch (styleType) {
      case EdgeStyleType.MAIN: {
        const token = preset?.edges?.main;
        const stroke = token?.color || sourceColor || getEdgeThemeColor('primary') || '#FF5722';
        const width = typeof token?.width === 'number' ? token.width : 3;
        const dash = token?.dash;
        return { strokeWidth: width, stroke, ...(dash ? { strokeDasharray: dash } : {}) } as any;
      }
      case EdgeStyleType.DEPENDENCY: {
        const token = preset?.edges?.dependency;
        const stroke = token?.color || getEdgeThemeColor('dashed') || getEdgeThemeColor('secondary') || '#78909C';
        const width = typeof token?.width === 'number' ? token.width : 2;
        const dash = token?.dash ?? '5 5';
        return { strokeWidth: width, stroke, strokeDasharray: dash };
      }
      case EdgeStyleType.DATA: {
        const token = preset?.edges?.data;
        const stroke = token?.color || getEdgeThemeColor('secondary') || sourceColor || '#47CACC';
        const width = typeof token?.width === 'number' ? token.width : 2;
        const dash = token?.dash ?? '6 4';
        return { strokeWidth: width, stroke, strokeDasharray: dash };
      }
      case EdgeStyleType.SUPPORT: {
        const token = preset?.edges?.support;
        const stroke = token?.color || getEdgeThemeColor('default') || targetColor || '#B0BEC5';
        const width = typeof token?.width === 'number' ? token.width : 1.5;
        const dash = token?.dash ?? '3 3';
        return { strokeWidth: width, stroke, strokeDasharray: dash };
      }
      case EdgeStyleType.CORE: {
        const token = preset?.edges?.main;
        const stroke = token?.color || sourceColor || targetColor || getEdgeThemeColor('primary') || '#4CAF50';
        const width = typeof token?.width === 'number' ? token.width : 3;
        return { strokeWidth: width, stroke };
      }
      case EdgeStyleType.FEEDBACK: {
        const token = preset?.edges?.status || preset?.edges?.dependency;
        const stroke = token?.color || getEdgeThemeColor('dashed') || getEdgeThemeColor('secondary') || '#7E57C2';
        const width = typeof token?.width === 'number' ? token.width : 2;
        const dash = token?.dash ?? '4 2';
        return { strokeWidth: width, stroke, strokeDasharray: dash };
      }
      default:
        return baseConfig;
    }
  }

  /**
   * 从边缘类型获取路径类型
   */
  private getPathTypeFromEdgeType(edgeType: EdgeType): string {
    switch (edgeType) {
      case EdgeType.SMART_STEP:
      case EdgeType.ADVANCED_SMART_STEP:
        return 'smart-step';
      case EdgeType.SMART_BEZIER:
      case EdgeType.ADVANCED_SMART_BEZIER:
        return 'smart-bezier';
      case EdgeType.SMART_STRAIGHT:
      case EdgeType.ADVANCED_SMART_STRAIGHT:
        return 'smart-straight';
      case EdgeType.STRAIGHT:
        return 'straight';
      case EdgeType.STEP:
        return 'step';
      case EdgeType.SMOOTHSTEP:
        return 'smoothstep';
      case EdgeType.BEZIER:
        return 'bezier';
      default:
        return 'bezier';
    }
  }

  /**
   * 验证边缘配置
   */
  private validateConfig(config: EdgeConfig): EdgeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必填字段验证
    if (!config.source) {
      errors.push('源节点ID不能为空');
    }

    if (!config.target) {
      errors.push('目标节点ID不能为空');
    }

    // 自环检查
    if (config.source === config.target) {
      warnings.push('检测到自环连接，可能不是预期行为');
    }

    // ID格式验证
    if (config.id && !/^[a-zA-Z0-9_-]+$/.test(config.id)) {
      warnings.push('边缘ID建议只包含字母、数字、下划线和连字符');
    }

    // 样式验证
    if (config.strokeWidth !== undefined && config.strokeWidth <= 0) {
      errors.push('线条宽度必须大于0');
    }

    if (config.strokeColor && !/^#[0-9A-Fa-f]{6}$/.test(config.strokeColor)) {
      warnings.push('颜色格式建议使用十六进制格式（如 #FF0000）');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 规范化把手ID
   * 函数级注释：
   * - 输入可为 'top'/'bottom'/'left'/'right'、't'/'b'/'l'/'r'、以及复合形式如 'right-top'/'rt'；
   * - 输出统一为自定义节点实际注册的把手ID：'top' | 'bottom' | 'left' | 'right'；
   * - 若无法解析，返回 null，让渲染组件按默认策略处理（通常居中或节点默认把手）。
   */
  private normalizeHandleId(handle: string | null | undefined): string | null {
    if (handle === null || typeof handle === 'undefined') return handle ?? null;
    const raw = String(handle).trim().toLowerCase();

    // 明确定义映射表，覆盖常见同义词
    const map: Record<string, string> = {
      // 上
      t: 'top', top: 'top', up: 'top', north: 'top', upper: 'top',
      // 下
      b: 'bottom', bottom: 'bottom', down: 'bottom', south: 'bottom', lower: 'bottom',
      // 左
      l: 'left', left: 'left', west: 'left',
      // 右
      r: 'right', right: 'right', east: 'right'
    };

    if (map[raw]) return map[raw];

    // 支持复合把手形式：'right-top', 'r-t', 'rt', 'tr' 等
    const tokens = raw.split(/[-_\s]/g).filter(Boolean);
    for (const tk of tokens) {
      if (map[tk]) return map[tk];
    }

    // 压缩字符形式：仅保留字母并尝试两字符，例如 'rt'/'tr' 等
    const compact = raw.replace(/[^a-z]/g, '');
    if (compact.length === 2) {
      if (map[compact[0]]) return map[compact[0]];
      if (map[compact[1]]) return map[compact[1]];
    }

    // 无法识别则返回 null
    return null;
  }

  /**
   * 获取边缘类型的默认配置
   */
  getDefaultConfigForType(type: EdgeType): Partial<EdgeConfig> {
    const config = diagramConfigManager.getConfig();

    const baseConfig = {
      type,
      strokeWidth: config.edge.strokeWidth,
      markerEnd: true
    };

    switch (type) {
      case EdgeType.SMART_BEZIER:
      case EdgeType.SMART_STRAIGHT:
      case EdgeType.SMART_STEP:
        return {
          ...baseConfig,
          data: {
            routingStrategy: 'interior-first',
            pathOptions: { gridRatio: 0.9, avoidOverlap: true },
            // 函数级注释：统一提升智能边的 nodePadding，减少与节点的贴边现象
            obstaclePadding: (() => { try { return diagramConfigManager.getConfig()?.edge?.obstaclePadding ?? 48; } catch { return 48; } })()
          }
        };

      default:
        return baseConfig;
    }
  }
}

// 导出单例实例
export const edgeFactory = EdgeFactory.getInstance();
