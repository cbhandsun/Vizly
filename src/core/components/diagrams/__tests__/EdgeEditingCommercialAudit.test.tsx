// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextualEdgeToolbar } from '../ContextualEdgeToolbar';
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

const createEdge = (): Edge => ({
    id: 'edge-1',
    source: 'node-1',
    target: 'node-2',
    type: 'smart-orthogonal',
    label: '',
    style: { stroke: '#3b82f6', strokeWidth: 2 },
});

describe('edge editing commercial audit regressions', () => {
    it('gives the contextual label editor a stable accessible name', () => {
        render(<ContextualEdgeToolbar edge={createEdge()} onUpdateEdge={vi.fn()} onToggleLock={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'edgeToolbar.addLabel' }));

        expect(screen.getByRole('textbox', { name: 'edgeToolbar.labelInput' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'edgeToolbar.confirm' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'edgeToolbar.cancel' })).toBeTruthy();
    });

    it('returns focus to the label trigger after confirming or cancelling', async () => {
        const onUpdateEdge = vi.fn();
        render(<ContextualEdgeToolbar edge={{ ...createEdge(), label: 'Original' }} onUpdateEdge={onUpdateEdge} onToggleLock={vi.fn()} />);
        const getTrigger = () => screen.getByRole('button', { name: 'edgeToolbar.currentLabel' });

        fireEvent.click(getTrigger());
        const input = screen.getByRole('textbox', { name: 'edgeToolbar.labelInput' });
        expect(document.activeElement).toBe(input);
        fireEvent.change(input, { target: { value: 'Updated\u0000' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(document.activeElement).toBe(getTrigger()));
        expect(onUpdateEdge).toHaveBeenCalledWith('edge-1', { label: 'Updated' });

        fireEvent.click(getTrigger());
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Discarded' } });
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

        await waitFor(() => expect(document.activeElement).toBe(getTrigger()));
        expect(onUpdateEdge).toHaveBeenCalledTimes(1);
    });

    it('bounds direct label input and emits an explicit clear update', () => {
        const onUpdateEdge = vi.fn();
        render(<ContextualEdgeToolbar edge={{ ...createEdge(), label: 'Original' }} onUpdateEdge={onUpdateEdge} onToggleLock={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'edgeToolbar.currentLabel' }));
        const input = screen.getByRole('textbox', { name: 'edgeToolbar.labelInput' });

        fireEvent.change(input, { target: { value: 'x'.repeat(1_200) } });
        expect((input as HTMLInputElement).value).toBe('x'.repeat(1_000));
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: 'edgeToolbar.confirm' }));

        expect(onUpdateEdge).toHaveBeenCalledWith('edge-1', { label: undefined });
    });

    it('exposes connector locking and disables mutation controls while locked', () => {
        const onToggleLock = vi.fn();
        render(
            <ContextualEdgeToolbar
                edge={{
                    ...createEdge(),
                    data: { locked: true },
                    deletable: false,
                    reconnectable: false,
                }}
                onUpdateEdge={vi.fn()}
                onToggleLock={onToggleLock}
            />,
        );

        expect(screen.getByRole('button', { name: 'edgeToolbar.switchColor' }).getAttribute('aria-disabled')).toBe('true');
        const unlock = screen.getByRole('button', { name: 'designer.contextMenu.unlock' });
        expect(unlock.getAttribute('aria-disabled')).toBe('false');
        fireEvent.click(unlock);
        expect(onToggleLock).toHaveBeenCalledWith('edge-1', false);
    });

    it('gives every edge property control a field-specific accessible name', () => {
        const { container } = render(
            <PropertyPanel
                selectedNodes={[]}
                selectedEdges={[createEdge()]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={vi.fn()}
                docked
            />,
        );

        for (const accessibleName of [
            'propertyPanel.label',
            'propertyPanel.lineType',
            'propertyPanel.cornerRadius',
            'propertyPanel.style',
            'propertyPanel.strokeColor',
            'propertyPanel.lineWidth',
            'propertyPanel.arrowHead',
        ]) {
            expect(container.querySelector(`[aria-label="${accessibleName}"]`)).not.toBeNull();
        }
    });

    it('shows the effective default width for a single edge instead of a mixed state', () => {
        const edgeWithoutExplicitWidth = {
            ...createEdge(),
            style: { stroke: '#3b82f6' },
        };
        render(
            <PropertyPanel
                selectedNodes={[]}
                selectedEdges={[edgeWithoutExplicitWidth]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={vi.fn()}
                docked
            />,
        );

        const widthInput = screen.getByRole('spinbutton', { name: 'propertyPanel.lineWidth' }) as HTMLInputElement;
        expect(widthInput.value).toBe('2');
        expect(widthInput.getAttribute('placeholder')).not.toBe('propertyPanel.mixed');
    });

    it('bounds and sanitizes labels edited through the full property panel', () => {
        const onUpdateEdges = vi.fn();
        render(
            <PropertyPanel
                selectedNodes={[]}
                selectedEdges={[{ ...createEdge(), label: `unsafe\u0000${'x'.repeat(1_200)}` }]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={onUpdateEdges}
                docked
            />,
        );

        const labelInput = screen.getByRole('textbox', { name: 'propertyPanel.label' }) as HTMLInputElement;
        expect(labelInput.maxLength).toBe(1_000);
        expect(labelInput.value).toBe(`unsafe${'x'.repeat(994)}`);

        fireEvent.change(labelInput, { target: { value: `next\u0000${'y'.repeat(1_200)}` } });
        expect(labelInput.value).toBe(`next${'y'.repeat(996)}`);
        fireEvent.blur(labelInput);

        expect(onUpdateEdges).toHaveBeenLastCalledWith(
            ['edge-1'],
            { label: `next${'y'.repeat(996)}`, data: { label: `next${'y'.repeat(996)}` } },
        );
    });

    it('enforces 44px contextual controls for narrow or coarse-pointer environments', () => {
        const css = readFileSync(
            'src/core/components/shared/FloatingToolbar/FloatingToolbar.css',
            'utf8',
        );

        expect(css).toMatch(/@media \(max-width: 768px\), \(pointer: coarse\)[\s\S]*?\.floating-toolbar-container,[\s\S]*?\.contextual-edge-toolbar[\s\S]*?--ftb-btn-size: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.contextual-edge-toolbar-label-input[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    });
});
