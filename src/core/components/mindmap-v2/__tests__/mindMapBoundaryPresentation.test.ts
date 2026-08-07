// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    measureMindMapBoundaryRect,
    mindMapBoundaryColorToRgba,
    resolveMindMapBoundaryTarget,
    resolveMindMapContainer,
} from '../mindMapBoundaryPresentation';

describe('mind map boundary presentation boundary', () => {
    it('routes the renderer through the container resolver instead of searching inside itself', () => {
        const source = readFileSync(
            resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapBoundaries.tsx'),
            'utf8',
        );
        expect(source).toContain('resolveMindMapContainer(instance?.container)');
        expect(source).toContain('resolveMindMapContainer(instance.container)');
        expect(source).toContain('scheduleBoundaryUpdate');
        expect(source).toContain('requestAnimationFrame');
        expect(source).not.toContain("instance.container.querySelector('.map-container')");
    });

    it('uses Mind Elixir container directly when it already is the map container', () => {
        const container = document.createElement('div');
        container.className = 'map-container';
        expect(resolveMindMapContainer(container)).toBe(container);
    });

    it('finds a nested map container and rejects missing hosts', () => {
        const host = document.createElement('div');
        const nested = document.createElement('div');
        nested.className = 'map-container';
        host.append(nested);
        expect(resolveMindMapContainer(host)).toBe(nested);
        expect(resolveMindMapContainer(document.createElement('div'))).toBeNull();
        expect(resolveMindMapContainer(null)).toBeNull();
    });

    it('uses the whole map for root boundaries and a wrapper for branch boundaries', () => {
        const nodes = document.createElement('me-nodes');
        const root = document.createElement('me-root');
        const rootTopic = document.createElement('me-tpc');
        root.append(rootTopic);
        nodes.append(root);
        expect(resolveMindMapBoundaryTarget(rootTopic)).toBe(nodes);

        const wrapper = document.createElement('me-wrapper');
        const branchTopic = document.createElement('me-tpc');
        wrapper.append(branchTopic);
        expect(resolveMindMapBoundaryTarget(branchTopic)).toBe(wrapper);
        expect(resolveMindMapBoundaryTarget(document.createElement('me-tpc'))).toBeNull();
    });

    it('measures visual rectangles relative to scaled and scrolled containers', () => {
        const container = document.createElement('div');
        const target = document.createElement('div');
        Object.defineProperties(container, {
            offsetWidth: { value: 500 },
            offsetHeight: { value: 400 },
            scrollLeft: { value: 20 },
            scrollTop: { value: 10 },
        });
        container.getBoundingClientRect = () => ({
            left: 100, top: 50, width: 250, height: 200,
            right: 350, bottom: 250, x: 100, y: 50, toJSON: () => undefined,
        });
        target.getBoundingClientRect = () => ({
            left: 150, top: 100, width: 100, height: 60,
            right: 250, bottom: 160, x: 150, y: 100, toJSON: () => undefined,
        });

        expect(measureMindMapBoundaryRect(container, target, 15)).toEqual({
            x: 105,
            y: 95,
            width: 230,
            height: 150,
        });
    });

    it('preserves black channels, expands shorthand, and clamps alpha', () => {
        expect(mindMapBoundaryColorToRgba('#000000', 0.6)).toBe('rgba(0, 0, 0, 0.6)');
        expect(mindMapBoundaryColorToRgba('#0af', 2)).toBe('rgba(0, 170, 255, 1)');
        expect(mindMapBoundaryColorToRgba('#ffffff', -1)).toBe('rgba(255, 255, 255, 0)');
    });

    it('uses a safe default for malformed colors and alpha values', () => {
        expect(mindMapBoundaryColorToRgba('url(javascript:alert(1))', Number.NaN))
            .toBe('rgba(99, 102, 241, 1)');
        expect(mindMapBoundaryColorToRgba(undefined, undefined)).toBe('rgba(99, 102, 241, 1)');
    });
});
