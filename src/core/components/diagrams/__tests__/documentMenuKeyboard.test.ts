// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
    DOCUMENT_MENU_OVERLAY_CLASS,
    focusFirstEnabledDocumentMenuItem,
    shouldCloseDocumentMenuFromKey,
    shouldOpenDocumentMenuFromKey,
} from '../documentMenuKeyboard';

describe('documentMenuKeyboard', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('recognizes the commercial menu open and close keys', () => {
        expect(shouldOpenDocumentMenuFromKey('ArrowDown')).toBe(true);
        expect(shouldOpenDocumentMenuFromKey('Enter')).toBe(false);
        expect(shouldCloseDocumentMenuFromKey('Escape')).toBe(true);
        expect(shouldCloseDocumentMenuFromKey('Tab')).toBe(false);
    });

    it('focuses the first enabled item and safely handles empty menus', () => {
        document.body.innerHTML = `
            <div class="${DOCUMENT_MENU_OVERLAY_CLASS}">
                <button role="menuitem" aria-disabled="true">不可用</button>
                <button role="menuitem">演示</button>
            </div>
        `;

        expect(focusFirstEnabledDocumentMenuItem(document)).toBe(true);
        expect(document.activeElement?.textContent).toBe('演示');

        document.body.innerHTML = `<div class="${DOCUMENT_MENU_OVERLAY_CLASS}" />`;
        expect(focusFirstEnabledDocumentMenuItem(document)).toBe(false);
    });
});
