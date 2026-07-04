/**
 * 增强版基础架构图组件
 * 集成新的分层配置系统和增强主题管理器
 */

import React, { useMemo, useEffect, useState, useCallback, memo } from 'react';
import { Node, Edge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import BaseReactFlow from '../../shared/BaseReactFlow';
import { useFlowStyles } from '../../../hooks/useFlowStyles';
import CustomNode from '../../custom-nodes/CustomNode';
import TitleGroupNode from '../../custom-nodes/TitleGroupNode';
import SubGroupNode from '../../custom-nodes/SubGroupNode';
import AdvancedCustomEdge from '../../custom-nodes/CustomEdge';
import { DiagramComponentProps } from '../../../types/diagram-components';

// 新的配置和主题系统
import { ConfigIntegration } from '../../../config/ConfigIntegration';
import { validateConfigValue } from '../../../config/ConfigValidation';
import { Theme } from '../../../themes/types/ThemeTypes';
import { ThemePerformanceOptimizer } from '../../../themes/ThemePerformanceOptimizer';
import {
  logEnhancedBaseDiagramConfigLoadFailure,
  logEnhancedBaseDiagramInvalidConfig,
  logEnhancedBaseDiagramPerformanceMetrics,
  logEnhancedBaseDiagramThemeLoadFailure,
} from './enhancedBaseDiagramLogging';

/**
 * 增强版基础架构图组件配置接口
 */
export interface EnhancedBaseDiagramConfig {
  NODE_WIDTH: number;
  NODE_HEIGHT: number;
  SPACING: { H: number; V: number };
  GROUP_PADDING?: number;
  TITLE_BAR_HEIGHT?: number;
  // 新增配置项
  PERFORMANCE_OPTIMIZATION?: boolean;
  THEME_CACHING?: boolean;
  VALIDATION_ENABLED?: boolean;
  AUTO_LAYOUT?: boolean;
}

/**
 * 增强版基础架构图组件属性
 */
export interface EnhancedBaseDiagramProps extends Omit<DiagramComponentProps, 'config'> {
  title?: string;
  config?: Partial<EnhancedBaseDiagramConfig>;
  nodes: Node[];
  edges: Edge[];
  className?: string;
  style?: React.CSSProperties;
  enableSmartEdges?: boolean;
  fitMode?: 'fitWidthTop' | 'fitAll' | 'none';
  pinFit?: boolean;
  fitPadding?: number;
  minZoom?: number;
  maxZoom?: number;
  showMiniMap?: boolean;
  showControls?: boolean;
  backgroundGridColor?: string;
  miniMapStyle?: React.CSSProperties;
  miniMapZoomable?: boolean;
  miniMapPannable?: boolean;
  // 新增属性
  configIntegration?: ConfigIntegration;
  themeId?: string;
  enablePerformanceOptimization?: boolean;
  onConfigChange?: (key: string, value: any) => void;
  onThemeChange?: (theme: Theme) => void;
}

const nodeTypes: any = {
  custom: CustomNode,
  titleGroup: TitleGroupNode,
  subGroup: SubGroupNode,
  system: CustomNode,
  actor: CustomNode,
  process: CustomNode,
  notification: CustomNode,
};

/**
 * 默认配置
 */
const DEFAULT_ENHANCED_CONFIG: EnhancedBaseDiagramConfig = {
  NODE_WIDTH: 200,
  NODE_HEIGHT: 120,
  SPACING: { H: 120, V: 100 },
  GROUP_PADDING: 60,
  TITLE_BAR_HEIGHT: 50,
  PERFORMANCE_OPTIMIZATION: true,
  THEME_CACHING: true,
  VALIDATION_ENABLED: true,
  AUTO_LAYOUT: false,
};

/**
 * 配置管理 Hook
 */
function useEnhancedConfig(
  configIntegration?: ConfigIntegration,
  customConfig?: Partial<EnhancedBaseDiagramConfig>
) {
  const defaultConfig = useMemo(
    () => ({ ...DEFAULT_ENHANCED_CONFIG, ...customConfig }),
    [customConfig]
  );
  const [config, setConfig] = useState<EnhancedBaseDiagramConfig>(defaultConfig);

  useEffect(() => {
    if (!configIntegration) {
      const timer = window.setTimeout(() => setConfig(defaultConfig), 0);
      return () => window.clearTimeout(timer);
    }

    const layeredConfig = configIntegration.getLayeredConfigManager();
    
    // 加载配置
    const loadConfig = async () => {
      try {
        const nodeWidth = layeredConfig.get('diagram.node.width');
        const nodeHeight = layeredConfig.get('diagram.node.height');
        const spacingH = layeredConfig.get('diagram.spacing.horizontal');
        const spacingV = layeredConfig.get('diagram.spacing.vertical');
        const groupPadding = layeredConfig.get('diagram.group.padding');
        const performanceOpt = layeredConfig.get('diagram.performance.enabled');
        const themeCaching = layeredConfig.get('theme.caching.enabled');
        const validation = layeredConfig.get('diagram.validation.enabled');

        setConfig({
          NODE_WIDTH: nodeWidth || DEFAULT_ENHANCED_CONFIG.NODE_WIDTH,
          NODE_HEIGHT: nodeHeight || DEFAULT_ENHANCED_CONFIG.NODE_HEIGHT,
          SPACING: {
            H: spacingH || DEFAULT_ENHANCED_CONFIG.SPACING.H,
            V: spacingV || DEFAULT_ENHANCED_CONFIG.SPACING.V,
          },
          GROUP_PADDING: groupPadding || DEFAULT_ENHANCED_CONFIG.GROUP_PADDING,
          TITLE_BAR_HEIGHT: DEFAULT_ENHANCED_CONFIG.TITLE_BAR_HEIGHT,
          PERFORMANCE_OPTIMIZATION: performanceOpt !== undefined ? performanceOpt : DEFAULT_ENHANCED_CONFIG.PERFORMANCE_OPTIMIZATION,
          THEME_CACHING: themeCaching !== undefined ? themeCaching : DEFAULT_ENHANCED_CONFIG.THEME_CACHING,
          VALIDATION_ENABLED: validation !== undefined ? validation : DEFAULT_ENHANCED_CONFIG.VALIDATION_ENABLED,
          AUTO_LAYOUT: DEFAULT_ENHANCED_CONFIG.AUTO_LAYOUT,
          ...customConfig,
        });
      } catch (error) {
        logEnhancedBaseDiagramConfigLoadFailure(error);
        setConfig(defaultConfig);
      }
    };

    loadConfig();

    // 监听配置变化
    const unsubscribe = layeredConfig.addListener('diagram.*', () => {
      loadConfig();
    });

    return unsubscribe;
  }, [configIntegration, customConfig, defaultConfig]);

  return config;
}

/**
 * 主题管理 Hook
 */
function useEnhancedTheme(
  configIntegration?: ConfigIntegration,
  themeId?: string,
  enablePerformanceOptimization?: boolean
) {
  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
  const performanceOptimizer = useMemo<ThemePerformanceOptimizer | null>(() => {
    if (!configIntegration || !enablePerformanceOptimization) return null;
    return configIntegration.getPerformanceOptimizer() || null;
  }, [configIntegration, enablePerformanceOptimization]);

  useEffect(() => {
    if (!configIntegration) return;

    const themeManager = configIntegration.getThemeManager();
    const optimizer = performanceOptimizer;

    // 加载主题
    const loadTheme = async () => {
      try {
        let theme: Theme | null = null;
        
        if (themeId) {
          theme = themeManager.getCurrentTheme() || null;
        } else {
          theme = themeManager.getCurrentTheme() || null;
        }

        // 应用性能优化（传入 Theme 对象而非内部 diagram）
        if (enablePerformanceOptimization && optimizer && theme && currentTheme) {
          await optimizer.optimizeThemeSwitch(theme, document.documentElement, currentTheme);
        }

        setCurrentTheme(theme || null);
      } catch (error) {
        logEnhancedBaseDiagramThemeLoadFailure(error);
        const fallbackTheme = themeManager.getCurrentTheme();
        setCurrentTheme(fallbackTheme || null);
      }
    };

    loadTheme();

    // 监听主题变化
    const unsubscribe = themeManager.addEventListener((event) => {
      if (event.type === 'theme-changed') {
        setCurrentTheme(event.newTheme || null);
      }
    });

    return unsubscribe;
  }, [configIntegration, themeId, enablePerformanceOptimization, currentTheme, performanceOptimizer]);

  return { currentTheme, performanceOptimizer };
}

/**
 * 增强型基础图表组件，在 BaseDiagramComponent 的基础上增加了布局优化、
 * 使用React.memo优化，避免不必要的重渲染
 */
export const EnhancedBaseDiagramComponent: React.FC<EnhancedBaseDiagramProps> = memo(({
  title,
  config: customConfig,
  nodes,
  edges,
  _edgeMode = 'native',
  className,
  style,
  _miniMapPannable,
  _miniMapZoomable,
  _miniMapStyle,
  configIntegration,
  themeId,
  enablePerformanceOptimization = true,
  onConfigChange: _onConfigChange,
  onThemeChange,
  ...props
}) => {
  const _flowStyles = useFlowStyles();
  
  // 使用增强配置和主题系统
  const config = useEnhancedConfig(configIntegration, customConfig);
  const { currentTheme, performanceOptimizer } = useEnhancedTheme(
    configIntegration,
    themeId,
    enablePerformanceOptimization
  );

  // 受控状态：用于拖拽/选择交互
  const [rfNodes, setRfNodes] = useState<Node[]>(nodes);
  const [rfEdges, setRfEdges] = useState<Edge[]>(edges);

  useEffect(() => { setRfNodes(nodes); }, [nodes]);
  useEffect(() => { setRfEdges(edges); }, [edges]);

  const handleNodesChange = useCallback((changes: import('@xyflow/react').NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleEdgesChange = useCallback((changes: import('@xyflow/react').EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  // 主题变化处理
  useEffect(() => {
    if (currentTheme && onThemeChange) {
      onThemeChange(currentTheme);
    }
  }, [currentTheme, onThemeChange]);

  // 节点类型映射
  // const nodeTypes: NodeTypes = useMemo(() => ({
  //   custom: CustomNode,
  //   titleGroup: TitleGroupNode,
  //   subGroup: SubGroupNode,
  // }), []);

  // 边类型映射
  const edgeTypes = useMemo(() => ({
    advanced: AdvancedCustomEdge,
  }), []);

  // 动态样式计算
  const dynamicStyle = useMemo(() => {
    if (!currentTheme) return style;

    return {
      ...style,
      '--diagram-background': currentTheme.diagram?.canvas?.background || '#ffffff',
      '--diagram-grid-color': currentTheme.diagram?.canvas?.grid?.color || '#e5e5e5',
      '--diagram-text-color': currentTheme.palette?.primary?.text || '#333333',
    } as React.CSSProperties;
  }, [style, currentTheme]);

  // 性能监控
  useEffect(() => {
    if (performanceOptimizer && config.PERFORMANCE_OPTIMIZATION) {
      const metrics = performanceOptimizer.getMetrics();
      logEnhancedBaseDiagramPerformanceMetrics(metrics);
    }
  }, [performanceOptimizer, config.PERFORMANCE_OPTIMIZATION]);

  // 验证配置
  useEffect(() => {
    if (config.VALIDATION_ENABLED && configIntegration) {
      const validation = configIntegration.getValidation();
      if (validation) {
        // 使用validateConfigValue函数进行验证
        const result = validateConfigValue('diagram.config', config);
        if (!result.isValid) {
          logEnhancedBaseDiagramInvalidConfig(config, result.error);
        }
      }
    }
  }, [config, configIntegration]);

  return (
    <div 
      className={`enhanced-base-diagram ${className || ''}`}
      style={dynamicStyle}
    >
      {title && (
        <div className="diagram-title" style={{ 
          fontSize: currentTheme?.typography?.fontSize?.lg || '18px',
          fontWeight: currentTheme?.typography?.fontWeight?.semibold || 600,
          color: currentTheme?.palette?.primary?.text || '#333333',
          marginBottom: '16px',
          textAlign: 'center'
        }}>
          {title}
        </div>
      )}
      
      <BaseReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        {...props}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: currentTheme?.diagram?.canvas?.background || 'transparent',
          ...(style || {}),
        }}
      />

      {/* 性能指标显示（开发模式） */}
      {process.env.NODE_ENV === 'development' && performanceOptimizer && (
        <div className="performance-metrics" style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 1000,
        }}>
          <div>Cache Hit Rate: {(performanceOptimizer.getMetrics().cacheHitRate * 100).toFixed(1)}%</div>
          <div>Memory Usage: {performanceOptimizer.getMetrics().memoryUsage.toFixed(1)}MB</div>
          <div>Last Switch: {performanceOptimizer.getMetrics().totalSwitchTime.toFixed(1)}ms</div>
        </div>
      )}
    </div>
  );
});

EnhancedBaseDiagramComponent.displayName = 'EnhancedBaseDiagramComponent';

export default EnhancedBaseDiagramComponent;
