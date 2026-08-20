// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { isolatePresentationAccessibility } from '../presentationAccessibilityIsolation';

describe('presentation accessibility isolation', () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it('isolates editor chrome and canvas controls while preserving presentation controls', () => {
        const shell = document.createElement('div');
        const header = document.createElement('header');
        const editor = document.createElement('main');
        const host = document.createElement('div');
        const canvas = document.createElement('div');
        const speakerNotes = document.createElement('aside');
        const hud = document.createElement('div');

        host.id = 'presentation-host';
        hud.id = 'me-presentation-hud';
        speakerNotes.dataset.presentationAccessible = 'true';
        host.append(canvas, speakerNotes, hud);
        editor.appendChild(host);
        shell.append(header, editor);
        document.body.appendChild(shell);

        const restore = isolatePresentationAccessibility(host);

        expect(header.hasAttribute('inert')).toBe(true);
        expect(canvas.hasAttribute('inert')).toBe(true);
        expect(speakerNotes.hasAttribute('inert')).toBe(false);
        expect(hud.hasAttribute('inert')).toBe(false);

        restore();
        expect(header.hasAttribute('inert')).toBe(false);
        expect(canvas.hasAttribute('inert')).toBe(false);
    });

    it('restores pre-existing inert state exactly and makes cleanup idempotent', () => {
        const shell = document.createElement('div');
        const preserved = document.createElement('div');
        const host = document.createElement('div');
        preserved.setAttribute('inert', 'legacy');
        shell.append(preserved, host);
        document.body.appendChild(shell);

        const restore = isolatePresentationAccessibility(host);
        expect(preserved.getAttribute('inert')).toBe('');

        restore();
        restore();
        expect(preserved.getAttribute('inert')).toBe('legacy');
    });

    it('is a safe no-op for a missing or detached host', () => {
        const detached = document.createElement('div');

        expect(() => isolatePresentationAccessibility(null)()).not.toThrow();
        expect(() => isolatePresentationAccessibility(detached)()).not.toThrow();
        expect(detached.hasAttribute('inert')).toBe(false);
    });
});
