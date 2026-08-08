// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { focusAdvancedExportTrigger } from '../advancedExportFocus';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('focusAdvancedExportTrigger', () => {
    it('focuses the stable advanced-export launcher', () => {
        document.body.innerHTML = '<button data-advanced-export-focus-return="true">More actions</button>';

        expect(focusAdvancedExportTrigger()).toBe(true);
        expect(document.activeElement?.textContent).toBe('More actions');
    });

    it('returns false when the launcher is missing', () => {
        expect(focusAdvancedExportTrigger()).toBe(false);
    });

    it('does not focus a disabled launcher', () => {
        document.body.innerHTML = '<button data-advanced-export-focus-return="true" disabled>More actions</button>';

        expect(focusAdvancedExportTrigger()).toBe(false);
        expect(document.activeElement).toBe(document.body);
    });
});
