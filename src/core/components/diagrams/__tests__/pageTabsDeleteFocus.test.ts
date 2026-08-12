// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { schedulePageTabsDeleteFocus } from '../pageTabsDeleteFocus';

describe('schedulePageTabsDeleteFocus', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.restoreAllMocks();
    });

    it('waits for the confirmation dialog to leave the DOM before restoring focus', async () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        const trigger = document.createElement('button');
        const dialog = document.createElement('div');
        document.body.append(trigger, dialog);

        const request = schedulePageTabsDeleteFocus({
            dialog,
            observerRoot: document.body,
            resolvePrimaryTarget: () => trigger,
            resolveFallbackTarget: () => null,
        });

        expect(request).not.toBeNull();
        expect(frames).toHaveLength(0);
        dialog.remove();
        await Promise.resolve();
        expect(frames).toHaveLength(1);
        frames.shift()?.(0);
        expect(document.activeElement).toBe(trigger);
    });

    it('falls back to the active page tab when the delete trigger disappears', async () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        const trigger = document.createElement('button');
        const activeTab = document.createElement('button');
        const dialog = document.createElement('div');
        document.body.append(trigger, activeTab, dialog);

        schedulePageTabsDeleteFocus({
            dialog,
            observerRoot: document.body,
            resolvePrimaryTarget: () => trigger,
            resolveFallbackTarget: () => activeTab,
        });
        trigger.remove();
        dialog.remove();
        await Promise.resolve();
        frames.shift()?.(0);
        frames.shift()?.(16);

        expect(document.activeElement).toBe(activeTab);
    });

    it('waits one render frame for a remounted delete trigger before using the tab fallback', async () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        const activeTab = document.createElement('button');
        const dialog = document.createElement('div');
        document.body.append(activeTab, dialog);
        let remountedTrigger: HTMLButtonElement | null = null;

        schedulePageTabsDeleteFocus({
            dialog,
            observerRoot: document.body,
            resolvePrimaryTarget: () => remountedTrigger,
            resolveFallbackTarget: () => activeTab,
        });
        dialog.remove();
        await Promise.resolve();
        frames.shift()?.(0);
        remountedTrigger = document.createElement('button');
        document.body.append(remountedTrigger);
        frames.shift()?.(16);

        expect(document.activeElement).toBe(remountedTrigger);
    });

    it('does not restore stale focus after cancellation', async () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(callback);
            return frames.length;
        });
        const trigger = document.createElement('button');
        const dialog = document.createElement('div');
        document.body.append(trigger, dialog);

        const request = schedulePageTabsDeleteFocus({
            dialog,
            observerRoot: document.body,
            resolvePrimaryTarget: () => trigger,
            resolveFallbackTarget: () => null,
        });
        request?.cancel();
        dialog.remove();
        await Promise.resolve();

        expect(frames).toHaveLength(0);
        expect(document.activeElement).not.toBe(trigger);
    });
});
