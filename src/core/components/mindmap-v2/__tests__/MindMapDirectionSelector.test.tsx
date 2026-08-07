// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapDirectionSelector } from '../MindMapDirectionSelector';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
});

const DirectionSelectorHarness = () => {
    const [open, setOpen] = useState(false);
    return (
        <MindMapDirectionSelector
            currentDirection="LR"
            open={open}
            onChange={vi.fn()}
            onOpenChange={setOpen}
        />
    );
};

describe('MindMapDirectionSelector', () => {
    it('includes the current direction in the combobox name', () => {
        render(
            <MindMapDirectionSelector
                currentDirection="L"
                open={false}
                onChange={vi.fn()}
                onOpenChange={vi.fn()}
            />,
        );

        expect(screen.getByRole('combobox', { name: '思维导图布局方向，当前向左展开' })).toBeTruthy();
    });

    it('opens from the keyboard and exposes user-facing option names', async () => {
        render(<DirectionSelectorHarness />);
        const combo = screen.getByRole('combobox', { name: '思维导图布局方向，当前双向展开' });

        fireEvent.keyDown(combo, { key: 'Enter', keyCode: 13 });

        expect((await screen.findByRole('option', { name: '双向展开' })).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('option', { name: '向右展开' })).toBeTruthy();
        expect(screen.getByRole('option', { name: '向左展开' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'LR' })).toBeNull();
    });
});
