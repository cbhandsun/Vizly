// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import MindMapEmptyGuide from '../MindMapEmptyGuide';

interface MockMind {
    bus: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> };
    container: HTMLElement;
    getData: () => { nodeData: { id: string; topic: string; children: unknown[] } };
    toCenter: ReturnType<typeof vi.fn>;
}

const harness = vi.hoisted(() => ({
    activeMind: null as MockMind | null,
    aiListener: null as ((open: boolean) => void) | null,
    bind: vi.fn(),
    empty: true,
    generate: vi.fn(),
    mindListener: null as ((mind: MockMind | null) => void) | null,
    refresh: vi.fn(),
}));

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => harness.activeMind,
    subscribeAIPanel: (listener: (open: boolean) => void) => {
        harness.aiListener = listener;
        return vi.fn();
    },
    subscribeMindElixir: (listener: (mind: MockMind | null) => void) => {
        harness.mindListener = listener;
        return vi.fn();
    },
}));

vi.mock('../mindMapEmptyState', () => ({
    bindMindMapEmptyState: harness.bind,
    readMindMapEmptyState: () => harness.empty,
}));

vi.mock('../mindmapAIService', () => ({
    generateMindMapFromPrompt: (prompt: string) => harness.generate(prompt),
}));

vi.mock('../mindmapTreeSanitizer', () => ({
    MINDMAP_MAX_TOPIC_LENGTH: 200,
    cleanMindMapData: vi.fn(value => value),
    cleanMindMapTopic: (value: unknown, fallback = '(untitled)') => (
        typeof value === 'string' && value ? value.slice(0, 200) : fallback
    ),
    refreshMindElixirWithSanitizedData: (...args: unknown[]) => harness.refresh(...args),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'plugins.mindmap.emptyGuide.title': 'Start your mind map',
            'plugins.mindmap.emptyGuide.descriptionBefore': 'Double-click the root node or press',
            'plugins.mindmap.emptyGuide.descriptionAfter': 'to add your first branch.',
            'plugins.mindmap.emptyGuide.promptLabel': 'Topic for AI mind map generation',
            'plugins.mindmap.emptyGuide.promptPlaceholder': 'Describe a topic for AI...',
            'plugins.mindmap.emptyGuide.generate': 'Generate with AI',
            'plugins.mindmap.emptyGuide.generating': 'Generating...',
            'plugins.mindmap.emptyGuide.generateFailed': 'Generation failed. Try again.',
            'plugins.mindmap.emptyGuide.requestFailed': 'Request failed.',
            'plugins.mindmap.emptyGuide.dismiss': 'Dismiss',
            'plugins.mindmap.emptyGuide.dismissLabel': 'Dismiss getting-started guide',
            'plugins.mindmap.emptyGuide.shortcutsLabel': 'Mind map keyboard shortcuts',
            'plugins.mindmap.emptyGuide.shortcuts.addChild': 'Add child',
            'plugins.mindmap.emptyGuide.shortcuts.addSibling': 'Add sibling',
            'plugins.mindmap.emptyGuide.shortcuts.editNode': 'Edit node',
            'plugins.mindmap.emptyGuide.shortcuts.search': 'Search',
            'plugins.mindmap.emptyGuide.shortcuts.undo': 'Undo',
        } as Record<string, string>)[key] ?? key,
    }),
}));

const createMind = (): MockMind => ({
    bus: { addListener: vi.fn(), removeListener: vi.fn() },
    container: document.createElement('div'),
    getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
    toCenter: vi.fn(),
});

const renderGuide = async (diagramId = 'diagram-one') => {
    const result = render(<MindMapEmptyGuide diagramId={diagramId} />);
    await screen.findByRole('region', { name: 'Start your mind map' });
    return result;
};

const startPendingGeneration = async () => {
    let resolveRequest: ((value: { nodeData: { id: string; topic: string; children: unknown[] } }) => void) | undefined;
    harness.generate.mockReturnValueOnce(new Promise(resolve => {
        resolveRequest = resolve;
    }));
    await renderGuide();
    fireEvent.change(screen.getByRole('textbox', { name: 'Topic for AI mind map generation' }), {
        target: { value: 'Pending map' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));
    await waitFor(() => expect(harness.generate).toHaveBeenCalledTimes(1));
    return resolveRequest;
};

beforeEach(() => {
    localStorage.clear();
    harness.activeMind = createMind();
    harness.aiListener = null;
    harness.mindListener = null;
    harness.empty = true;
    harness.generate.mockReset();
    harness.refresh.mockReset();
    harness.bind.mockReset();
    harness.bind.mockImplementation(({ onChange }: { onChange: (isEmpty: boolean) => void }) => {
        onChange(harness.empty);
        return vi.fn();
    });
});

describe('MindMapEmptyGuide', () => {
    it('renders a localized named region with bounded controls and shortcuts', async () => {
        await renderGuide();

        expect(screen.getByRole('textbox', { name: 'Topic for AI mind map generation' }).getAttribute('maxlength')).toBe('200');
        expect((screen.getByRole('button', { name: 'Generate with AI' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByLabelText('Mind map keyboard shortcuts').textContent).toContain('TabAdd child');
    });

    it('sanitizes and bounds the prompt before applying a generated tree', async () => {
        harness.generate.mockResolvedValueOnce({
            nodeData: { id: 'root', topic: 'Generated', children: [] },
        });
        const mind = harness.activeMind;
        await renderGuide();
        fireEvent.change(screen.getByRole('textbox', { name: 'Topic for AI mind map generation' }), {
            target: { value: `  ${'x'.repeat(220)}  ` },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));

        await waitFor(() => expect(harness.generate).toHaveBeenCalledWith('x'.repeat(200)));
        expect(harness.refresh).toHaveBeenCalledTimes(1);
        expect(mind?.toCenter).toHaveBeenCalledTimes(1);
    });

    it('remembers dismissal across remounts for the same diagram only', async () => {
        const first = await renderGuide();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting-started guide' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Start your mind map' })).toBeNull());

        first.unmount();
        const sameDiagram = render(<MindMapEmptyGuide diagramId="diagram-one" />);
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Start your mind map' })).toBeNull());
        sameDiagram.unmount();

        await renderGuide('diagram-two');
    });

    it('ignores a generated tree that resolves after the guide is dismissed', async () => {
        const resolveRequest = await startPendingGeneration();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss getting-started guide' }));

        await act(async () => {
            resolveRequest?.({ nodeData: { id: 'root', topic: 'Late', children: [] } });
            await Promise.resolve();
        });

        expect(harness.refresh).not.toHaveBeenCalled();
    });

    it('hides behind the dedicated AI panel and ignores its pending response', async () => {
        const resolveRequest = await startPendingGeneration();
        act(() => harness.aiListener?.(true));
        expect(screen.queryByRole('region', { name: 'Start your mind map' })).toBeNull();

        await act(async () => {
            resolveRequest?.({ nodeData: { id: 'root', topic: 'Late', children: [] } });
            await Promise.resolve();
        });
        expect(harness.refresh).not.toHaveBeenCalled();

        act(() => harness.aiListener?.(false));
        expect(await screen.findByRole('region', { name: 'Start your mind map' })).toBeTruthy();
    });

    it('ignores a pending response after the active mind-map instance changes', async () => {
        const resolveRequest = await startPendingGeneration();
        const replacement = createMind();
        harness.activeMind = replacement;
        act(() => harness.mindListener?.(replacement));

        await act(async () => {
            resolveRequest?.({ nodeData: { id: 'root', topic: 'Wrong map', children: [] } });
            await Promise.resolve();
        });

        expect(harness.refresh).not.toHaveBeenCalled();
    });

    it('shows localized generic feedback without exposing thrown provider details', async () => {
        harness.generate.mockRejectedValueOnce(new Error('provider-secret://must-not-surface'));
        await renderGuide();
        fireEvent.change(screen.getByRole('textbox', { name: 'Topic for AI mind map generation' }), {
            target: { value: 'Failure case' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Generate with AI' }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe('Request failed.');
        expect(alert.textContent).not.toContain('provider-secret');
    });
});
