// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import PropertyPanel from '../PropertyPanel';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

const createNode = (label: string): Node => ({
    id: 'node-1',
    type: 'flowchart',
    position: { x: 0, y: 0 },
    data: {
        label,
        description: `${label} description`,
        domain: 'Core',
        shape: 'rectangle',
    },
});

describe('PropertyPanel field synchronization', () => {
    it('hydrates fields from the initial selected node', () => {
        const { container } = render(
            <PropertyPanel
                selectedNodes={[createNode('Decision')]}
                selectedEdges={[]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={vi.fn()}
                docked
            />,
        );

        const inputs = container.querySelectorAll<HTMLInputElement>('input');
        expect(Array.from(inputs).some(input => input.value === 'Decision')).toBe(true);
        expect(container.querySelector<HTMLTextAreaElement>('textarea')?.value)
            .toBe('Decision description');
        expect(container.querySelector('[aria-label="propertyPanel.clearLabel"]')).not.toBeNull();
    });

    it('refreshes local fields when history restores the selected node data', async () => {
        const onUpdateNodes = vi.fn();
        const onUpdateEdges = vi.fn();
        const { container, rerender } = render(
            <PropertyPanel
                selectedNodes={[createNode('Edited')]}
                selectedEdges={[]}
                onUpdateNodes={onUpdateNodes}
                onUpdateEdges={onUpdateEdges}
                docked
            />,
        );

        rerender(
            <PropertyPanel
                selectedNodes={[createNode('Restored')]}
                selectedEdges={[]}
                onUpdateNodes={onUpdateNodes}
                onUpdateEdges={onUpdateEdges}
                docked
            />,
        );

        await waitFor(() => {
            const inputs = container.querySelectorAll<HTMLInputElement>('input');
            expect(Array.from(inputs).some(input => input.value === 'Restored')).toBe(true);
            expect(Array.from(inputs).some(input => input.value === 'Edited')).toBe(false);
        });
    });
});
