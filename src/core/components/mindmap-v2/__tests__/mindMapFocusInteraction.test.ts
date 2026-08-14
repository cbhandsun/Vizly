// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { shouldExitMindMapFocusOnEscape } from '../mindMapFocusInteraction';

const candidate = (target: EventTarget | null, overrides: Partial<{
    key: string;
    defaultPrevented: boolean;
}> = {}) => ({
    key: overrides.key ?? 'Escape',
    target,
    defaultPrevented: overrides.defaultPrevented ?? false,
});

describe('shouldExitMindMapFocusOnEscape', () => {
    it('accepts an unclaimed Escape from ordinary application controls', () => {
        const button = document.createElement('button');

        expect(shouldExitMindMapFocusOnEscape(candidate(button))).toBe(true);
        expect(shouldExitMindMapFocusOnEscape(candidate(null))).toBe(true);
    });

    it('preserves Escape for text editing, selection, and nested editable descendants', () => {
        const input = document.createElement('input');
        const textarea = document.createElement('textarea');
        const select = document.createElement('select');
        const editor = document.createElement('div');
        editor.setAttribute('contenteditable', 'plaintext-only');
        const editorChild = document.createElement('span');
        editor.append(editorChild);

        for (const target of [input, textarea, select, editor, editorChild]) {
            expect(shouldExitMindMapFocusOnEscape(candidate(target))).toBe(false);
        }
    });

    it('lets dialogs, menus, listboxes, and already-handled events close first', () => {
        for (const role of ['dialog', 'menu', 'listbox']) {
            const surface = document.createElement('div');
            surface.setAttribute('role', role);
            const child = document.createElement('button');
            surface.append(child);
            expect(shouldExitMindMapFocusOnEscape(candidate(child))).toBe(false);
        }

        const preserved = document.createElement('div');
        preserved.dataset.preserveDialogOnEscape = 'true';
        expect(shouldExitMindMapFocusOnEscape(candidate(preserved))).toBe(false);
        expect(shouldExitMindMapFocusOnEscape(candidate(document.body, { defaultPrevented: true }))).toBe(false);
        expect(shouldExitMindMapFocusOnEscape(candidate(document.body, { key: 'Enter' }))).toBe(false);
    });
});
