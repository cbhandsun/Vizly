// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showPresentationHUD, usePresentationMode } from '../MindMapPresentationMode';

const labels = {
    toolbar: 'Presentation controls',
    previous: 'Previous topic',
    next: 'Next topic',
    exit: 'Exit presentation',
};

describe('MindMapPresentationMode HUD', () => {
    afterEach(() => {
        document.getElementById('me-presentation-hud')?.remove();
        document.getElementById('presentation-host')?.remove();
        cleanup();
        vi.unstubAllGlobals();
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

    it('renders touch-friendly localized navigation actions with boundary states', () => {
        const actions = {
            onPrevious: vi.fn(),
            onNext: vi.fn(),
            onExit: vi.fn(),
        };
        showPresentationHUD('Quarterly plan', 0, 4, document.body, actions, labels);

        const hud = document.getElementById('me-presentation-hud');
        const buttons = Array.from(hud?.querySelectorAll('button') ?? []);

        expect(hud?.getAttribute('role')).toBe('toolbar');
        expect(hud?.getAttribute('aria-label')).toBe('Presentation controls');
        expect(hud?.querySelector('.hud-counter')?.textContent).toBe('1 / 4');
        expect(hud?.querySelector('.hud-topic')?.textContent).toBe('Quarterly plan');
        expect(buttons.map(button => button.textContent)).toEqual([
            'Previous topic',
            'Next topic',
            'Exit presentation',
        ]);
        expect(buttons[0]?.disabled).toBe(true);
        expect(buttons[1]?.disabled).toBe(false);

        buttons[1]?.click();
        buttons[2]?.click();
        expect(actions.onNext).toHaveBeenCalledOnce();
        expect(actions.onExit).toHaveBeenCalledOnce();
    });

    it('disables next navigation at the final topic', () => {
        showPresentationHUD('Done', 2, 3, document.body, {
            onPrevious: vi.fn(),
            onNext: vi.fn(),
            onExit: vi.fn(),
        }, labels);

        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#me-presentation-hud button'));
        expect(buttons[0]?.disabled).toBe(false);
        expect(buttons[1]?.disabled).toBe(true);
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

    it('moves focus into touch controls and restores the presentation trigger on exit', () => {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });

        const nodeData: NodeObj = {
            id: 'root',
            topic: 'Overview',
            children: [{ id: 'details', topic: 'Details', children: [] }],
        };
        const topicElements = new Map<string, HTMLElement>([
            ['root', document.createElement('div')],
            ['details', document.createElement('div')],
        ]);
        const selectNode = vi.fn();
        const clearSelection = vi.fn();
        const fakeMind = {
            clearSelection,
            findEle: (id: string) => topicElements.get(id) ?? null,
            getData: () => ({ nodeData }),
            getObjById: (id: string) => id === 'root' ? nodeData : nodeData.children?.[0],
            scrollIntoView: vi.fn(),
            selectNode,
        } as unknown as MindElixirInstance;

        const host = document.createElement('div');
        host.id = 'presentation-host';
        Object.defineProperty(host, 'requestFullscreen', {
            configurable: true,
            value: vi.fn().mockResolvedValue(undefined),
        });
        document.body.appendChild(host);

        const trigger = document.createElement('button');
        trigger.textContent = 'Present';
        document.body.appendChild(trigger);
        const priorFocus = document.createElement('button');
        priorFocus.textContent = 'Prior focus';
        document.body.appendChild(priorFocus);
        priorFocus.focus();

        const onStop = vi.fn();
        const { result, unmount } = renderHook(() => usePresentationMode(
            fakeMind,
            onStop,
            undefined,
            { containerId: host.id, labels, returnFocusTarget: () => trigger },
        ));

        act(() => result.current.start());

        const hud = document.getElementById('me-presentation-hud');
        expect(document.activeElement).toBe(hud);
        expect(selectNode).toHaveBeenCalledWith(topicElements.get('root'));

        const next = hud?.querySelectorAll<HTMLButtonElement>('button')[1];
        act(() => next?.click());
        expect(hud?.querySelector('.hud-topic')?.textContent).toBe('Details');
        expect(selectNode).toHaveBeenLastCalledWith(topicElements.get('details'));
        expect(document.activeElement?.getAttribute('data-presentation-action')).toBe('exit');

        const exit = hud?.querySelectorAll<HTMLButtonElement>('button')[2];
        act(() => exit?.click());
        expect(document.getElementById('me-presentation-hud')).toBeNull();
        expect(document.activeElement).toBe(trigger);
        expect(clearSelection).toHaveBeenCalledOnce();
        expect(onStop).toHaveBeenCalledOnce();

        unmount();
        priorFocus.remove();
        trigger.remove();
    });
});
