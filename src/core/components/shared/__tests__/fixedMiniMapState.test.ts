// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, useState } from 'react';
import { describe, expect, it } from 'vitest';

import { MinimapCollapseControl } from '../MinimapCollapseControl';
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
