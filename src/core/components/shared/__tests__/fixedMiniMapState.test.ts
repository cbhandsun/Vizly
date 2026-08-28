// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { MinimapCollapseControl } from '../MinimapCollapseControl';
import {
    getFixedMiniMapPanDelta,
    parseFixedMiniMapKeyboardCommand,
} from '../fixedMiniMapKeyboard';
import {
    resolveFixedMiniMapMessage,
    shouldFreezeFixedMiniMapDuringNodeDrag,
} from '../fixedMiniMapState';

const CollapseControlHarness = () => {
    const [isMinimized, setIsMinimized] = useState(false);
    return createElement(MinimapCollapseControl, {
        expandLabel: '展开小地图',
        isMinimized,
        minimizeLabel: '最小化小地图',
        onToggle: () => setIsMinimized(previous => !previous),
    });
};

describe('resolveFixedMiniMapMessage', () => {
    it('distinguishes loading, empty, invalid, and renderable states', () => {
        expect(resolveFixedMiniMapMessage({ ready: false, nodeCount: 0, hasBounds: false })).toBe('loading');
        expect(resolveFixedMiniMapMessage({ ready: true, nodeCount: 0, hasBounds: false })).toBe('empty');
        expect(resolveFixedMiniMapMessage({ ready: true, nodeCount: 2, hasBounds: false })).toBe('loading');
        expect(resolveFixedMiniMapMessage({ ready: true, nodeCount: 2, hasBounds: true })).toBeNull();
    });

    it('freezes the expensive node preview only between active drag frames', () => {
        expect(shouldFreezeFixedMiniMapDuringNodeDrag({
            wasDragging: true,
            isDragging: true,
        })).toBe(true);
        expect(shouldFreezeFixedMiniMapDuringNodeDrag({
            wasDragging: false,
            isDragging: true,
        })).toBe(false);
        expect(shouldFreezeFixedMiniMapDuringNodeDrag({
            wasDragging: true,
            isDragging: false,
        })).toBe(false);
    });

    it('keeps the drag freeze style scoped to the minimap portal', () => {
        const stylesheet = readFileSync(
            resolve(process.cwd(), 'src/core/components/shared/FixedMiniMap.css'),
            'utf8',
        );

        expect(stylesheet).toMatch(
            /\.fixed-minimap-container\.drag-frozen\s*\{[^}]*opacity:\s*0\.35;[^}]*pointer-events:\s*none;/s,
        );
    });
});

describe('MinimapCollapseControl', () => {
    it('keeps collapse and restore keyboard reachable with continuous focus', async () => {
        render(createElement(CollapseControlHarness));

        const minimizeButton = screen.getByRole('button', { name: '最小化小地图' });
        minimizeButton.focus();
        fireEvent.click(minimizeButton);

        const expandButton = screen.getByRole('button', { name: '展开小地图' });
        await waitFor(() => expect(document.activeElement).toBe(expandButton));
        expect(expandButton.tagName).toBe('BUTTON');

        fireEvent.click(expandButton);
        const restoredMinimizeButton = screen.getByRole('button', { name: '最小化小地图' });
        await waitFor(() => expect(document.activeElement).toBe(restoredMinimizeButton));
    });
});

describe('fixed minimap keyboard navigation', () => {
    it('maps supported spatial navigation and zoom keys', () => {
        expect(parseFixedMiniMapKeyboardCommand('ArrowLeft')).toBe('pan-left');
        expect(parseFixedMiniMapKeyboardCommand('ArrowRight')).toBe('pan-right');
        expect(parseFixedMiniMapKeyboardCommand('ArrowUp')).toBe('pan-up');
        expect(parseFixedMiniMapKeyboardCommand('ArrowDown')).toBe('pan-down');
        expect(parseFixedMiniMapKeyboardCommand('+')).toBe('zoom-in');
        expect(parseFixedMiniMapKeyboardCommand('=')).toBe('zoom-in');
        expect(parseFixedMiniMapKeyboardCommand('-')).toBe('zoom-out');
        expect(parseFixedMiniMapKeyboardCommand('_')).toBe('zoom-out');
        expect(parseFixedMiniMapKeyboardCommand('0')).toBe('reset-zoom');
    });

    it('ignores unrelated and malformed key values', () => {
        expect(parseFixedMiniMapKeyboardCommand('Enter')).toBeNull();
        expect(parseFixedMiniMapKeyboardCommand('')).toBeNull();
        expect(parseFixedMiniMapKeyboardCommand(null)).toBeNull();
        expect(parseFixedMiniMapKeyboardCommand({ key: 'ArrowLeft' })).toBeNull();
    });

    it('moves by ten percent of the visible canvas or fifty percent with the large step', () => {
        expect(getFixedMiniMapPanDelta({ command: 'pan-left', canvasWidth: 800, canvasHeight: 600 }))
            .toEqual({ x: 80, y: 0 });
        expect(getFixedMiniMapPanDelta({ command: 'pan-down', canvasWidth: 800, canvasHeight: 600 }))
            .toEqual({ x: 0, y: -60 });
        expect(getFixedMiniMapPanDelta({
            command: 'pan-right',
            canvasWidth: 800,
            canvasHeight: 600,
            largeStep: true,
        })).toEqual({ x: -400, y: 0 });
    });

    it('coerces invalid canvas dimensions to a finite safe step', () => {
        expect(getFixedMiniMapPanDelta({
            command: 'pan-up',
            canvasWidth: Number.POSITIVE_INFINITY,
            canvasHeight: 0,
        })).toEqual({ x: 0, y: 0.1 });
        expect(getFixedMiniMapPanDelta({
            command: 'zoom-in',
            canvasWidth: 800,
            canvasHeight: 600,
        })).toBeNull();
    });

    it('wires the minimap surface as a focusable two-dimensional keyboard control', () => {
        const source = readFileSync(
            resolve(process.cwd(), 'src/core/components/shared/FixedMiniMap.tsx'),
            'utf8',
        );
        const styles = readFileSync(
            resolve(process.cwd(), 'src/core/components/shared/FixedMiniMap.css'),
            'utf8',
        );

        expect(source).toMatch(/role="application"[\s\S]*?tabIndex=\{0\}/);
        expect(source).toContain('aria-describedby={navigationInstructionsId}');
        expect(source).toContain('aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0"');
        expect(source).toContain('onKeyDown={nav.handleMiniMapKeyDown}');
        expect(styles).toMatch(/\[role="application"\]:focus-visible[\s\S]*?outline:/);
    });

    it('does not synchronously reread UI scale while rendering viewport frames', () => {
        const source = readFileSync(
            resolve(process.cwd(), 'src/core/components/shared/FixedMiniMap.tsx'),
            'utf8',
        );

        expect(source).toContain('const uiScale = useMemo(getUiScale, []);');
        expect(source).toContain('useMinimapNavigation(anchorRef, minimapRef, viewportForRender, readUiScale)');
        expect(source).not.toContain('const renderUiScale = getUiScale();');
    });
});
