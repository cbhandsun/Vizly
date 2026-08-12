import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    hasDraggingNode,
    resolveFloatingToolbarHorizontalPosition,
} from '../FloatingToolbar/useFloatingPosition';
import { ToolbarOverflow } from '../FloatingToolbar/ToolbarPrimitives';

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

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

describe('ToolbarOverflow repeated actions', () => {
    it('keeps the formatting palette and acted item available for repeated changes', () => {
        const onClick = vi.fn();
        render(React.createElement(ToolbarOverflow, {
            label: 'More actions',
            items: [{ key: 'opacity', icon: null, label: 'Opacity 80%', onClick }],
        }));

        const trigger = screen.getByRole('button', { name: 'More actions' });
        fireEvent.click(trigger);
        const opacityItem = screen.getByRole('menuitem', { name: 'Opacity 80%' });
        opacityItem.focus();
        fireEvent.click(opacityItem);

        expect(onClick).toHaveBeenCalledTimes(1);
        expect(opacityItem).toBe(document.activeElement);
        expect(trigger).toBeTruthy();

        fireEvent.keyDown(opacityItem, { key: 'Escape' });
        expect(screen.queryByRole('menu', { name: 'More actions' })).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });

    it('closes when pointer interaction moves outside the palette', () => {
        render(React.createElement(ToolbarOverflow, {
            label: 'More actions',
            items: [{ key: 'border', icon: null, label: 'Border 1px', onClick: vi.fn() }],
        }));

        fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
        expect(screen.getByRole('menu', { name: 'More actions' })).toBeTruthy();
        fireEvent.pointerDown(document.body);
        expect(screen.queryByRole('menu', { name: 'More actions' })).toBeNull();
    });
});
