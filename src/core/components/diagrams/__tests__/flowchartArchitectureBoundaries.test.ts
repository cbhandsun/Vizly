// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { BackgroundVariant } from '@xyflow/react';

import {
    createFlowchartPluginNodeId,
    createStableFlowchartRendererMapResolver,
    normalizeFlowchartPluginNodeData,
    normalizeFlowchartPluginNodeType,
    resolveFlowchartPluginNodePosition,
} from '../flowchartPluginRuntimeModel';
import { coerceFlowchartThemeGridState } from '../hooks/useFlowchartShellState';

describe('flowchart architecture boundaries', () => {
    it('normalizes plugin node types, data, ids, and explicit positions', () => {
        expect(normalizeFlowchartPluginNodeType(' custom:node ')).toBe('custom:node');
        expect(normalizeFlowchartPluginNodeType('unsafe/type')).toBe('custom');
        expect(normalizeFlowchartPluginNodeType(null)).toBe('custom');
        expect(normalizeFlowchartPluginNodeData({ label: 'Node' })).toEqual({ label: 'Node' });
        expect(normalizeFlowchartPluginNodeData(['not-a-record'])).toEqual({});
        expect(createFlowchartPluginNodeId('custom', () => 123, () => 0.5)).toMatch(/^custom-123-[a-z0-9]+$/u);
        expect(resolveFlowchartPluginNodePosition({
            requestedPosition: { x: 10, y: 20 },
            containerWidth: 0,
            containerHeight: 0,
        })).toEqual({ x: 10, y: 20 });
    });

    it('coerces invalid viewport numbers into a finite centered position', () => {
        const position = resolveFlowchartPluginNodePosition({
            requestedPosition: { x: Number.POSITIVE_INFINITY, y: 2 },
            viewport: { x: Number.NaN, y: -20, zoom: 0 },
            containerWidth: 400,
            containerHeight: 200,
        });

        expect(position).toEqual({ x: 150, y: 95 });
        expect(Number.isFinite(position.x)).toBe(true);
        expect(Number.isFinite(position.y)).toBe(true);
    });

    it('keeps plugin renderer maps stable and lets plugins override defaults', () => {
        const loadPluginRenderers = vi.fn(() => ({ custom: 'plugin-custom', pluginNode: 'plugin-node' }));
        const resolveRenderers = createStableFlowchartRendererMapResolver(
            { custom: 'default-custom', base: 'default-base' },
            loadPluginRenderers,
        );
        const plugin = {};

        const first = resolveRenderers(plugin);
        const second = resolveRenderers(plugin);

        expect(first).toBe(second);
        expect(first).toEqual({
            custom: 'plugin-custom',
            base: 'default-base',
            pluginNode: 'plugin-node',
        });
        expect(loadPluginRenderers).toHaveBeenCalledOnce();
    });

    it('coerces known grid styles and rejects invalid theme input', () => {
        expect(coerceFlowchartThemeGridState(' DOTS ')).toEqual({
            showGrid: true,
            gridVariant: BackgroundVariant.Dots,
        });
        expect(coerceFlowchartThemeGridState('hidden')).toEqual({ showGrid: false });
        expect(coerceFlowchartThemeGridState('unknown')).toBeNull();
        expect(coerceFlowchartThemeGridState({ style: 'lines' })).toEqual({
            showGrid: true,
            gridVariant: BackgroundVariant.Lines,
        });
        expect(coerceFlowchartThemeGridState({ style: 123 })).toBeNull();
    });
});
