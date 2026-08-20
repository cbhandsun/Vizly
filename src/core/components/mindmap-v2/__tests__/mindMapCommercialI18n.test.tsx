// @vitest-environment jsdom

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import MindMapBatchBar from '../MindMapBatchBar';
import { MindMapDirectionSelector } from '../MindMapDirectionSelector';
import { buildLocalizedMindMapTemplates } from '../mindmapTemplateCatalog';
import type { TemplateNode } from '../mindmapTemplateModel';
import { MindMapPropertyAISection } from '../MindMapPropertyAISection';
import { MindMapPropertyMediaControls } from '../MindMapPropertyMediaControls';
import { MindMapNoteEditorPanel } from '../MindMapNoteEditorPanel';
import { MindMapThemeSelector } from '../MindMapThemeSelector';

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
    it('ships localized single-node deletion and contextual action copy', () => {
        expect(en.plugins.mindmap.nodeDelete.confirm).toBe('Delete node');
        expect(en.plugins.mindmap.nodeDelete.failed).toContain('try again');
        expect(en.plugins.mindmap.actions.contextMenuLabel).toBe('Node actions');
        expect(zh.plugins.mindmap.nodeDelete.confirm).toBe('删除节点');
        expect(zh.plugins.mindmap.nodeDelete.failed).toContain('重试');
        expect(zh.plugins.mindmap.actions.contextMenuLabel).toBe('节点操作');
    });

    it('keeps the toolbar resource shape and interpolation tokens aligned', () => {
        expect(Object.keys(en.plugins.mindmap.toolbar).sort()).toEqual(
            Object.keys(zh.plugins.mindmap.toolbar).sort(),
        );
        expect(Object.keys(en.plugins.mindmap.toolbar.direction).sort()).toEqual(
            Object.keys(zh.plugins.mindmap.toolbar.direction).sort(),
        );
        expect(Object.keys(en.plugins.mindmap.toolbar.themeNames).sort()).toEqual(
            Object.keys(zh.plugins.mindmap.toolbar.themeNames).sort(),
        );
        expect(en.plugins.mindmap.toolbar.zoomResetLabel).toContain('{{zoom}}');
        expect(zh.plugins.mindmap.toolbar.zoomResetLabel).toContain('{{zoom}}');
        expect(en.plugins.mindmap.toolbar.stats).toContain('{{nodes}}');
        expect(zh.plugins.mindmap.toolbar.stats).toContain('{{depth}}');
    });

    it('keeps the search and replace resource shape aligned across locales', () => {
        expect(Object.keys(en.plugins.mindmap.searchPanel).sort()).toEqual(
            Object.keys(zh.plugins.mindmap.searchPanel).sort(),
        );
        expect(en.plugins.mindmap.searchPanel.statusPosition).toContain('{{current}}');
        expect(en.plugins.mindmap.searchPanel.confirmContent).toContain('{{replacement}}');
        expect(zh.plugins.mindmap.searchPanel.replaceAllPartial).toContain('{{failure}}');
    });

    it('keeps the node-template catalog and interpolation contract aligned across locales', () => {
        const enTemplates = en.plugins.mindmap.templates;
        const zhTemplates = zh.plugins.mindmap.templates;
        expect(Object.keys(enTemplates).sort()).toEqual(Object.keys(zhTemplates).sort());
        expect(Object.keys(enTemplates.catalog).sort()).toEqual(Object.keys(zhTemplates.catalog).sort());
        for (const key of Object.keys(enTemplates.catalog) as Array<keyof typeof enTemplates.catalog>) {
            expect(Object.keys(enTemplates.catalog[key].topics).sort())
                .toEqual(Object.keys(zhTemplates.catalog[key].topics).sort());
        }
        expect(enTemplates.replaceConfirmTitle).toContain('{{template}}');
        expect(enTemplates.replaceConfirmContent_other).toContain('{{count}}');
        expect(zhTemplates.replaceConfirmContent_other).toContain('{{template}}');
        expect(enTemplates.insertSuccess_other).toContain('{{count}}');
    });

    it('resolves every localized template label, description, and node topic', async () => {
        const collectTopics = (tree: TemplateNode): string[] => [
            tree.topic,
            ...(tree.children ?? []).flatMap(collectTopics),
        ];

        for (const language of ['en', 'zh'] as const) {
            await testI18n.changeLanguage(language);
            const templates = buildLocalizedMindMapTemplates(testI18n.t);
            expect(templates).toHaveLength(6);
            for (const template of templates) {
                expect(template.label).not.toMatch(/^plugins\.mindmap\.templates\./);
                expect(template.description).not.toMatch(/^plugins\.mindmap\.templates\./);
                expect(collectTopics(template.tree)).not.toContainEqual(
                    expect.stringMatching(/^plugins\.mindmap\.templates\./),
                );
            }
        }
    });

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

    it('resolves English direction and theme controls without mixed-language labels', async () => {
        await act(async () => {
            await testI18n.changeLanguage('en');
        });
        render(
            <I18nextProvider i18n={testI18n}>
                <MindMapDirectionSelector
                    currentDirection="L"
                    onChange={vi.fn()}
                    onOpenChange={vi.fn()}
                    open={false}
                />
                <MindMapThemeSelector
                    activeThemeKey="ocean"
                    onOpenChange={vi.fn()}
                    onThemeChange={vi.fn()}
                    open={false}
                />
            </I18nextProvider>,
        );

        expect(screen.getByRole('combobox', { name: 'Mind map layout direction: Expand left' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Switch theme; current theme: Ocean' })).toBeTruthy();
        expect(screen.queryByText('双向展开')).toBeNull();
        expect(screen.queryByText('海洋')).toBeNull();
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
