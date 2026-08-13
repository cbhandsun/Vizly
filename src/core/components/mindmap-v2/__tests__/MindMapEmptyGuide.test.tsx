// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MindMapEmptyGuide from '../MindMapEmptyGuide';

const harness = vi.hoisted(() => ({
    bind: vi.fn(({ onChange }: { onChange: (isEmpty: boolean) => void }) => {
        onChange(true);
        return vi.fn();
    }),
}));

vi.mock('../mindElixirStore', () => ({
    getMindElixirInstance: () => ({
        bus: { addListener: vi.fn(), removeListener: vi.fn() },
        container: document.createElement('div'),
        getData: () => ({ nodeData: { id: 'root', topic: 'Root', children: [] } }),
        toCenter: vi.fn(),
    }),
}));

vi.mock('../mindMapEmptyState', () => ({
    bindMindMapEmptyState: harness.bind,
    readMindMapEmptyState: () => true,
}));

vi.mock('../mindmapAIService', () => ({
    generateMindMapFromPrompt: vi.fn(),
}));

vi.mock('../mindmapTreeSanitizer', () => ({
    cleanMindMapData: vi.fn(value => value),
    refreshMindElixirWithSanitizedData: vi.fn(),
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

describe('MindMapEmptyGuide', () => {
    it('renders a localized named region with discoverable controls and shortcuts', async () => {
        render(<MindMapEmptyGuide />);

        const guide = await screen.findByRole('region', { name: 'Start your mind map' });
        expect(guide).toBeTruthy();
        expect(screen.getByRole('textbox', { name: 'Topic for AI mind map generation' })).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Generate with AI' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByLabelText('Mind map keyboard shortcuts').textContent).toContain('TabAdd child');
        expect(screen.queryByText('不再显示 ×')).toBeNull();
    });

    it('describes dismissal as temporary behavior and restores the guide on remount', async () => {
        const first = render(<MindMapEmptyGuide />);
        const dismiss = await screen.findByRole('button', { name: 'Dismiss getting-started guide' });

        fireEvent.click(dismiss);
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Start your mind map' })).toBeNull());

        first.unmount();
        render(<MindMapEmptyGuide />);
        expect(await screen.findByRole('region', { name: 'Start your mind map' })).toBeTruthy();
    });
});
