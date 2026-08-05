// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    bindIconRailEscapeClose,
    focusIconRailDrawerEntry,
    trapIconRailDrawerTab,
} from '../iconRailKeyboard';

describe('bindIconRailEscapeClose', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('closes from capture phase even when a focused input stops bubbling', () => {
        const closeDrawer = vi.fn();
        const input = document.createElement('input');
        input.addEventListener('keydown', event => event.stopPropagation());
        document.body.append(input);

        const unbind = bindIconRailEscapeClose(window, closeDrawer);
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
        }));

        expect(closeDrawer).toHaveBeenCalledTimes(1);

        unbind();
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
        }));
        expect(closeDrawer).toHaveBeenCalledTimes(1);
    });

    it('ignores non-Escape keyboard input', () => {
        const closeDrawer = vi.fn();
        const unbind = bindIconRailEscapeClose(window, closeDrawer);

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

        expect(closeDrawer).not.toHaveBeenCalled();
        unbind();
    });

    it('preserves the drawer when a marked control owns Escape locally', () => {
        const closeDrawer = vi.fn();
        const input = document.createElement('input');
        input.dataset.preserveDrawerOnEscape = 'true';
        document.body.append(input);
        const unbind = bindIconRailEscapeClose(window, closeDrawer);

        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
        }));

        expect(closeDrawer).not.toHaveBeenCalled();
        unbind();
    });

    it('focuses the preferred drawer entry control', () => {
        const drawer = document.createElement('div');
        drawer.tabIndex = -1;
        const secondary = document.createElement('button');
        const preferred = document.createElement('button');
        preferred.dataset.iconRailInitialFocus = 'true';
        drawer.append(secondary, preferred);
        document.body.append(drawer);

        expect(focusIconRailDrawerEntry(drawer)).toBe(true);
        expect(document.activeElement).toBe(preferred);
    });

    it('wraps mobile drawer focus in both directions', () => {
        const drawer = document.createElement('div');
        const first = document.createElement('button');
        const last = document.createElement('button');
        drawer.append(first, last);
        document.body.append(drawer);

        last.focus();
        const forwardPreventDefault = vi.fn();
        expect(trapIconRailDrawerTab({
            key: 'Tab',
            shiftKey: false,
            preventDefault: forwardPreventDefault,
        }, drawer)).toBe(true);
        expect(forwardPreventDefault).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(first);

        const backwardPreventDefault = vi.fn();
        expect(trapIconRailDrawerTab({
            key: 'Tab',
            shiftKey: true,
            preventDefault: backwardPreventDefault,
        }, drawer)).toBe(true);
        expect(backwardPreventDefault).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(last);
    });

    it('keeps focus on an empty drawer and ignores unrelated keys', () => {
        const drawer = document.createElement('div');
        drawer.tabIndex = -1;
        document.body.append(drawer);
        const preventDefault = vi.fn();

        expect(trapIconRailDrawerTab({
            key: 'Enter',
            shiftKey: false,
            preventDefault,
        }, drawer)).toBe(false);
        expect(trapIconRailDrawerTab({
            key: 'Tab',
            shiftKey: false,
            preventDefault,
        }, drawer)).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(drawer);
    });
});
