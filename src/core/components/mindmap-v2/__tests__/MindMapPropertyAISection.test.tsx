// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MindMapPropertyAISection } from '../MindMapPropertyAISection';
import {
    subscribeMindMapAIConfigRequest,
} from '../mindMapAIConfigEvent';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: { topic?: string; count?: number }) => ({
            'plugins.mindmap.propertyAI.sectionLabel': 'AI 节点操作',
            'plugins.mindmap.propertyAI.suggestionsTitle': 'AI 子主题建议',
            'plugins.mindmap.propertyAI.suggestionsList': '建议的子主题',
            'plugins.mindmap.propertyAI.applying': '添加中…',
            'plugins.mindmap.propertyAI.expand': 'AI 扩展子主题',
            'plugins.mindmap.propertyAI.summarize': 'AI 智能归纳当前节点',
            'plugins.mindmap.propertyAI.openConfiguration': '打开 AI 设置',
            'plugins.mindmap.propertyAI.applySuggestion': `将${values?.topic ?? ''}添加为子主题`,
        }[key] ?? key),
    }),
}));

const renderSection = (overrides: Partial<React.ComponentProps<typeof MindMapPropertyAISection>> = {}) => {
    const props: React.ComponentProps<typeof MindMapPropertyAISection> = {
        applyingTopic: null,
        error: '',
        expanding: false,
        hasChildren: true,
        needsConfiguration: false,
        status: '',
        suggestions: ['风险识别'],
        summarizing: false,
        onApplySuggestion: vi.fn(),
        onDismiss: vi.fn(),
        onExpand: vi.fn(),
        onSummarize: vi.fn(),
        ...overrides,
    };
    render(<MindMapPropertyAISection {...props} />);
    return props;
};

describe('MindMapPropertyAISection', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
    });

    it('exposes the suggestion popover and each suggestion as named native controls', async () => {
        const props = renderSection();
        const expand = screen.getByRole('button', { name: 'AI 扩展子主题' });

        expect(expand.getAttribute('aria-haspopup')).toBe('dialog');
        expect(expand.getAttribute('aria-expanded')).toBe('true');
        expect(expand.getAttribute('aria-controls')).toBeTruthy();

        const suggestion = await screen.findByRole('button', { name: '将风险识别添加为子主题' });
        expect(suggestion.tagName).toBe('BUTTON');
        fireEvent.click(suggestion);
        expect(props.onApplySuggestion).toHaveBeenCalledWith('风险识别');
    });

    it('prevents duplicate suggestion actions while one topic is being applied', async () => {
        renderSection({ applyingTopic: '风险识别', suggestions: ['风险识别', '应急预案'] });

        const first = await screen.findByRole('button', { name: '将风险识别添加为子主题' });
        const second = screen.getByRole('button', { name: '将应急预案添加为子主题' });
        expect(first.hasAttribute('disabled')).toBe(true);
        expect(second.hasAttribute('disabled')).toBe(true);
        expect(first.textContent).toContain('添加中');
    });

    it('announces failures and offers direct recovery for missing AI configuration', async () => {
        const listener = vi.fn();
        const unsubscribe = subscribeMindMapAIConfigRequest(listener);
        renderSection({
            error: '请先配置有效的 AI Provider 和 API Key',
            needsConfiguration: true,
            suggestions: [],
        });

        expect((await screen.findByRole('alert')).textContent).toContain('Provider');
        fireEvent.click(screen.getByRole('button', { name: '打开 AI 设置' }));
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it('keeps progress feedback in a polite live region', () => {
        renderSection({ suggestions: [], status: '已更新节点名称' });
        const status = screen.getByRole('status');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.textContent).toBe('已更新节点名称');
    });
});
