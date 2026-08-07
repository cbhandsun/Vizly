// @vitest-environment jsdom

import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PageScopedPluginCanvas } from '../PageScopedPluginCanvas';
import type { PluginContext } from '../../../types/plugin';

const context = {
    getNodes: () => [],
    getEdges: () => [],
    nodes: [],
    edges: [],
} as unknown as PluginContext;

const pageCanvas = (canvas: React.ReactNode) => () => canvas;

describe('PageScopedPluginCanvas', () => {
    it('loads from the committed page snapshot instead of a stale context getter', () => {
        const staleContext = {
            ...context,
            getNodes: () => [{ id: 'stale' }],
        } as unknown as PluginContext;
        const restoredNode = { id: 'restored', position: { x: 0, y: 0 }, data: {} };

        const { getByText } = render(
            <PageScopedPluginCanvas
                pageScope="page-2:1"
                context={staleContext}
                nodes={[restoredNode]}
                edges={[]}
                renderCanvas={pageContext => <div>{pageContext.getNodes()[0]?.id}</div>}
            />,
        );

        expect(getByText('restored')).not.toBeNull();
    });

    it('waits for restored page data before mounting the plugin canvas', () => {
        const onMount = vi.fn();
        const PluginCanvas = () => {
            useEffect(() => {
                onMount();
            }, []);
            return <div>plugin canvas</div>;
        };

        const { rerender, queryByText } = render(
            <PageScopedPluginCanvas
                pageScope="page-2:1"
                ready={false}
                context={context}
                nodes={[]}
                edges={[]}
                renderCanvas={pageCanvas(<PluginCanvas />)}
            />,
        );
        expect(queryByText('plugin canvas')).toBeNull();
        expect(onMount).not.toHaveBeenCalled();

        rerender(
            <PageScopedPluginCanvas
                pageScope="page-2:1"
                ready
                context={context}
                nodes={[]}
                edges={[]}
                renderCanvas={pageCanvas(<PluginCanvas />)}
            />,
        );

        expect(queryByText('plugin canvas')).not.toBeNull();
        expect(onMount).toHaveBeenCalledTimes(1);
    });

    it('remounts plugin-owned canvas state when the page operation scope changes', () => {
        const onMount = vi.fn();
        const onUnmount = vi.fn();
        const PluginCanvas = () => {
            useEffect(() => {
                onMount();
                return onUnmount;
            }, []);
            return <div>plugin canvas</div>;
        };

        const { rerender } = render(
            <PageScopedPluginCanvas
                pageScope="page-1:0"
                context={context}
                nodes={[]}
                edges={[]}
                renderCanvas={pageCanvas(<PluginCanvas />)}
            />,
        );

        rerender(
            <PageScopedPluginCanvas
                pageScope="page-2:1"
                context={context}
                nodes={[]}
                edges={[]}
                renderCanvas={pageCanvas(<PluginCanvas />)}
            />,
        );

        expect(onUnmount).toHaveBeenCalledTimes(1);
        expect(onMount).toHaveBeenCalledTimes(2);
    });

    it('preserves the plugin subtree when only the parent rerenders', () => {
        const onMount = vi.fn();
        const PluginCanvas = ({ label }: { label: string }) => {
            useEffect(() => {
                onMount();
            }, []);
            return <div>{label}</div>;
        };

        const { rerender } = render(
            <PageScopedPluginCanvas
                pageScope="page-1:0"
                context={context}
                nodes={[]}
                edges={[]}
                renderCanvas={pageCanvas(<PluginCanvas label="before" />)}
            />,
        );
        rerender(
            <PageScopedPluginCanvas
                pageScope="page-1:0"
                context={context}
                nodes={[]}
                edges={[]}
                renderCanvas={pageCanvas(<PluginCanvas label="after" />)}
            />,
        );

        expect(onMount).toHaveBeenCalledTimes(1);
    });
});
