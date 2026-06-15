/**
 * 模板工具函数
 */

import { DiagramTemplate, TemplateCategory } from '../types/Template';

const TEMPLATE_CATEGORIES = new Set<string>(Object.values(TemplateCategory));
const MAX_TEMPLATE_STRING_LENGTH = 4000;
const MAX_TEMPLATE_ID_LENGTH = 120;
const MAX_TEMPLATE_TAGS = 30;
const MAX_TEMPLATE_NODES = 1000;
const MAX_TEMPLATE_EDGES = 2000;
const MAX_STORED_TEMPLATES = 50;
const MAX_STORED_TEMPLATES_JSON_LENGTH = 2 * 1024 * 1024;
const MAX_THUMBNAIL_NODES = 500;
const MAX_THUMBNAIL_EDGES = 1000;
const MAX_COORDINATE_ABS = 1_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
};

const cleanString = (value: unknown, maxLength: number, fallback = ''): string => {
    return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
};

const escapeXmlText = (value: unknown): string => {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

const finiteNumber = (value: unknown, fallback: number): number => {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE_ABS
        ? value
        : fallback;
};

const toDate = (value: unknown): Date | null => {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
};

/**
 * 验证模板数据完整性
 */
export const validateTemplate = (template: any): template is DiagramTemplate => {
    if (!template || typeof template !== 'object') return false;
    if (!template.id || !template.name || !template.category) return false;
    if (!TEMPLATE_CATEGORIES.has(template.category)) return false;
    if (!template.diagramData || !Array.isArray(template.diagramData.nodes)) return false;
    if (!Array.isArray(template.diagramData.edges)) return false;
    return true;
};

export const coerceStoredTemplate = (template: unknown): DiagramTemplate | null => {
    if (!validateTemplate(template)) return null;
    if (template.diagramData.nodes.length > MAX_TEMPLATE_NODES) return null;
    if (template.diagramData.edges.length > MAX_TEMPLATE_EDGES) return null;

    const createdAt = toDate((template as { createdAt?: unknown }).createdAt);
    if (!createdAt) return null;

    const updatedAtValue = (template as { updatedAt?: unknown }).updatedAt;
    const updatedAt = updatedAtValue === undefined ? undefined : toDate(updatedAtValue);
    if (updatedAtValue !== undefined && !updatedAt) return null;

    return {
        ...template,
        id: cleanString(template.id, MAX_TEMPLATE_ID_LENGTH),
        name: cleanString(template.name, MAX_TEMPLATE_STRING_LENGTH),
        description: cleanString(template.description, MAX_TEMPLATE_STRING_LENGTH),
        tags: Array.isArray(template.tags)
            ? template.tags
                .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
                .slice(0, MAX_TEMPLATE_TAGS)
                .map(tag => tag.slice(0, MAX_TEMPLATE_ID_LENGTH))
            : [],
        author: cleanString(template.author, MAX_TEMPLATE_ID_LENGTH) || undefined,
        thumbnail: cleanString(template.thumbnail, MAX_TEMPLATE_STRING_LENGTH) || undefined,
        icon: cleanString(template.icon, MAX_TEMPLATE_ID_LENGTH) || undefined,
        isBuiltIn: Boolean(template.isBuiltIn),
        createdAt,
        updatedAt: updatedAt ?? undefined,
    };
};

export const parseStoredTemplates = (raw: string | null | undefined): DiagramTemplate[] => {
    if (!raw) return [];
    if (raw.length > MAX_STORED_TEMPLATES_JSON_LENGTH) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .slice(0, MAX_STORED_TEMPLATES)
            .map(coerceStoredTemplate)
            .filter((template): template is DiagramTemplate => Boolean(template));
    } catch {
        return [];
    }
};

export const serializeStoredTemplates = (templates: DiagramTemplate[]): string => {
    const normalized = templates
        .slice(0, MAX_STORED_TEMPLATES)
        .map(coerceStoredTemplate)
        .filter((template): template is DiagramTemplate => Boolean(template));

    return JSON.stringify(normalized);
};

/**
 * 生成模板预览缩略图（SVG版）
 * 动态计算包围盒并生成基础样式的 SVG
 */
export const generateTemplateThumbnail = async (
    nodes: any[],
    edges: any[]
): Promise<string | null> => {
    try {
        if (!Array.isArray(nodes) || nodes.length === 0 || !Array.isArray(edges)) return null;

        const safeNodes = nodes
            .slice(0, MAX_THUMBNAIL_NODES)
            .filter((node): node is Record<string, any> => isRecord(node) && isRecord(node.position))
            .map(node => ({
                ...node,
                position: {
                    x: finiteNumber(node.position.x, 0),
                    y: finiteNumber(node.position.y, 0),
                },
                width: finiteNumber(node.width, 150),
                height: finiteNumber(node.height, 50),
            }))
            .filter(node => node.width > 0 && node.height > 0);

        const safeEdges = edges
            .slice(0, MAX_THUMBNAIL_EDGES)
            .filter((edge): edge is Record<string, any> => isRecord(edge));

        if (safeNodes.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        safeNodes.forEach(n => {
            minX = Math.min(minX, n.position.x);
            minY = Math.min(minY, n.position.y);
            maxX = Math.max(maxX, n.position.x + n.width);
            maxY = Math.max(maxY, n.position.y + n.height);
        });

        if (minX === Infinity) return null;

        const padding = 50;
        const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

        // 简单边渲染 (直线两点)
        const lines = safeEdges.map(e => {
            const sourceInfo = safeNodes.find(n => n.id === e.source);
            const targetInfo = safeNodes.find(n => n.id === e.target);
            if (!sourceInfo || !targetInfo) return '';
            
            const sx = sourceInfo.position.x + sourceInfo.width / 2;
            const sy = sourceInfo.position.y + sourceInfo.height / 2;
            const tx = targetInfo.position.x + targetInfo.width / 2;
            const ty = targetInfo.position.y + targetInfo.height / 2;

            return `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#b3b3b3" stroke-width="2"/>`;
        }).join('\n');

        const rects = safeNodes.map(n => `<rect x="${n.position.x}" y="${n.position.y}" width="${n.width}" height="${n.height}" rx="6" fill="#f0f5ff" stroke="#adc6ff" stroke-width="2"/>`).join('\n');
        
        // 为避免复杂的 HTML 标签解析，文本只提取纯文本长度限制
        const texts = safeNodes.map(n => {
            let label = String(n.data?.label || '');
            // 去除换行和HTML标签，简单截断
            label = label.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').substring(0, 20);
            return `<text x="${n.position.x + 15}" y="${n.position.y + 30}" font-family="sans-serif" font-size="14" fill="#000000">${escapeXmlText(label)}</text>`;
        }).join('\n');

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="800" height="600">
            ${lines}
            ${rects}
            ${texts}
        </svg>`;

        // base64 编码支持中文
        const encoded = btoa(unescape(encodeURIComponent(svg)));
        return `data:image/svg+xml;base64,${encoded}`;
    } catch (error) {
        console.error('[templateUtils] Failed to generate thumbnail:', error);
        return null;
    }
};

/**
 * 导出模板为JSON
 */
export const exportTemplateToJSON = (template: DiagramTemplate): string => {
    return JSON.stringify(template, null, 2);
};

/**
 * 从JSON导入模板
 */
export const importTemplateFromJSON = (json: string): DiagramTemplate | null => {
    try {
        if (json.length > 2 * 1024 * 1024) {
            throw new Error('Template JSON is too large');
        }
        const parsed = JSON.parse(json);
        const template = coerceStoredTemplate(parsed);
        if (!template) {
            throw new Error('Invalid template format');
        }
        return template;
    } catch (error) {
        console.error('[templateUtils] Failed to import template:', error);
        return null;
    }
};
