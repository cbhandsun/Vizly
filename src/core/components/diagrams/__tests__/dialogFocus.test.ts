// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
    bindDialogEscapeClose,
    findExpandedDialogTrigger,
    focusDialogEntry,
    trapDialogTab,
} from '../dialogFocus';

describe('dialog focus helpers', () => {
    it('focuses the preferred entry and falls back to the container when empty', () => {
        const dialog = document.createElement('div');
        dialog.tabIndex = -1;
        dialog.innerHTML = '<button>first</button><button data-dialog-initial-focus="true">preferred</button>';
        document.body.appendChild(dialog);

        expect(focusDialogEntry(dialog)).toBe(true);
        expect(document.activeElement?.textContent).toBe('preferred');

        dialog.replaceChildren();
        expect(focusDialogEntry(dialog)).toBe(true);
        expect(document.activeElement).toBe(dialog);
        dialog.remove();
    });

    it('finds the expanded external trigger without selecting controls inside the dialog', () => {
        const trigger = document.createElement('button');
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-expanded', 'true');
        const dialog = document.createElement('div');
        const internal = document.createElement('button');
        internal.setAttribute('aria-haspopup', 'dialog');
        internal.setAttribute('aria-expanded', 'true');
        dialog.appendChild(internal);
        document.body.append(trigger, dialog);

        expect(findExpandedDialogTrigger(document, dialog)).toBe(trigger);

        trigger.remove();
        expect(findExpandedDialogTrigger(document, dialog)).toBeNull();
        dialog.remove();
    });

    it('wraps focus in both directions and ignores unrelated keys', () => {
        const dialog = document.createElement('div');
        dialog.innerHTML = '<button>first</button><button>last</button>';
        document.body.appendChild(dialog);
        const [first, last] = Array.from(dialog.querySelectorAll('button'));
        const preventDefault = vi.fn();

        last.focus();
        expect(trapDialogTab({ key: 'Tab', shiftKey: false, preventDefault }, dialog)).toBe(true);
        expect(document.activeElement).toBe(first);

        first.focus();
        expect(trapDialogTab({ key: 'Tab', shiftKey: true, preventDefault }, dialog)).toBe(true);
        expect(document.activeElement).toBe(last);

        expect(trapDialogTab({ key: 'ArrowRight', shiftKey: false, preventDefault }, dialog)).toBe(false);
        expect(preventDefault).toHaveBeenCalledTimes(2);
        dialog.remove();
    });

    it('keeps focus on an empty dialog when Tab is pressed', () => {
        const dialog = document.createElement('div');
        dialog.tabIndex = -1;
        document.body.appendChild(dialog);
        const preventDefault = vi.fn();

        expect(trapDialogTab({ key: 'Tab', shiftKey: false, preventDefault }, dialog)).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(dialog);
        dialog.remove();
    });

    it('closes on Escape unless the focused control preserves the dialog', () => {
        const closeDialog = vi.fn();
        const unbind = bindDialogEscapeClose(window, closeDialog);
        const regular = document.createElement('button');
        const preserved = document.createElement('button');
        preserved.setAttribute('data-preserve-dialog-on-escape', 'true');
        document.body.append(regular, preserved);

        regular.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        regular.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        preserved.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(closeDialog).toHaveBeenCalledTimes(1);
        unbind();
        regular.remove();
        preserved.remove();
    });
});
