// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import PresentationMode from '../../presentation/PresentationMode';
import {
    buildPresentationEdgeSelector,
    buildPresentationNodeSelector,
} from '../../presentation/presentationSelectorSafety';
import { generateSlides } from '../../../hooks/usePresentationSlides';

describe('PresentationMode', () => {
    const slides = [
        { id: 'one', title: '概览', notes: '第一页', nodeIds: ['a'], containerIds: [] },
        { id: 'two', title: '详情', notes: '第二页', nodeIds: ['b'], containerIds: [] },
    ];

    it('exposes named controls and never renders internal debug identifiers', () => {
        render(<PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={vi.fn()} />);

        expect(screen.getByRole('dialog', { name: '演示模式' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '上一页' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '下一页' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '退出演示' })).toBeTruthy();
        expect(screen.queryByText(/\[Debug\]/)).toBeNull();
    });

    it('supports page controls and Escape exit', () => {
        const onExit = vi.fn();
        render(<PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={onExit} />);

        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        expect(screen.getByText('详情')).toBeTruthy();
        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('does not hijack the native Space activation of presentation buttons', () => {
        const onExit = vi.fn();
        render(<PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={onExit} />);

        const exit = screen.getByRole('button', { name: '退出演示' });
        fireEvent.keyDown(exit, { key: ' ' });

        expect(screen.getByText('概览')).toBeTruthy();
        expect(onExit).not.toHaveBeenCalled();
        fireEvent.click(exit);
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('clamps navigation when regenerated slides shrink', () => {
        const onFocusNodes = vi.fn();
        const { rerender } = render(
            <PresentationMode slides={slides} onFocusNodes={onFocusNodes} onExit={vi.fn()} />,
        );
        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        expect(screen.getByText('详情')).toBeTruthy();

        rerender(
            <PresentationMode slides={[slides[0]]} onFocusNodes={onFocusNodes} onExit={vi.fn()} />,
        );

        expect(screen.getByRole('dialog', { name: '演示模式' })).toBeTruthy();
        expect(screen.getByText('概览')).toBeTruthy();
        expect(screen.getByRole('progressbar', { name: '演示进度' }).getAttribute('aria-valuetext'))
            .toBe('第 1 页，共 1 页');
        expect(onFocusNodes).toHaveBeenLastCalledWith(['a']);
    });

    it('requests a recoverable exit when regenerated slides become empty', async () => {
        const onExit = vi.fn();
        const { rerender } = render(
            <PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={onExit} />,
        );

        rerender(<PresentationMode slides={[]} onFocusNodes={vi.fn()} onExit={onExit} />);

        await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('dialog', { name: '演示模式' })).toBeNull();
    });

    it('focuses only when the active slide changes, not when the callback identity changes', () => {
        const firstFocus = vi.fn();
        const nextFocus = vi.fn();
        const { rerender } = render(
            <PresentationMode slides={slides} onFocusNodes={firstFocus} onExit={vi.fn()} />,
        );

        expect(firstFocus).toHaveBeenCalledTimes(1);
        expect(firstFocus).toHaveBeenLastCalledWith(['a']);

        rerender(<PresentationMode slides={slides} onFocusNodes={nextFocus} onExit={vi.fn()} />);

        expect(firstFocus).toHaveBeenCalledTimes(1);
        expect(nextFocus).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        expect(nextFocus).toHaveBeenCalledTimes(1);
        expect(nextFocus).toHaveBeenLastCalledWith(['b']);
    });

    it('returns focus to the persistent document trigger after exit', () => {
        const transientTrigger = document.createElement('button');
        const focusTarget = document.createElement('button');
        focusTarget.dataset.presentationFocusReturn = '';
        document.body.append(transientTrigger, focusTarget);
        transientTrigger.focus();

        const onExit = vi.fn();
        const { unmount } = render(
            <PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={onExit} />,
        );
        transientTrigger.remove();
        fireEvent.click(screen.getByRole('button', { name: '退出演示' }));
        expect(onExit).toHaveBeenCalledTimes(1);
        unmount();

        expect(document.activeElement).toBe(focusTarget);
        focusTarget.remove();
    });

    it('moves focus into the dialog, traps it, and restores the trigger on unmount', () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        const { unmount } = render(
            <PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={vi.fn()} />,
        );

        const exit = screen.getByRole('button', { name: '退出演示' });
        const next = screen.getByRole('button', { name: '下一页' });
        expect(document.activeElement).toBe(exit);

        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(next);
        fireEvent.keyDown(window, { key: 'Tab' });
        expect(document.activeElement).toBe(exit);

        unmount();
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it('announces slide changes and exposes page progress semantics', () => {
        render(<PresentationMode slides={slides} onFocusNodes={vi.fn()} onExit={vi.fn()} />);

        const progress = screen.getByRole('progressbar', { name: '演示进度' });
        expect(progress.getAttribute('aria-valuenow')).toBe('1');
        expect(progress.getAttribute('aria-valuetext')).toBe('第 1 页，共 2 页');

        fireEvent.click(screen.getByRole('button', { name: '下一页' }));
        expect(progress.getAttribute('aria-valuenow')).toBe('2');
        expect(screen.getByText('详情').getAttribute('aria-live')).toBe('polite');
    });

    it('does not generate a presentation for an empty canvas', () => {
        expect(generateSlides([])).toEqual([]);
    });

    it('escapes imported node identifiers before building presentation selectors', () => {
        const unsafeId = 'node"] { body { display: none } } /*\\\n\u0000';
        const nodeSelector = buildPresentationNodeSelector(unsafeId);
        const edgeSelector = buildPresentationEdgeSelector(unsafeId);

        expect(nodeSelector).not.toContain('[data-id="node"]');
        expect(nodeSelector).toContain('node\\"]');
        expect(nodeSelector).toContain('\\\\');
        expect(nodeSelector).toContain('\\a ');
        expect(nodeSelector).toContain('\\fffd ');
        expect(edgeSelector).toContain('[data-source="node\\"]');
        expect(edgeSelector).toContain('[data-target="node\\"]');
    });

    it('keeps exit, navigation, and slide targets touch sized', () => {
        const css = readFileSync(
            'src/core/components/presentation/PresentationMode.css',
            'utf8',
        );

        expect(css).toMatch(/\.presentation-exit[\s\S]*?width: var\(--commercial-touch-target, 44px\);[\s\S]*?height: var\(--commercial-touch-target, 44px\);/);
        expect(css).toMatch(/\.presentation-nav-btn[\s\S]*?width: var\(--commercial-touch-target, 44px\);[\s\S]*?height: var\(--commercial-touch-target, 44px\);/);
        expect(css).toMatch(/\.presentation-dot[\s\S]*?width: var\(--commercial-touch-target, 44px\);[\s\S]*?height: var\(--commercial-touch-target, 44px\);/);
    });
});
