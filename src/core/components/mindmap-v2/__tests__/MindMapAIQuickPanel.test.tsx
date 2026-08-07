// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapAIQuickPanel } from '../MindMapAIQuickPanel';
import {
    requestMindMapAIConfig,
    subscribeMindMapAIConfigRequest,
} from '../mindMapAIConfigEvent';

const renderPanel = (overrides: Partial<React.ComponentProps<typeof MindMapAIQuickPanel>> = {}) => {
    const props: React.ComponentProps<typeof MindMapAIQuickPanel> = {
        error: '',
        expanding: false,
        suggestions: [],
        hasChildren: false,
        summarizing: false,
        customPrompt: '',
        customLoading: false,
        onApplySuggestion: vi.fn(),
        onSummarize: vi.fn(),
        onCustomPromptChange: vi.fn(),
        onCustomSubmit: vi.fn(),
        onOpenConfig: vi.fn(),
        ...overrides,
    };
    render(<MindMapAIQuickPanel {...props} />);
    return props;
};

describe('MindMapAIQuickPanel', () => {
    it('turns configuration failures into a direct recovery action', () => {
        const props = renderPanel({ error: '请先在 AI 设置中配置有效的 Provider 和 API Key' });
        expect(screen.getByRole('alert').textContent).toContain('Provider');
        fireEvent.click(screen.getByRole('button', { name: '打开 AI 配置' }));
        expect(props.onOpenConfig).toHaveBeenCalledTimes(1);
    });

    it('names the custom prompt and disables execution until input is meaningful', () => {
        renderPanel({ customPrompt: '   ' });
        expect(screen.getByLabelText('自定义 AI 指令')).toBeTruthy();
        expect(screen.getByRole('button', { name: '运行自定义 AI 指令' }).hasAttribute('disabled')).toBe(true);
    });

    it('exposes generated suggestions and summary as touch-sized named controls', () => {
        const props = renderPanel({ suggestions: ['风险识别'], hasChildren: true });
        fireEvent.click(screen.getByRole('button', { name: '风险识别' }));
        fireEvent.click(screen.getByRole('button', { name: 'AI 智能归纳当前节点' }));
        expect(props.onApplySuggestion).toHaveBeenCalledWith('风险识别');
        expect(props.onSummarize).toHaveBeenCalledTimes(1);
    });

    it('dispatches and unsubscribes the shared configuration request', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeMindMapAIConfigRequest(listener);
        requestMindMapAIConfig();
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        requestMindMapAIConfig();
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
