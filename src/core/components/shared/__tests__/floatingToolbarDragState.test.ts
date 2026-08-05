import { describe, expect, it } from 'vitest';
import {
    hasDraggingNode,
    resolveFloatingToolbarHorizontalPosition,
} from '../FloatingToolbar/useFloatingPosition';

describe('hasDraggingNode', () => {
    it('reads live dragging state from the internal node lookup', () => {
        const externalNodes = [{ dragging: false }];
        const nodeLookup = new Map([
            ['node-1', { dragging: true }],
        ]);

        expect(hasDraggingNode(externalNodes, nodeLookup)).toBe(true);
    });

    it('falls back to external nodes when the lookup has no active drag', () => {
        expect(hasDraggingNode([{ dragging: true }], new Map())).toBe(true);
        expect(hasDraggingNode([{ dragging: false }], new Map())).toBe(false);
        expect(hasDraggingNode([], undefined)).toBe(false);
    });
});

describe('resolveFloatingToolbarHorizontalPosition', () => {
    it('uses CSS variables on desktop without reading computed styles', () => {
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 720,
            viewportWidth: 1440,
        })).toBe(
            'clamp(calc(var(--left-sidebar-offset, 0px) + 176px), 720px, calc(100vw - var(--right-sidebar-offset, 340px) - 176px))',
        );
    });

    it('bounds the toolbar directly on mobile viewports', () => {
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 10,
            viewportWidth: 390,
        })).toBe(176);
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 380,
            viewportWidth: 390,
        })).toBe(214);
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 10,
            viewportWidth: 320,
        })).toBe(160);
    });

    it('reserves a mobile left rail and keeps both toolbar edges reachable', () => {
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 10,
            viewportWidth: 534,
            mobileLeftInset: 60,
        })).toBe(252);
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 520,
            viewportWidth: 534,
            mobileLeftInset: 60,
        })).toBe(342);
        expect(resolveFloatingToolbarHorizontalPosition({
            screenCenterX: 10,
            viewportWidth: 320,
            mobileLeftInset: 60,
        })).toBe(190);
    });
});
