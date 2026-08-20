import { describe, expect, it } from 'vitest';
import { getMindMapAIPanelErrorKey } from '../mindMapAIPanelError';

describe('getMindMapAIPanelErrorKey', () => {
    it.each([
        ['请先在 AI 设置中配置有效的 Provider 和 API Key', 'configurationRequired'],
        ['请在 AI 设置中选择一个模型', 'modelRequired'],
        ['模型未返回有效的子主题，请重试', 'invalidSuggestions'],
        ['AI 未返回可用的任务分类结果', 'invalidTaskPlan'],
    ] as const)('maps a known service boundary error to %s', (error, key) => {
        expect(getMindMapAIPanelErrorKey(error)).toBe(key);
        expect(getMindMapAIPanelErrorKey(`  ${error}  `)).toBe(key);
    });

    it.each([undefined, null, '', {}, [], 'provider secret must not surface'])(
        'returns a safe generic key for unknown provider output',
        error => {
            expect(getMindMapAIPanelErrorKey(error)).toBe('requestFailed');
        },
    );
});
