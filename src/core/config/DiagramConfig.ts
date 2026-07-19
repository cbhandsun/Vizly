/**
 * 图表配置公共入口。
 * 具体职责分别位于类型、默认值、输入边界与状态管理模块。
 */

export type {
  CanvasConfig,
  DiagramConfig,
  DomainConfig,
  EdgeConfig,
  NodeConfig,
  SubDomainConfig
} from './DiagramConfigTypes';
export { defaultConfig } from './DiagramConfigDefaults';
export { DiagramConfigManager, diagramConfigManager } from './DiagramConfigManager';
