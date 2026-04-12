// 基础组件
export { BaseDiagramComponent } from './base/BaseDiagramComponent';
export { createLayoutUtils } from './base/DiagramLayoutUtils';
export * from './base';

// 重构后的架构图组件已迁移至 diagrams-app 目录或删除

// 新的智能连线演示组件
export { PerformanceDemo } from './PerformanceDemo';
export { default as SmartEdgeDemoEnhanced } from './SmartEdgeDemoEnhanced';

// 所有架构图组件现在都通过动态导入使用，避免静态导入冲突
// 如需直接引用组件，请从各自的文件路径导入
