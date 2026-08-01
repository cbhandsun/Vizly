// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
    focusFirstEnabledDiagramContextMenuItem,
    shouldCloseDiagramContextMenuFromKey,
} from '../diagramContextMenuKeyboard';

describe('diagramContextMenuKeyboard', () => {
    it('focuses the first enabled menu item and skips disabled entries', () => {
        const root = document.createElement('div');
        root.innerHTML = `
            <button role="menuitem" aria-disabled="true">Disabled</button>
            <button role="menuitem">First enabled</button>
            <button role="menuitem">Second enabled</button>
        `;
        document.body.appendChild(root);

        expect(focusFirstEnabledDiagramContextMenuItem(root)).toBe(true);
        expect(document.activeElement?.textContent).toBe('First enabled');

        root.remove();
    });

    it('fails safely for missing roots and menus without enabled items', () => {
        const root = document.createElement('div');
        root.innerHTML = '<button role="menuitem" aria-disabled="true">Disabled</button>';

        expect(focusFirstEnabledDiagramContextMenuItem(null)).toBe(false);
        expect(focusFirstEnabledDiagramContextMenuItem(root)).toBe(false);
    });

    it('only treats Escape as the close key', () => {
        expect(shouldCloseDiagramContextMenuFromKey('Escape')).toBe(true);
        expect(shouldCloseDiagramContextMenuFromKey('Enter')).toBe(false);
        expect(shouldCloseDiagramContextMenuFromKey('Esc')).toBe(false);
    });
});
