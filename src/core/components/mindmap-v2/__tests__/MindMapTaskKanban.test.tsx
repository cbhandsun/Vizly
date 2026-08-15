// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';

const harness = vi.hoisted(() => {
    const root = {
        id: 'root',
        topic: 'Project',
        children: [
            { id: 'task-1', topic: 'First task', children: [] },
            { id: 'task-2', topic: 'Second task', children: [] },
        ],
    };
    const nodes = new Map(root.children.map(node => [node.id, node]));
    return {
        addListener: vi.fn(),
        classifyTasksWithAI: vi.fn(),
        findEle: vi.fn((id: string) => nodes.has(id) ? ({ dataset: { nodeid: id } }) : null),
        getData: vi.fn(() => ({ nodeData: root })),
        getObjById: vi.fn((id: string) => nodes.get(id) ?? null),
        kanbanListener: undefined as ((open: boolean) => void) | undefined,
        messageError: vi.fn(),
        messageLoadingHide: vi.fn(),
        messageSuccess: vi.fn(),
        messageWarning: vi.fn(),
        removeListener: vi.fn(),
        reshapeNode: vi.fn(),
        toggleKanban: vi.fn((open: boolean) => harness.kanbanListener?.(open)),
    };
});

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        bus: {
            addListener: harness.addListener,
            fire: vi.fn(),
            removeListener: harness.removeListener,
        },
        findEle: harness.findEle,
        getData: harness.getData,
        getObjById: harness.getObjById,
        reshapeNode: harness.reshapeNode,
    }),
    subscribeKanban: (listener: (open: boolean) => void) => {
        harness.kanbanListener = listener;
        return () => {
            if (harness.kanbanListener === listener) harness.kanbanListener = undefined;
        };
    },
    subscribeMindElixir: () => () => undefined,
    toggleKanban: harness.toggleKanban,
}));

vi.mock('../mindmapAIService', () => ({
    classifyTasksWithAI: harness.classifyTasksWithAI,
}));

vi.mock('../mindmapPanelLogging', () => ({
    logMindmapKanbanRefreshFailure: vi.fn(),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: harness.messageError,
        loading: vi.fn(() => harness.messageLoadingHide),
        success: harness.messageSuccess,
        warning: harness.messageWarning,
    },
}));

import { MindMapTaskKanban } from '../MindMapTaskKanban';

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

beforeEach(async () => {
    vi.clearAllMocks();
    harness.kanbanListener = undefined;
    harness.classifyTasksWithAI.mockResolvedValue({ error: 'provider unavailable' });
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    await act(async () => {
        await testI18n.changeLanguage('en');
    });
});

afterEach(() => cleanup());

const renderClosedBoard = () => render(
    <I18nextProvider i18n={testI18n}>
        <MindMapTaskKanban />
    </I18nextProvider>,
);

const openBoard = async () => {
    act(() => harness.kanbanListener?.(true));
    return screen.findByRole('dialog', { name: 'AI agile task board' });
};

describe('MindMapTaskKanban commercial interactions', () => {
    it('opens as a labelled focus-contained dialog and restores the trigger on Escape', async () => {
        const trigger = document.createElement('button');
        trigger.textContent = 'Open board';
        document.body.appendChild(trigger);
        trigger.focus();
        renderClosedBoard();

        const dialog = await openBoard();
        const closeButton = screen.getByRole('button', { name: 'Close task board' });
        await waitFor(() => expect(document.activeElement).toBe(closeButton));
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(screen.getByRole('button', { name: 'Copy task board as Markdown' })).toBeTruthy();
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.getAllByRole('combobox')).toHaveLength(2);

        fireEvent.keyDown(closeButton, { key: 'Escape' });
        expect(harness.toggleKanban).toHaveBeenCalledWith(false);
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it('provides a keyboard status control and announces the synchronized move', async () => {
        renderClosedBoard();
        await openBoard();

        fireEvent.change(await screen.findByRole('combobox', { name: 'Move First task to another column' }), {
            target: { value: 'doing' },
        });

        expect(harness.reshapeNode).toHaveBeenCalledTimes(1);
        expect(harness.reshapeNode.mock.calls[0]?.[1]).toMatchObject({
            task: expect.objectContaining({ status: 'doing' }),
        });
        expect(screen.getByText('Moved First task to In progress.', { selector: '.sr-only' })).toBeTruthy();
    });

    it('recovers from a rejected AI request without leaving the board busy', async () => {
        harness.classifyTasksWithAI.mockRejectedValueOnce(new Error('network failed'));
        renderClosedBoard();
        await openBoard();
        await screen.findByRole('combobox', { name: 'Move First task to another column' });

        const planButton = screen.getByRole('button', { name: 'Plan with AI' });
        fireEvent.click(planButton);

        await waitFor(() => expect(harness.classifyTasksWithAI).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(harness.messageError).toHaveBeenCalledWith(
            'AI planning failed. Your current task board was not changed.',
        ));
        expect(harness.messageLoadingHide).toHaveBeenCalledTimes(1);
        expect(planButton.hasAttribute('disabled')).toBe(false);
    });

    it('discards an AI result after the board closes', async () => {
        let resolveClassification: ((value: {
            classifications: Array<{ id: string; priority: '高'; status: 'doing' }>;
        }) => void) | undefined;
        harness.classifyTasksWithAI.mockImplementationOnce(() => new Promise(resolve => {
            resolveClassification = resolve;
        }));
        renderClosedBoard();
        await openBoard();
        await screen.findByRole('combobox', { name: 'Move First task to another column' });

        fireEvent.click(screen.getByRole('button', { name: 'Plan with AI' }));
        await waitFor(() => expect(harness.classifyTasksWithAI).toHaveBeenCalledTimes(1));
        act(() => harness.kanbanListener?.(false));
        expect(screen.queryByRole('dialog')).toBeNull();

        await act(async () => {
            resolveClassification?.({
                classifications: [{ id: 'task-1', priority: '高', status: 'doing' }],
            });
            await Promise.resolve();
        });

        expect(harness.reshapeNode).not.toHaveBeenCalled();
        expect(harness.messageSuccess).not.toHaveBeenCalled();
        expect(harness.messageError).not.toHaveBeenCalled();
        expect(harness.messageWarning).not.toHaveBeenCalled();
        expect(harness.messageLoadingHide).toHaveBeenCalledTimes(1);
    });

    it('uses responsive safe areas, stacked mobile columns, and reduced-motion fallbacks', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapTaskKanban.tsx'), 'utf8');
        const css = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapTaskKanban.css'), 'utf8');
        const toolbarSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.tsx'), 'utf8');

        expect(source).not.toContain("document.createElement('style')");
        expect(source).not.toContain('message.');
        expect(source).toContain('appMessage.loading(');
        expect(source).toContain('useModalFocusTrap');
        expect(toolbarSource.indexOf('data-testid="mindmap-kanban-trigger"')).toBeLessThan(
            toolbarSource.indexOf('{/* Undo / Redo */}'),
        );
        expect(css).toMatch(/\.mindmap-kanban-panel\s*\{[\s\S]*?top: 104px;[\s\S]*?right: calc\(72px \+ env\(safe-area-inset-right, 0px\)\);/);
        expect(css).toContain('@media (max-width: 680px)');
        expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?left: 16px;[\s\S]*?width: auto;/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    });
});
