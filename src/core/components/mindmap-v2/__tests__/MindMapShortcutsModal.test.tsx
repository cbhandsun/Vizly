// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import MindMapShortcutsModal from '../MindMapShortcutsModal';

let testI18n: i18n;

beforeAll(async () => {
    testI18n = i18next.createInstance();
    await testI18n.use(initReactI18next).init({
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        lng: 'en',
        resources: {
            en: { translation: en },
            zh: { translation: zh },
        },
    });
});

afterEach(() => cleanup());

const renderModal = async (language: 'en' | 'zh', onClose = vi.fn()) => {
    await act(async () => {
        await testI18n.changeLanguage(language);
    });
    render(
        <I18nextProvider i18n={testI18n}>
            <MindMapShortcutsModal onClose={onClose} open />
        </I18nextProvider>,
    );
    return onClose;
};

describe('MindMapShortcutsModal commercial contract', () => {
    it('renders verified English shortcuts with semantic groups and OS-neutral modifier copy', async () => {
        await renderModal('en');

        expect(screen.getByRole('dialog', { name: 'Mind map shortcuts and quick actions' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Node editing' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Mouse and import' })).toBeTruthy();
        expect(screen.getByRole('listitem', { name: 'Add a child node: Tab' })).toBeTruthy();
        expect(screen.getByRole('listitem', { name: 'Insert a parent node: Ctrl / ⌘+Enter' })).toBeTruthy();
        expect(screen.getAllByText('Ctrl / ⌘', { selector: 'kbd' }).length).toBeGreaterThan(0);
        expect(screen.queryByText('☰ 工具栏')).toBeNull();
        expect(screen.queryByText('⊞ 工具栏')).toBeNull();
    });

    it('renders the complete Chinese help surface without English action copy', async () => {
        await renderModal('zh');

        expect(screen.getByRole('dialog', { name: '思维导图快捷键与高效操作' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: '节点编辑' })).toBeTruthy();
        expect(screen.getByRole('listitem', { name: '添加子节点：Tab' })).toBeTruthy();
        expect(screen.getByText('Ctrl / ⌘ 表示 Windows、Linux 使用 Ctrl，macOS 使用 Command；部分操作需要先选中节点。')).toBeTruthy();
        expect(screen.queryByText('Node editing')).toBeNull();
    });

    it('exposes a working close action', async () => {
        const onClose = await renderModal('en');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the help responsive, scrollable, reduced-motion safe, and free of emoji assets', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapShortcutsModal.tsx'), 'utf8');
        const css = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapShortcutsModal.css'), 'utf8');

        for (const emoji of ['🌿', '🔭', '🕹️', '🎬', '⚡', '💡']) {
            expect(source).not.toContain(emoji);
        }
        expect(source).not.toContain('☰ 工具栏');
        expect(source).not.toContain('⊞ 工具栏');
        expect(css).toMatch(/\.mindmap-shortcuts-modal \.ant-modal-close\s*\{[\s\S]*?width: var\(--commercial-touch-target, 44px\);[\s\S]*?height: var\(--commercial-touch-target, 44px\);/);
        expect(css).toMatch(/\.mindmap-shortcuts-modal \.ant-modal-body\s*\{[\s\S]*?max-height: calc\(100dvh - 112px\);[\s\S]*?overflow-y: auto;/);
        expect(css).toContain('@media (max-width: 680px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
