import { describe, expect, it } from 'vitest';
import { getSafeMindMapShortcutAction } from '../mindmapKeyboardSecurity';

describe('mindmapKeyboardSecurity', () => {
    it('maps node-creating shortcuts to safe actions', () => {
        expect(getSafeMindMapShortcutAction({ key: 'Tab' })).toBe('addChild');
        expect(getSafeMindMapShortcutAction({ key: 'Enter' })).toBe('insertSiblingAfter');
        expect(getSafeMindMapShortcutAction({ key: 'Enter', shiftKey: true })).toBe('insertSiblingBefore');
        expect(getSafeMindMapShortcutAction({ key: 'Enter', ctrlKey: true })).toBe('insertParent');
        expect(getSafeMindMapShortcutAction({ key: 'Enter', metaKey: true })).toBe('insertParent');
    });

    it('leaves non-node shortcuts and browser/system chords alone', () => {
        expect(getSafeMindMapShortcutAction({ key: 'F2' })).toBeNull();
        expect(getSafeMindMapShortcutAction({ key: 'Delete' })).toBeNull();
        expect(getSafeMindMapShortcutAction({ key: 'Tab', ctrlKey: true })).toBeNull();
        expect(getSafeMindMapShortcutAction({ key: 'Enter', altKey: true })).toBeNull();
        expect(getSafeMindMapShortcutAction({ key: 'Enter', isComposing: true })).toBeNull();
    });
});
