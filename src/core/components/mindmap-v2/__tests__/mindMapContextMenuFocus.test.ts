// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { restoreMindMapContextMenuFocus } from '../mindMapContextMenuFocus';

describe('restoreMindMapContextMenuFocus', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('returns focus to the connected trigger and preserves its tab index', () => {
        const trigger = document.createElement('button');
        trigger.tabIndex = 0;
        const fallback = document.createElement('div');
        document.body.append(trigger, fallback);

        expect(restoreMindMapContextMenuFocus(trigger, fallback)).toBe(true);
        expect(document.activeElement).toBe(trigger);
        expect(trigger.getAttribute('tabindex')).toBe('0');
    });

    it('uses the canvas fallback when the deleted trigger is disconnected', () => {
        const trigger = document.createElement('button');
        const fallback = document.createElement('div');
        document.body.append(fallback);

        expect(restoreMindMapContextMenuFocus(trigger, fallback)).toBe(true);
        expect(document.activeElement).toBe(fallback);
        expect(fallback.getAttribute('tabindex')).toBe('-1');

        fallback.blur();
        expect(fallback.hasAttribute('tabindex')).toBe(false);
    });

    it('does nothing when neither focus destination is connected', () => {
        expect(restoreMindMapContextMenuFocus(
            document.createElement('div'),
            document.createElement('div'),
        )).toBe(false);
    });

    it('preserves an existing fallback tab index', () => {
        const fallback = document.createElement('div');
        fallback.tabIndex = 0;
        document.body.append(fallback);

        expect(restoreMindMapContextMenuFocus(null, fallback)).toBe(true);
        fallback.blur();
        expect(fallback.getAttribute('tabindex')).toBe('0');
    });
});
