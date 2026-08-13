// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flowState = vi.hoisted(() => ({
    edges: [{ id: 'edge-1' }],
    nodes: [
        { id: 'node-1', data: { shape: 'rectangle', domain: 'sales' } },
        { id: 'node-2', data: { shape: 'diamond', domain: 'sales' } },
    ],
    zoom: 1.25,
}));

vi.mock('@xyflow/react', () => ({
    useEdges: () => flowState.edges,
    useNodes: () => flowState.nodes,
    useViewport: () => ({ zoom: flowState.zoom }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            if (!values) return key;
            return `${key} ${Object.values(values).join(' ')}`;
        },
    }),
}));

vi.mock('antd', () => ({
    Button: ({ icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
        <button {...props}>{icon}</button>
    ),
    Divider: () => <span role="separator" />,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { DiagramStatusBar } from '../DiagramStatusBar';

describe('DiagramStatusBar commercial interactions', () => {
    beforeEach(() => {
        flowState.zoom = 1.25;
    });

    it('exposes the mixed status and action surface as a named region', () => {
        render(
            <DiagramStatusBar
                autoRoutingEnabled
                selectedNodesCount={1}
                selectedEdgesCount={0}
                onFitView={vi.fn()}
            />,
        );

        expect(screen.getByRole('region', { name: 'designer.statusBar.label' })).toBeTruthy();
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByText('125%')).toBeTruthy();
    });

    it('uses native pressed buttons for snap and annotation toggles', () => {
        const onToggleSnap = vi.fn();
        const onToggleAnnotation = vi.fn();
        render(
            <DiagramStatusBar
                autoRoutingEnabled
                selectedNodesCount={0}
                selectedEdgesCount={0}
                onFitView={vi.fn()}
                snapToGrid
                onToggleSnap={onToggleSnap}
                annotationMode={false}
                onToggleAnnotation={onToggleAnnotation}
                annotationCount={3}
            />,
        );

        const snap = screen.getByRole('button', { name: 'designer.statusBar.snapEnabled' });
        const annotation = screen.getByRole('button', { name: 'designer.statusBar.annotationDisabled' });
        expect(snap.getAttribute('aria-pressed')).toBe('true');
        expect(annotation.getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByText('designer.statusBar.annotationCount 3')).toBeTruthy();

        fireEvent.click(snap);
        fireEvent.click(annotation);
        expect(onToggleSnap).toHaveBeenCalledTimes(1);
        expect(onToggleAnnotation).toHaveBeenCalledTimes(1);
    });

    it('omits unavailable toggle actions instead of exposing inert controls', () => {
        render(
            <DiagramStatusBar
                autoRoutingEnabled={false}
                selectedNodesCount={0}
                selectedEdgesCount={0}
                onFitView={vi.fn()}
            />,
        );

        expect(screen.queryByRole('button', { name: /designer\.statusBar\.snap/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /designer\.statusBar\.annotation/ })).toBeNull();
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });
});
