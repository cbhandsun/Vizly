// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    it('communicates and enforces a locked read-only state', () => {
        const { container, getByRole } = render(
            <PropertyPanel
                selectedNodes={[createNode('Locked')]}
                selectedEdges={[]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={vi.fn()}
                disabled
                disabledReason="节点已锁定，请先解锁后再编辑"
                docked
            />,
        );

        expect(getByRole('status').textContent).toContain('节点已锁定');
        expect(container.querySelector('.property-panel-wrapper')?.getAttribute('aria-disabled')).toBe('true');
        expect(container.querySelector<HTMLElement>('.property-panel-content')?.style.pointerEvents).toBe('none');
    });

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
        expect(screen.getByRole('button', { name: 'propertyPanel.clearLabel' })).toBeTruthy();
    });

    it('labels appearance controls that otherwise rely on icons or visual form labels', () => {
        render(
            <PropertyPanel
                selectedNodes={[createNode('Appearance')]}
                selectedEdges={[]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={vi.fn()}
                docked
            />,
        );

        fireEvent.click(screen.getByText('propertyPanel.appearance'));

        expect(screen.getByRole('button', { name: 'iconExplorer.open' })).toBeTruthy();
        expect(screen.getByRole('slider', { name: 'propertyPanel.borderRadius' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'propertyPanel.alignLeft' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'propertyPanel.alignCenter' })).toBeTruthy();
        expect(screen.getByRole('radio', { name: 'propertyPanel.alignRight' })).toBeTruthy();
        expect(screen.getByRole('spinbutton', { name: 'propertyPanel.borderWidth' })).toBeTruthy();
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
