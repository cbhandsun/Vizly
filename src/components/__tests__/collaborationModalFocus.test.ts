// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureCollaborationModalFocus,
  restoreCollaborationModalFocus,
  scheduleCollaborationModalFocusRestore,
} from '../collaborationModalFocus';

describe('collaboration modal focus recovery', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('captures the persistent document trigger when the active menu item will unmount', () => {
    const trigger = document.createElement('button');
    trigger.dataset.collaborationFocusReturn = 'true';
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const menuItem = document.createElement('button');
    menuItem.setAttribute('role', 'menuitem');
    menu.appendChild(menuItem);
    document.body.append(trigger, menu);
    menuItem.focus();

    expect(captureCollaborationModalFocus()).toBe(trigger);
  });

  it('restores a still-connected non-menu launch target', () => {
    const launchButton = document.createElement('button');
    document.body.appendChild(launchButton);

    expect(restoreCollaborationModalFocus(launchButton)).toBe(true);
    expect(document.activeElement).toBe(launchButton);
  });

  it('falls back to the document trigger when the captured target was removed', () => {
    const removedTarget = document.createElement('button');
    const trigger = document.createElement('button');
    trigger.dataset.collaborationFocusReturn = 'true';
    document.body.append(removedTarget, trigger);
    removedTarget.remove();

    expect(restoreCollaborationModalFocus(removedTarget)).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('waits for both the modal and dropdown portals to finish closing', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    scheduleCollaborationModalFocusRestore(trigger);
    expect(document.activeElement).not.toBe(trigger);
    callbacks.shift()?.(0);
    expect(document.activeElement).not.toBe(trigger);
    callbacks.shift()?.(0);
    expect(document.activeElement).toBe(trigger);
  });
});
