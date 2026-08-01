// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
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
        render(<ContextualEdgeToolbar edge={createEdge()} onUpdateEdge={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'edgeToolbar.addLabel' }));

        expect(screen.getByRole('textbox', { name: 'edgeToolbar.labelInput' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'edgeToolbar.confirm' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'edgeToolbar.cancel' })).toBeTruthy();
    });

    it('gives every edge property control a field-specific accessible name', () => {
        render(
            <PropertyPanel
                selectedNodes={[]}
                selectedEdges={[createEdge()]}
                onUpdateNodes={vi.fn()}
                onUpdateEdges={vi.fn()}
                docked
            />,
        );

        expect(screen.getByRole('textbox', { name: 'propertyPanel.label' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'propertyPanel.lineType' })).toBeTruthy();
        expect(screen.getByRole('spinbutton', { name: 'propertyPanel.cornerRadius' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'propertyPanel.style' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'propertyPanel.strokeColor' })).toBeTruthy();
        expect(screen.getByRole('spinbutton', { name: 'propertyPanel.lineWidth' })).toBeTruthy();
        expect(screen.getByRole('combobox', { name: 'propertyPanel.arrowHead' })).toBeTruthy();
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
