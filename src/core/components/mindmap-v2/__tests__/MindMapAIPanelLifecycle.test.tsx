// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
});

const harness = vi.hoisted(() => ({
    classifyTasks: vi.fn(),
    confirm: vi.fn(),
    confirmOptions: undefined as unknown,
    expandNode: vi.fn(),
    generateMap: vi.fn(),
    messageError: vi.fn(),
    messageInfo: vi.fn(),
    messageSuccess: vi.fn(),
    processNode: vi.fn(),
    summarizeNode: vi.fn(),
}));

vi.mock('../mindmapAIService', () => ({
    classifyTasksWithAI: harness.classifyTasks,
    expandNodeWithAI: harness.expandNode,
    generateMindMapFromPrompt: harness.generateMap,
    getAncestorPath: () => [],
    processNodeWithAICustomAction: harness.processNode,
    summarizeNodeWithAI: harness.summarizeNode,
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: harness.messageError,
        info: harness.messageInfo,
        success: harness.messageSuccess,
    },
    appModal: {
        confirm: harness.confirm,
    },
}));

import {
    registerMindElixirInstance,
    toggleAIPanel,
    unregisterMindElixirInstance,
} from '../mindElixirStore';
import { MindMapAIPanel } from '../MindMapAIPanel';

type Listener = (...args: unknown[]) => void;

const createMind = (nodeData: NodeObj) => {
    const listeners = new Map<string, Set<Listener>>();
    const addListener = (name: string, listener: Listener) => {
        const group = listeners.get(name) ?? new Set<Listener>();
        group.add(listener);
        listeners.set(name, group);
    };
    const removeListener = (name: string, listener: Listener) => {
        listeners.get(name)?.delete(listener);
    };
    const fire = (name: string, ...args: unknown[]) => {
        listeners.get(name)?.forEach(listener => listener(...args));
    };
    const refresh = vi.fn();
    const toCenter = vi.fn();
    const mind = {
        bus: { addListener, fire, removeListener },
        getData: () => ({ nodeData }),
        refresh,
        toCenter,
    } as unknown as MindElixirInstance;

    return { fire, mind, refresh };
};

const openPanel = async (mind: MindElixirInstance) => {
    registerMindElixirInstance(mind);
    render(<MindMapAIPanel />);
    act(() => toggleAIPanel(true));
    expect(await screen.findByRole('complementary', {
        name: i18n.t('plugins.mindmap.aiPanel.panelLabel'),
    })).toBeTruthy();
};

const switchToExpand = async () => {
    const expandMode = screen.getByText(i18n.t('plugins.mindmap.aiPanel.modes.expand'));
    fireEvent.click(expandMode);
    return screen.findByRole('button', {
        name: i18n.t('plugins.mindmap.aiPanel.expandAction'),
    });
};

beforeEach(async () => {
    await i18n.changeLanguage('zh');
    harness.classifyTasks.mockReset();
    harness.confirm.mockReset();
    harness.confirmOptions = undefined;
    harness.expandNode.mockReset();
    harness.generateMap.mockReset();
    harness.messageError.mockReset();
    harness.messageInfo.mockReset();
    harness.messageSuccess.mockReset();
    harness.processNode.mockReset();
    harness.summarizeNode.mockReset();
    harness.confirm.mockImplementation((options: unknown) => {
        harness.confirmOptions = options;
        return { destroy: vi.fn(), update: vi.fn() };
    });
});

afterEach(() => {
    act(() => {
        toggleAIPanel(false);
        unregisterMindElixirInstance();
    });
    cleanup();
});

describe('MindMapAIPanel request lifecycle', () => {
    it('drops an expansion response after the selected target changes', async () => {
        const child: NodeObj = { id: 'child', topic: 'Child', children: [] };
        const root: NodeObj = { id: 'root', topic: 'Root', children: [child] };
        const { fire, mind } = createMind(root);
        let resolveExpansion: ((value: { topics: string[] }) => void) | undefined;
        harness.expandNode.mockImplementationOnce(() => new Promise(resolve => {
            resolveExpansion = resolve;
        }));

        await openPanel(mind);
        fireEvent.click(await switchToExpand());
        await waitFor(() => expect(harness.expandNode).toHaveBeenCalledTimes(1));

        act(() => fire('selectNodes', [child]));
        await act(async () => {
            resolveExpansion?.({ topics: ['Stale suggestion'] });
            await Promise.resolve();
        });

        expect(screen.queryByRole('button', { name: '+ Stale suggestion' })).toBeNull();
        expect(harness.messageSuccess).not.toHaveBeenCalled();
    });

    it('drops an expansion response after the panel closes', async () => {
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const { mind } = createMind(root);
        let resolveExpansion: ((value: { topics: string[] }) => void) | undefined;
        harness.expandNode.mockImplementationOnce(() => new Promise(resolve => {
            resolveExpansion = resolve;
        }));

        await openPanel(mind);
        fireEvent.click(await switchToExpand());
        await waitFor(() => expect(harness.expandNode).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', {
            name: i18n.t('plugins.mindmap.aiPanel.close'),
        }));

        await act(async () => {
            resolveExpansion?.({ topics: ['Late suggestion'] });
            await Promise.resolve();
        });

        expect(screen.queryByRole('complementary', {
            name: i18n.t('plugins.mindmap.aiPanel.panelLabel'),
        })).toBeNull();
        expect(screen.queryByRole('button', { name: '+ Late suggestion' })).toBeNull();
    });

    it('turns thrown provider failures into contextual user feedback', async () => {
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const { mind } = createMind(root);
        harness.expandNode.mockRejectedValueOnce(new Error('provider secret must not surface'));

        await openPanel(mind);
        fireEvent.click(await switchToExpand());

        await waitFor(() => {
            expect(harness.messageError).toHaveBeenCalledWith(
                i18n.t('plugins.mindmap.aiPanel.expandFailed'),
            );
        });
        expect((screen.getByRole('button', {
            name: i18n.t('plugins.mindmap.aiPanel.expandAction'),
        }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('does not expose a Chinese service error in an English workspace', async () => {
        await i18n.changeLanguage('en');
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const { mind } = createMind(root);
        harness.expandNode.mockResolvedValueOnce({
            topics: [],
            error: '请先在 AI 设置中配置有效的 Provider 和 API Key',
        });

        await openPanel(mind);
        fireEvent.click(await switchToExpand());

        await waitFor(() => {
            expect(harness.messageError).toHaveBeenCalledWith(
                'Configure a valid AI provider and API key before continuing.',
            );
        });
    });

    it('requires confirmation before replacing a non-empty map', async () => {
        const child: NodeObj = { id: 'child', topic: 'Existing work', children: [] };
        const root: NodeObj = { id: 'root', topic: 'Root', children: [child] };
        const { mind, refresh } = createMind(root);
        harness.generateMap.mockResolvedValueOnce({
            nodeData: { id: 'generated', topic: 'Generated map', children: [] },
        });

        await openPanel(mind);
        fireEvent.change(screen.getByRole('textbox', {
            name: i18n.t('plugins.mindmap.aiPanel.createPromptLabel'),
        }), {
            target: { value: 'Replacement map' },
        });
        fireEvent.click(screen.getByRole('button', {
            name: i18n.t('plugins.mindmap.aiPanel.createAction'),
        }));

        expect(harness.confirm).toHaveBeenCalledTimes(1);
        expect(harness.generateMap).not.toHaveBeenCalled();
        const options = harness.confirmOptions as {
            afterClose?: () => void;
            onOk?: () => Promise<void>;
        };
        expect(options.onOk).toBeTypeOf('function');
        await act(async () => {
            await options.onOk?.();
        });
        expect(harness.generateMap).toHaveBeenCalledWith('Replacement map');
        expect(refresh).toHaveBeenCalledTimes(1);
        act(() => options.afterClose?.());
        expect(screen.getByRole('complementary', {
            name: i18n.t('plugins.mindmap.aiPanel.panelLabel'),
        }).getAttribute('aria-busy')).toBe('false');
        expect((screen.getByRole('textbox', {
            name: i18n.t('plugins.mindmap.aiPanel.createPromptLabel'),
        }) as HTMLTextAreaElement).value).toBe('');
    });

    it('localizes all four operation modes and their accessible names in English', async () => {
        await i18n.changeLanguage('en');
        const root: NodeObj = { id: 'root', topic: 'Root', children: [] };
        const { mind } = createMind(root);

        await openPanel(mind);
        expect(screen.getByRole('button', { name: 'Close AI mind map assistant' })).toBeTruthy();
        expect(screen.getByRole('textbox', {
            name: 'Topic or business question for AI mind map generation',
        })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Generate complete mind map' })).toBeTruthy();

        fireEvent.click(screen.getByText('Expand', { exact: true }));
        expect(await screen.findByRole('combobox', { name: 'AI operation target node' })).toBeTruthy();
        expect(screen.getByText('Root (root node)')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Generate child-topic suggestions' })).toBeTruthy();

        fireEvent.click(screen.getByText('Process', { exact: true }));
        expect(screen.getByRole('textbox', { name: 'AI mind map processing instruction' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Apply to target node' })).toBeTruthy();

        fireEvent.click(screen.getByText('Tasks', { exact: true }));
        expect(screen.getByText(/This branch has 0 leaf tasks/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Plan tasks in this branch' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Quick plan with rules' })).toBeTruthy();
    });
});
