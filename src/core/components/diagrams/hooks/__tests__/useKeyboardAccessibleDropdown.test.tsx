// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardAccessibleDropdown } from '../useKeyboardAccessibleDropdown';

interface HarnessProps {
    disabledFirst?: boolean;
    empty?: boolean;
    onActivate?: () => void;
    onBeforeOpen?: () => void;
    radioItems?: boolean;
}

const Harness: React.FC<HarnessProps> = ({
    disabledFirst = false,
    empty = false,
    onActivate,
    onBeforeOpen,
    radioItems = false,
}) => {
    const {
        open,
        triggerRef,
        handleMenuKeyDown,
        handleOpenChange,
        handleTriggerKeyDown,
    } = useKeyboardAccessibleDropdown({
        overlayClassName: 'test-menu-overlay',
        onBeforeOpen,
        preferredItemSelector: radioItems
            ? '[role="menuitemradio"][aria-checked="true"]'
            : undefined,
    });

    const activate = () => {
        onActivate?.();
        handleOpenChange(false, { source: 'menu' });
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => handleOpenChange(!open, { source: 'trigger' })}
                onKeyDown={handleTriggerKeyDown}
            >
                操作
            </button>
            {open && (
                <div className="test-menu-overlay">
                    <ul role="menu" onKeyDown={handleMenuKeyDown}>
                        {!empty && (
                            <>
                                <li
                                    role={radioItems ? 'menuitemradio' : 'menuitem'}
                                    tabIndex={-1}
                                    aria-checked={radioItems ? false : undefined}
                                    aria-disabled={disabledFirst || undefined}
                                    onClick={disabledFirst ? undefined : activate}
                                >
                                    第一项
                                </li>
                                <li
                                    role={radioItems ? 'menuitemradio' : 'menuitem'}
                                    tabIndex={-1}
                                    aria-checked={radioItems ? true : undefined}
                                    onClick={activate}
                                >
                                    第二项
                                </li>
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

    it('prepares dynamic menu state before keyboard and pointer opening', () => {
        const onBeforeOpen = vi.fn();
        render(<Harness onBeforeOpen={onBeforeOpen} />);
        const trigger = screen.getByRole('button', { name: '操作' });

        fireEvent.keyDown(trigger, { key: 'Enter' });
        expect(onBeforeOpen).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
        fireEvent.click(trigger);
        expect(onBeforeOpen).toHaveBeenCalledTimes(2);
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

    it('activates the focused item with Space and restores focus after the menu closes', async () => {
        const onActivate = vi.fn();
        render(<Harness onActivate={onActivate} />);
        const trigger = screen.getByRole('button', { name: '操作' });

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const firstItem = await screen.findByRole('menuitem', { name: '第一项' });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));

        fireEvent.keyDown(firstItem, { key: ' ' });

        expect(onActivate).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(screen.queryByRole('menu')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('focuses and activates the checked radio item', async () => {
        const onActivate = vi.fn();
        render(<Harness radioItems onActivate={onActivate} />);
        const trigger = screen.getByRole('button', { name: '操作' });

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const checkedItem = await screen.findByRole('menuitemradio', { name: '第二项' });
        expect(checkedItem.getAttribute('aria-checked')).toBe('true');
        await waitFor(() => expect(document.activeElement).toBe(checkedItem));

        fireEvent.keyDown(checkedItem, { key: ' ' });

        expect(onActivate).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(screen.queryByRole('menu')).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
    });

    it('does not steal focus when a menu action moves it to a dialog control', async () => {
        render(<Harness onActivate={() => document.getElementById('dialog-action')?.focus()} />);
        const dialogAction = document.createElement('button');
        dialogAction.id = 'dialog-action';
        document.body.appendChild(dialogAction);

        const trigger = screen.getByRole('button', { name: '操作' });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        const firstItem = await screen.findByRole('menuitem', { name: '第一项' });
        await waitFor(() => expect(document.activeElement).toBe(firstItem));

        fireEvent.click(firstItem);

        await waitFor(() => expect(document.activeElement).toBe(dialogAction));
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
