// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { showPresentationHUD } from '../MindMapPresentationMode';

describe('MindMapPresentationMode HUD', () => {
    afterEach(() => {
        document.getElementById('me-presentation-hud')?.remove();
    });

    it('renders node topics as text instead of executable HTML', () => {
        const topic = '<img src=x onerror="window.__xss = true"> Roadmap';

        showPresentationHUD(topic, 0, 3);

        const hud = document.getElementById('me-presentation-hud');
        const topicNode = hud?.querySelector('.hud-topic');

        expect(hud).not.toBeNull();
        expect(hud?.querySelector('img')).toBeNull();
        expect(topicNode?.textContent).toBe(topic);
        expect(topicNode?.innerHTML).toContain('&lt;img');
    });

    it('keeps counter and keyboard controls intact', () => {
        showPresentationHUD('Quarterly plan', 1, 4);

        const hud = document.getElementById('me-presentation-hud');
        const keys = Array.from(hud?.querySelectorAll('kbd') ?? []).map(key => key.textContent);

        expect(hud?.querySelector('.hud-counter')?.textContent).toBe('2 / 4');
        expect(hud?.querySelector('.hud-topic')?.textContent).toBe('Quarterly plan');
        expect(keys).toEqual(['←', '→', 'Esc']);
    });

    it('mounts the HUD inside the presentation host so fullscreen keeps it visible', () => {
        const presentationHost = document.createElement('div');
        presentationHost.id = 'presentation-host';
        document.body.appendChild(presentationHost);

        showPresentationHUD('Launch plan', 0, 1, presentationHost);

        const hud = document.getElementById('me-presentation-hud');
        expect(hud?.parentElement).toBe(presentationHost);

        presentationHost.remove();
    });
});
