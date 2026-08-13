// @vitest-environment jsdom

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import MindMapBatchBar from '../MindMapBatchBar';
import { MindMapPropertyAISection } from '../MindMapPropertyAISection';
import { MindMapPropertyMediaControls } from '../MindMapPropertyMediaControls';
import { MindMapNoteEditorPanel } from '../MindMapNoteEditorPanel';

const mindHarness = vi.hoisted(() => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    return {
        listeners,
        addListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener);
        }),
        removeListener: vi.fn(),
    };
});

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        bus: {
            addListener: mindHarness.addListener,
            removeListener: mindHarness.removeListener,
        },
        expandNode: vi.fn(),
        findEle: vi.fn(),
        removeNodes: vi.fn(),
        reshapeNode: vi.fn(),
    }),
}));

let testI18n: i18n;

beforeAll(async () => {
    testI18n = i18next.createInstance();
    await testI18n.use(initReactI18next).init({
        lng: 'en',
        fallbackLng: 'en',
        resources: {
            en: { translation: en },
            zh: { translation: zh },
        },
        interpolation: { escapeValue: false },
    });
});

const renderLocalized = async (language: 'en' | 'zh') => {
    const mediaProps: React.ComponentProps<typeof MindMapPropertyMediaControls> = {
        icons: [],
        imageUrl: '',
        onIconToggle: vi.fn(),
        onImageChange: vi.fn(),
        onImageUrlCommit: vi.fn(() => true),
        onImageUrlInput: vi.fn(),
    };
    const aiProps: React.ComponentProps<typeof MindMapPropertyAISection> = {
        applyingTopic: null,
        error: '',
        expanding: false,
        hasChildren: false,
        needsConfiguration: false,
        status: '',
        suggestions: [],
        summarizing: false,
        onApplySuggestion: vi.fn(),
        onDismiss: vi.fn(),
        onExpand: vi.fn(),
        onSummarize: vi.fn(),
    };
    await act(async () => {
        await testI18n.changeLanguage(language);
    });
    render(
        <I18nextProvider i18n={testI18n}>
            <MindMapBatchBar />
            <MindMapPropertyAISection {...aiProps} />
            <MindMapPropertyMediaControls {...mediaProps} />
            <MindMapNoteEditorPanel
                onCancel={vi.fn()}
                onClear={vi.fn()}
                onSave={vi.fn()}
            />
        </I18nextProvider>,
    );
    act(() => {
        mindHarness.listeners.get('selectNodes')?.([
            { id: 'node-1', topic: 'Root' },
            { id: 'node-2', topic: 'Child' },
        ]);
    });
};

describe('mind map commercial control translations', () => {
    beforeEach(() => {
        mindHarness.listeners.clear();
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

    it('resolves the English batch, AI, and media controls from production resources', async () => {
        await renderLocalized('en');

        expect(screen.getByRole('toolbar', { name: 'Selected node actions' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Expand child topics with AI' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Add markers' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: 'Image URL' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Upload an image' })).toBeTruthy();
        expect(screen.getByRole('dialog', { name: 'Node note' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: 'Node note' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    });

    it('resolves the Chinese batch, AI, and media controls from production resources', async () => {
        await renderLocalized('zh');

        expect(screen.getByRole('toolbar', { name: '已选节点操作' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'AI 扩展子主题' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '添加标记' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: '图片地址' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '上传图片' })).toBeTruthy();
        expect(screen.getByRole('dialog', { name: '节点备注' })).toBeTruthy();
        expect(screen.getByRole('textbox', { name: '节点备注' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '取消' })).toBeTruthy();
    });
});
