/**
 * 模板工具函数
 */

import { DiagramTemplate } from '../types/Template';

/**
 * 验证模板数据完整性
 */
export const validateTemplate = (template: any): template is DiagramTemplate => {
    if (!template || typeof template !== 'object') return false;
    if (!template.id || !template.name || !template.category) return false;
    if (!template.diagramData || !Array.isArray(template.diagramData.nodes)) return false;
    if (!Array.isArray(template.diagramData.edges)) return false;
    return true;
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
        if (!nodes || nodes.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            if (n.position) {
                const w = n.width || 150;
                const h = n.height || 50;
                minX = Math.min(minX, n.position.x);
                minY = Math.min(minY, n.position.y);
                maxX = Math.max(maxX, n.position.x + w);
                maxY = Math.max(maxY, n.position.y + h);
            }
        });

        if (minX === Infinity) return null;

        const padding = 50;
        const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

        // 简单边渲染 (直线两点)
        const lines = edges.map(e => {
            const sourceInfo = nodes.find(n => n.id === e.source);
            const targetInfo = nodes.find(n => n.id === e.target);
            if (!sourceInfo?.position || !targetInfo?.position) return '';
            
            const sx = sourceInfo.position.x + (sourceInfo.width || 150) / 2;
            const sy = sourceInfo.position.y + (sourceInfo.height || 50) / 2;
            const tx = targetInfo.position.x + (targetInfo.width || 150) / 2;
            const ty = targetInfo.position.y + (targetInfo.height || 50) / 2;

            return `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#b3b3b3" stroke-width="2"/>`;
        }).join('\n');

        const rects = nodes.map(n => `<rect x="${n.position.x}" y="${n.position.y}" width="${n.width || 150}" height="${n.height || 50}" rx="6" fill="#f0f5ff" stroke="#adc6ff" stroke-width="2"/>`).join('\n');
        
        // 为避免复杂的 HTML 标签解析，文本只提取纯文本长度限制
        const texts = nodes.map(n => {
            let label = String(n.data?.label || '');
            // 去除换行和HTML标签，简单截断
            label = label.replace(/<[^>]+>/g, '').replace(/\n/g, ' ').substring(0, 20);
            return `<text x="${n.position.x + 15}" y="${n.position.y + 30}" font-family="sans-serif" font-size="14" fill="#000000">${label}</text>`;
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
        const parsed = JSON.parse(json);
        if (!validateTemplate(parsed)) {
            throw new Error('Invalid template format');
        }
        return parsed;
    } catch (error) {
        console.error('[templateUtils] Failed to import template:', error);
        return null;
    }
};
