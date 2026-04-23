/**
 * mindmapAIService.ts — AI 扩展分支服务
 *
 * 读取用户配置的 AI Provider（与 AIConfigModal 共用 localStorage 配置），
 * 根据给定节点的主题和路径，生成若干子主题建议。
 */

import { AI_CONFIG_KEY, getAIConfig } from '@/components/ai/AIConfigModal';
import type { NodeObj } from 'mind-elixir';

export interface AIExpandOptions {
    /** 当前节点 */
    node: NodeObj;
    /** 节点在树中的祖先路径（从根到父节点的 topic 数组） */
    ancestorPath?: string[];
    /** 要生成的子主题数量 */
    count?: number;
    /** 额外的上下文说明（整个导图的主题） */
    mapTitle?: string;
}

export interface AIExpandResult {
    topics: string[];
    error?: string;
}

/** 调用用户配置的 AI 接口，生成子主题列表 */
export async function expandNodeWithAI(options: AIExpandOptions): Promise<AIExpandResult> {
    const { node, ancestorPath = [], count = 4, mapTitle } = options;

    const config = getAIConfig();
    const [providerId, modelId] = config.activeModelKey.split(':');
    const provider = config.providers.find(p => p.id === providerId);

    if (!provider || !provider.enabled || !provider.apiKey || !provider.baseUrl) {
        return { topics: [], error: '请先在 AI 设置中配置有效的 Provider 和 API Key' };
    }

    if (!modelId) {
        return { topics: [], error: '请在 AI 设置中选择一个模型' };
    }

    const contextPath = [...ancestorPath, node.topic].join(' > ');

    const prompt = [
        mapTitle ? `思维导图主题：${mapTitle}` : null,
        `当前节点路径：${contextPath}`,
        `请为"${node.topic}"节点生成 ${count} 个子主题。`,
        '要求：',
        '- 每行一个子主题',
        '- 简洁有力，3~8 字为宜',
        '- 不要编号、不要符号前缀',
        '- 与父节点紧密相关',
        '- 彼此互不重叠',
    ].filter(Boolean).join('\n');

    try {
        const response = await fetch(
            `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.apiKey}`,
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个专业的思维导图助手。请根据用户的要求生成简洁、准确的子主题列表，每行一个，不要有其他内容。',
                        },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 512,
                    temperature: 0.7,
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            return { topics: [], error: `AI 接口错误 ${response.status}: ${errText.slice(0, 120)}` };
        }

        const data = await response.json();
        const raw: string = data.choices?.[0]?.message?.content ?? '';

        const topics = raw
            .split('\n')
            .map(l => l.replace(/^[-\d.*•·]+\s*/, '').trim())
            .filter(l => l.length > 0 && l.length < 60)
            .slice(0, count + 2); // 多取 2 个，让用户选

        if (topics.length === 0) {
            return { topics: [], error: '模型未返回有效的子主题，请重试' };
        }

        return { topics };
    } catch (e: any) {
        return { topics: [], error: `请求失败：${e?.message ?? String(e)}` };
    }
}

/** 从根节点向下找到目标节点的祖先路径 */
export function getAncestorPath(root: NodeObj, targetId: string): string[] {
    function dfs(node: NodeObj, path: string[]): string[] | null {
        if (node.id === targetId) return path;
        for (const child of node.children ?? []) {
            const result = dfs(child, [...path, node.topic]);
            if (result) return result;
        }
        return null;
    }
    return dfs(root, []) ?? [];
}
