import { describe, expect, it } from 'vitest';

import { presentMindMapPropertyAIError } from '../mindMapPropertyAIError';

describe('presentMindMapPropertyAIError', () => {
    it('localizes known service boundary errors', () => {
        const translate = (key: string) => `translated:${key}`;
        expect(presentMindMapPropertyAIError(
            '请先在 AI 设置中配置有效的 Provider 和 API Key',
            translate,
        )).toBe('translated:plugins.mindmap.propertyAI.configurationRequired');
        expect(presentMindMapPropertyAIError('请在 AI 设置中选择一个模型', translate))
            .toBe('translated:plugins.mindmap.propertyAI.modelRequired');
    });

    it('preserves bounded provider errors that do not have a known localization key', () => {
        expect(presentMindMapPropertyAIError('request failed safely', key => key))
            .toBe('request failed safely');
    });
});
