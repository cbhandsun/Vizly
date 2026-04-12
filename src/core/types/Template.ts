/**
 * 模板类型定义
 * 用于流程图设计器的模板系统
 */

/**
 * 模板分类
 */
export enum TemplateCategory {
    FLOWCHART = 'flowchart',        // 流程图
    ARCHITECTURE = 'architecture',   // 架构图
    UML = 'uml',                    // UML图
    NETWORK = 'network',            // 网络拓扑图
    MINDMAP = 'mindmap',            // 思维导图
    CUSTOM = 'custom'               // 自定义
}

/**
 * 模板分类标签（国际化支持）
 */
export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, { zh: string; en: string }> = {
    [TemplateCategory.FLOWCHART]: { zh: '流程图', en: 'Flowchart' },
    [TemplateCategory.ARCHITECTURE]: { zh: '架构图', en: 'Architecture' },
    [TemplateCategory.UML]: { zh: 'UML图', en: 'UML Diagram' },
    [TemplateCategory.NETWORK]: { zh: '网络拓扑', en: 'Network' },
    [TemplateCategory.MINDMAP]: { zh: '思维导图', en: 'Mind Map' },
    [TemplateCategory.CUSTOM]: { zh: '自定义', en: 'Custom' }
};

/**
 * 图表模板接口
 */
export interface DiagramTemplate {
    // 基础信息
    id: string;                          // 唯一标识
    name: string;                        // 模板名称
    description: string;                 // 描述
    category: TemplateCategory;          // 分类
    tags: string[];                      // 标签（用于搜索）

    // 视觉信息
    thumbnail?: string;                  // 缩略图URL（可选）
    icon?: string;                       // 图标名称（React Icons）

    // 模板数据
    diagramData: {
        nodes: any[];                    // 节点数据（使用any以兼容不同节点类型）
        edges: any[];                    // 边数据
        viewport?: {                     // 视口位置（可选）
            x: number;
            y: number;
            zoom: number;
        };
    };

    // 配置信息（可选）
    config?: {
        layoutStrategy?: string;         // 默认布局策略
        theme?: string;                  // 默认主题
        stylePreset?: string;            // 默认样式预设
    };

    // 元数据
    isBuiltIn: boolean;                  // 是否内置模板
    author?: string;                     // 作者
    createdAt: Date;                     // 创建时间
    updatedAt?: Date;                    // 更新时间
    usageCount?: number;                 // 使用次数
}

/**
 * 模板过滤选项
 */
export interface TemplateFilterOptions {
    category?: TemplateCategory;         // 按分类过滤
    searchQuery?: string;                // 搜索关键词
    builtInOnly?: boolean;               // 仅显示内置模板
    customOnly?: boolean;                // 仅显示自定义模板
}

/**
 * 保存模板选项
 */
export interface SaveTemplateOptions {
    name: string;                        // 模板名称
    description?: string;                // 描述
    category?: TemplateCategory;         // 分类
    tags?: string[];                     // 标签
    icon?: string;                       // 图标
}
