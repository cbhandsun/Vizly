/**
 * useTemplates Hook
 * 模板管理核心Hook，提供模板加载、保存、创建、删除等功能
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { cloneDeep } from 'lodash';
import { DiagramTemplate, TemplateCategory, TemplateFilterOptions, SaveTemplateOptions } from '../types/Template';
import { parseStoredTemplates, serializeStoredTemplates } from '../utils/templateUtils';

const BUILT_IN_TEMPLATES: DiagramTemplate[] = [];

const STORAGE_KEY = 'diagram-custom-templates';
const MAX_CUSTOM_TEMPLATES = 50; // 限制最多50个自定义模板

/**
 * localStorage工具函数
 */
const loadFromStorage = (): DiagramTemplate[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return parseStoredTemplates(data);
    } catch (error) {
        console.error('[useTemplates] Failed to load custom templates:', error);
        return [];
    }
};

const saveToStorage = (templates: DiagramTemplate[]): boolean => {
    try {
        localStorage.setItem(STORAGE_KEY, serializeStoredTemplates(templates));
        return true;
    } catch (error) {
        console.error('[useTemplates] Failed to save custom templates:', error);
        return false;
    }
};

/**
 * 生成唯一ID
 */
const generateTemplateId = (): string => {
    return `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * useTemplates Hook
 */
export const useTemplates = () => {
    const [customTemplates, setCustomTemplates] = useState<DiagramTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    // 所有模板（内置 + 自定义）
    const allTemplates = useMemo<DiagramTemplate[]>(() => {
        return [...BUILT_IN_TEMPLATES, ...customTemplates];
    }, [customTemplates]);

    // 按分类分组
    const templatesByCategory = useMemo<Record<TemplateCategory, DiagramTemplate[]>>(() => {
        const grouped: Record<string, DiagramTemplate[]> = {
            [TemplateCategory.FLOWCHART]: [],
            [TemplateCategory.ARCHITECTURE]: [],
            [TemplateCategory.UML]: [],
            [TemplateCategory.NETWORK]: [],
            [TemplateCategory.MINDMAP]: [],
            [TemplateCategory.CUSTOM]: []
        };

        allTemplates.forEach(template => {
            grouped[template.category].push(template);
        });

        return grouped as Record<TemplateCategory, DiagramTemplate[]>;
    }, [allTemplates]);

    // 初始化：加载自定义模板
    useEffect(() => {
        const loadCustomTemplates = async () => {
            setLoading(true);
            try {
                const templates = loadFromStorage();
                setCustomTemplates(templates);
            } finally {
                setLoading(false);
            }
        };

        loadCustomTemplates();
    }, []);

    /**
     * 从模板创建图表数据（深拷贝）
     */
    const createFromTemplate = useCallback((templateId: string) => {
        const template = allTemplates.find(t => t.id === templateId);
        if (!template) {
            console.warn(`[useTemplates] Template not found: ${templateId}`);
            return null;
        }

        // 深拷贝避免修改原模板
        const clonedData = cloneDeep(template.diagramData);

        // 更新使用次数（仅自定义模板）
        if (!template.isBuiltIn) {
            const updated = customTemplates.map(t =>
                t.id === templateId
                    ? { ...t, usageCount: (t.usageCount || 0) + 1 }
                    : t
            );
            setCustomTemplates(updated);
            saveToStorage(updated);
        }

        return {
            nodes: clonedData.nodes,
            edges: clonedData.edges,
            viewport: clonedData.viewport,
            config: template.config
        };
    }, [allTemplates, customTemplates]);

    /**
     * 保存为自定义模板
     */
    const saveAsTemplate = useCallback((
        options: SaveTemplateOptions,
        nodes: any[],
        edges: any[],
        viewport?: { x: number; y: number; zoom: number },
        config?: any
    ): DiagramTemplate | null => {
        // 检查数量限制
        if (customTemplates.length >= MAX_CUSTOM_TEMPLATES) {
            console.error(`[useTemplates] Maximum ${MAX_CUSTOM_TEMPLATES} custom templates reached`);
            return null;
        }

        // 创建新模板
        const newTemplate: DiagramTemplate = {
            id: generateTemplateId(),
            name: options.name,
            description: options.description || '',
            category: options.category || TemplateCategory.CUSTOM,
            tags: options.tags || [],
            icon: options.icon,
            diagramData: {
                nodes: cloneDeep(nodes),
                edges: cloneDeep(edges),
                viewport: viewport ? { ...viewport } : undefined
            },
            config: config ? { ...config } : undefined,
            isBuiltIn: false,
            author: 'User',
            createdAt: new Date(),
            usageCount: 0
        };

        const updated = [...customTemplates, newTemplate];
        setCustomTemplates(updated);
        const success = saveToStorage(updated);

        return success ? newTemplate : null;
    }, [customTemplates]);

    /**
     * 删除自定义模板
     */
    const deleteTemplate = useCallback((templateId: string): boolean => {
        const template = customTemplates.find(t => t.id === templateId);
        if (!template) {
            console.warn(`[useTemplates] Template not found: ${templateId}`);
            return false;
        }

        if (template.isBuiltIn) {
            console.error('[useTemplates] Cannot delete built-in template');
            return false;
        }

        const updated = customTemplates.filter(t => t.id !== templateId);
        setCustomTemplates(updated);
        return saveToStorage(updated);
    }, [customTemplates]);

    /**
     * 更新自定义模板
     */
    const updateTemplate = useCallback((
        templateId: string,
        updates: Partial<Omit<DiagramTemplate, 'id' | 'isBuiltIn' | 'createdAt'>>
    ): boolean => {
        const template = customTemplates.find(t => t.id === templateId);
        if (!template || template.isBuiltIn) {
            return false;
        }

        const updated = customTemplates.map(t =>
            t.id === templateId
                ? { ...t, ...updates, updatedAt: new Date() }
                : t
        );

        setCustomTemplates(updated);
        return saveToStorage(updated);
    }, [customTemplates]);

    /**
     * 过滤模板
     */
    const filterTemplates = useCallback((options: TemplateFilterOptions): DiagramTemplate[] => {
        let filtered = allTemplates;

        // 按分类过滤
        if (options.category) {
            filtered = filtered.filter(t => t.category === options.category);
        }

        // 按来源过滤
        if (options.builtInOnly) {
            filtered = filtered.filter(t => t.isBuiltIn);
        } else if (options.customOnly) {
            filtered = filtered.filter(t => !t.isBuiltIn);
        }

        // 按关键词搜索
        if (options.searchQuery) {
            const query = options.searchQuery.toLowerCase().trim();
            if (query) {
                filtered = filtered.filter(t =>
                    t.name.toLowerCase().includes(query) ||
                    t.description.toLowerCase().includes(query) ||
                    t.tags.some(tag => tag.toLowerCase().includes(query))
                );
            }
        }

        return filtered;
    }, [allTemplates]);

    /**
     * 根据ID获取模板
     */
    const getTemplateById = useCallback((templateId: string): DiagramTemplate | undefined => {
        return allTemplates.find(t => t.id === templateId);
    }, [allTemplates]);

    /**
     * 清空所有自定义模板（危险操作）
     */
    const clearCustomTemplates = useCallback((): boolean => {
        setCustomTemplates([]);
        return saveToStorage([]);
    }, []);

    return {
        // 状态
        templates: allTemplates,
        customTemplates,
        builtInTemplates: BUILT_IN_TEMPLATES,
        templatesByCategory,
        loading,

        // 操作
        createFromTemplate,
        saveAsTemplate,
        deleteTemplate,
        updateTemplate,
        filterTemplates,
        getTemplateById,
        clearCustomTemplates
    };
};

/**
 * 导出类型
 */
export type UseTemplatesReturn = ReturnType<typeof useTemplates>;
