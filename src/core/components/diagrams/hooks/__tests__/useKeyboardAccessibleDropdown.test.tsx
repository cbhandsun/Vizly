// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeyboardAccessibleDropdown } from '../useKeyboardAccessibleDropdown';

interface HarnessProps {
    disabledFirst?: boolean;
    empty?: boolean;
}

const Harness: React.FC<HarnessProps> = ({ disabledFirst = false, empty = false }) => {
    const {
        open,
        triggerRef,
        handleMenuKeyDown,
        handleTriggerKeyDown,
    } = useKeyboardAccessibleDropdown({ overlayClassName: 'test-menu-overlay' });

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onKeyDown={handleTriggerKeyDown}
            >
                操作
            </button>
            {open && (
                <div className="test-menu-overlay">
                    <ul role="menu" onKeyDown={handleMenuKeyDown}>
                        {!empty && (
                            <>
                                <li role="menuitem" tabIndex={-1} aria-disabled={disabledFirst || undefined}>
                                    第一项
                                </li>
                                <li role="menuitem" tabIndex={-1}>第二项</li>
                            </>
                        )}
                    </ul>
                </div>
            )}
        </>
    );
};

describe('useKeyboardAccessibleDropdown', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it.each(['ArrowDown', 'Enter', ' '])('opens with %s and focuses the first enabled item', async key => {
        render(<Harness />);
        const trigger = screen.getByRole('button', { name: '操作' });

        fireEvent.keyDown(trigger, { key });

        const firstItem = await screen.findByRole('menuitem', { name: '第一项' });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('skips disabled items and restores trigger focus after Escape', async () => {
        render(<Harness disabledFirst />);
        const trigger = screen.getByRole('button', { name: '操作' });

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        const secondItem = await screen.findByRole('menuitem', { name: '第二项' });
        await waitFor(() => expect(document.activeElement).toBe(secondItem));

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByRole('menu')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('ignores unrelated keys and safely handles an empty menu', async () => {
        const view = render(<Harness />);
        const trigger = screen.getByRole('button', { name: '操作' });
        trigger.focus();

        fireEvent.keyDown(trigger, { key: 'Tab' });
        expect(screen.queryByRole('menu')).toBeNull();

        view.unmount();
        render(<Harness empty />);
        const emptyTrigger = screen.getByRole('button', { name: '操作' });
        emptyTrigger.focus();
        fireEvent.keyDown(emptyTrigger, { key: 'Enter' });

        expect(await screen.findByRole('menu')).toBeTruthy();
        await waitFor(() => expect(document.activeElement).toBe(emptyTrigger));
    });
});
