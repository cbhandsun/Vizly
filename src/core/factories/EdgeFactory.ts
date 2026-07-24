import { Edge, MarkerType } from '@xyflow/react';
import { diagramConfigManager } from '../config/DiagramConfig';
import { getConfigIntegration } from '../config/ConfigIntegration';
import { resolveThemeDomainKey } from '../utils/domainKey';
import { diagramStyleManager } from '../components/shared/DiagramStyleManager';
import { EdgeType } from '../types/edgeType';
import {
  normalizeEdgeHandleId,
  ownEdgeConfigRecords,
  validateEdgeConfig
} from './EdgeFactoryBoundary';
import { EdgeStyleType, type EdgeConfig } from './EdgeFactoryTypes';
import type { ThemeColor } from '../themes/types/ThemeTypes';

// Compatibility exports: callers historically imported these from the factory.
export { EdgeType } from '../types/edgeType';
export {
  EdgeStyleType,
  HandleDirection,
  type EdgeConfig,
  type EdgeValidationResult
} from './EdgeFactoryTypes';

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readString = (value: unknown): string | undefined => (
  typeof value === 'string' && value.trim() ? value : undefined
);

const readNativeEdgeLabel = (value: unknown): string | number | undefined => (
  typeof value === 'string' || typeof value === 'number' ? value : undefined
);

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
    const validation = validateEdgeConfig(config);
    if (!validation.isValid) {
      throw new Error(`边缘创建失败: ${validation.errors.join(', ')}`);
    }
    config = ownEdgeConfigRecords(config);

    // 生成ID
    const id = config.id || this.generateEdgeId(config.source, config.target);

    // 获取样式配置（接入主题管理器，按域/边类型动态取色）
    const configData = asRecord(config.data);
    const styleConfig = this.getStyleConfig(
      config.styleType || EdgeStyleType.MAIN,
      {
        sourceDomain: readString(configData.sourceDomain),
        targetDomain: readString(configData.targetDomain),
        sourceDomainClass: readString(configData.sourceDomainClass),
        targetDomainClass: readString(configData.targetDomainClass),
        edgeKind: readString(configData.edgeType) || config.styleType
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
    const fontFamilyToken = theme?.typography?.fontFamily;
    const fontFamilyRecord = asRecord(fontFamilyToken);
    const labelFontFamily = typeof fontFamilyToken === 'string'
      ? fontFamilyToken
      : Array.isArray(fontFamilyRecord.sans)
        ? fontFamilyRecord.sans.filter((font): font is string => typeof font === 'string').join(', ')
        : undefined;
    const strokeColor = String(edgeStyle.stroke || config.strokeColor || '#64748b');

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
      },
      // 为避免视觉上“连线被截断”，默认关闭原生标签背景（即使开启也仅对原生生效）
      labelShowBg: false,
      labelBgPadding: [0, 0],
      labelBgBorderRadius: 0,
      labelBgStyle: { fill: 'transparent' }
    };

    // 设置连接点
    if (config.sourceHandle !== undefined) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      edge.sourceHandle = normalizeEdgeHandleId(config.sourceHandle);
    }
    if (config.targetHandle !== undefined) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      edge.targetHandle = normalizeEdgeHandleId(config.targetHandle);
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
    const markerCfg = cfg?.edge?.markerEnd;
    const presetArrow = (() => {
      try {
        const p = diagramStyleManager.getPreset();
        const t = (config.styleType === EdgeStyleType.DEPENDENCY) ? p?.edges?.dependency : (config.styleType === EdgeStyleType.DATA) ? p?.edges?.data : (config.styleType === EdgeStyleType.SUPPORT) ? p?.edges?.support : p?.edges?.main;
        return t?.arrow;
      } catch { return undefined; }
    })();
    const markerW = typeof presetArrow?.width === 'number' ? presetArrow!.width : (typeof markerCfg?.width === 'number' ? markerCfg.width : 10);
    const markerH = typeof presetArrow?.height === 'number' ? presetArrow!.height : (typeof markerCfg?.height === 'number' ? markerCfg.height : 10);

    // 终点：闭合箭头，强调指向性
    if (config.markerEnd !== false) {
      edge.markerEnd = {
        type: MarkerType.ArrowClosed,
        color: String(presetArrow?.color || edgeStyle.stroke || config.strokeColor || '#64748b'),
        width: markerW,
        height: markerH,
      };
    }
    // 起点：默认关闭；仅当显式设置为 true 时开启
    const enableStartMarker = config.markerStart === true;
    if (enableStartMarker) {
      edge.markerStart = {
        type: MarkerType.ArrowClosed,
        color: String(presetArrow?.color || edgeStyle.stroke || config.strokeColor || '#64748b'),
        width: markerW,
        height: markerH,
      };
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
      ...ownEdgeConfigRecords(edge),
      id: newId || `${edge.id}_clone`
    };
  }

  /**
   * 更新边缘配置
   */
  updateEdge(edge: Edge, updates: Partial<EdgeConfig>): Edge {
    const validation = validateEdgeConfig({
      source: edge.source,
      target: edge.target,
      ...updates
    });
    if (!validation.isValid) {
      throw new Error(`边缘更新失败: ${validation.errors.join(', ')}`);
    }
    updates = ownEdgeConfigRecords(updates);
    const updatedEdge = { ...ownEdgeConfigRecords(edge) };

    if (updates.type) {
      const previousNativeLabel = edge.label;
      updatedEdge.type = updates.type;
      // 同步更新 data.pathType，确保渲染组件识别 smart/native 路径类型
      const newPathType = this.getPathTypeFromEdgeType(updates.type);
      updatedEdge.data = {
        ...updatedEdge.data,
        pathType: newPathType,
      };

      // 为智能边类型注入默认的路径规划参数（若未设置）
      if (
        updates.type === EdgeType.SMART_BEZIER ||
        updates.type === EdgeType.SMART_STRAIGHT ||
        updates.type === EdgeType.SMART_STEP
      ) {
        const defaults = this.getDefaultConfigForType(updates.type);
        const defaultData = defaults.data || {};
        updatedEdge.data = {
          ...defaultData,
          ...updatedEdge.data,
        };
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
        const existingDataLabel = updatedEdge.data?.label;
        if (typeof existingDataLabel === 'undefined' && typeof previousNativeLabel !== 'undefined') {
          updatedEdge.data = {
            ...updatedEdge.data,
            label: previousNativeLabel,
          };
        }
        // 切到智能连线：移除原生 label，避免与自定义标签重复
        updatedEdge.label = undefined;
      } else {
        // 切到原生连线：把 data.label 同步给原生 label
        updatedEdge.label = readNativeEdgeLabel(updatedEdge.data?.label);
      }
    }

    if (updates.styleType) {
      const updatedData = asRecord(updatedEdge.data);
      const styleConfig = this.getStyleConfig(updates.styleType, {
        sourceDomain: readString(updatedData.sourceDomain),
        targetDomain: readString(updatedData.targetDomain),
        edgeKind: readString(updatedData.edgeType) || updates.styleType
      });
      updatedEdge.style = {
        ...updatedEdge.style,
        strokeWidth: updates.strokeWidth || styleConfig.strokeWidth,
        stroke: updates.strokeColor || styleConfig.stroke,
        strokeDasharray: updates.strokeDasharray || styleConfig.strokeDasharray
      };
      // 同步标签颜色为描边色
      updatedEdge.labelStyle = {
        ...updatedEdge.labelStyle,
        color: updatedEdge.style?.stroke
      };
    }

    if (updates.sourceHandle !== undefined) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      updatedEdge.sourceHandle = normalizeEdgeHandleId(updates.sourceHandle);
    }

    if (updates.targetHandle !== undefined) {
      // 规范化把手ID，统一映射到节点实际注册的全称 handle。
      updatedEdge.targetHandle = normalizeEdgeHandleId(updates.targetHandle);
    }

    if (updates.label !== undefined) {
      updatedEdge.data = {
        ...updatedEdge.data,
        label: updates.label
      };
      // 仅当不是智能连线时，同步给 React Flow 的原生 label
      const isSmart = (
        updatedEdge.type === EdgeType.SMART_BEZIER ||
        updatedEdge.type === EdgeType.SMART_STRAIGHT ||
        updatedEdge.type === EdgeType.SMART_STEP
      );
      if (!isSmart) {
        updatedEdge.label = updates.label;
      } else {
        updatedEdge.label = undefined;
      }
      // 始终关闭原生标签背景
      updatedEdge.labelShowBg = false;
      updatedEdge.labelBgStyle = { fill: 'transparent' };
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
        updatedEdge.labelStyle = {
          ...updatedEdge.labelStyle,
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
    const markerCfg = cfg?.edge?.markerEnd;
    const markerW = typeof markerCfg?.width === 'number' ? markerCfg.width : 10;
    const markerH = typeof markerCfg?.height === 'number' ? markerCfg.height : 10;
    if (updatedEdge.markerEnd && typeof updatedEdge.markerEnd !== 'string') {
      updatedEdge.markerEnd = {
        ...updatedEdge.markerEnd,
        width: typeof updatedEdge.markerEnd.width === 'number' ? updatedEdge.markerEnd.width : markerW,
        height: typeof updatedEdge.markerEnd.height === 'number' ? updatedEdge.markerEnd.height : markerH,
      };
    }
    if (updatedEdge.markerStart && typeof updatedEdge.markerStart !== 'string') {
      updatedEdge.markerStart = {
        ...updatedEdge.markerStart,
        width: typeof updatedEdge.markerStart.width === 'number' ? updatedEdge.markerStart.width : markerW,
        height: typeof updatedEdge.markerStart.height === 'number' ? updatedEdge.markerStart.height : markerH,
      };
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
    const preset = (() => { try { return diagramStyleManager.getPreset(); } catch { return undefined; } })();

    const baseConfig = {
      strokeWidth: config.edge.strokeWidth,
      stroke: '#333'
    };

    // 安全获取主题颜色工具
    const pickColor = (tc?: ThemeColor | string): string | undefined => {
      if (!tc) return undefined;
      if (typeof tc === 'string') return tc;
      return tc.border || tc.main || tc.text;
    };

    const getDomainColor = (domainClass?: string, _domain?: string): string | undefined => {
      if (!themeManager) return undefined;
      /**
       * 函数级注释：按域键解析获取主题颜色
       * 使用 resolveThemeDomainKey 将 domainClass/domain 规范化为主题的域键，
       * 再从当前主题的 diagram.domains 中读取颜色对象。
       */
      const theme = themeManager.getCurrentTheme?.();
      const key = resolveThemeDomainKey(theme, { domainClass });
      const tc = theme?.diagram?.domains?.[key];
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
        return { strokeWidth: width, stroke, ...(dash ? { strokeDasharray: dash } : {}) };
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
