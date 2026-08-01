// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { bindIconRailEscapeClose } from '../iconRailKeyboard';

describe('bindIconRailEscapeClose', () => {
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
});
