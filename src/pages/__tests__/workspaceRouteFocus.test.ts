// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { scheduleWorkspaceRouteFocus } from '../workspaceRouteFocus';

afterEach(() => {
  document.body.replaceChildren();
});

describe('scheduleWorkspaceRouteFocus', () => {
  it('focuses the connected workspace route target without scrolling', () => {
    const target = document.createElement('main');
    target.tabIndex = -1;
    document.body.append(target);
    const focus = vi.spyOn(target, 'focus');
    const scheduledCallbacks: FrameRequestCallback[] = [];
    const scheduleFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledCallbacks.push(callback);
      return 42;
    });
    const cancelFrame = vi.fn();

    const cancel = scheduleWorkspaceRouteFocus(
      () => target,
      scheduleFrame,
      cancelFrame,
    );
    const scheduledCallback = scheduledCallbacks[0];
    if (!scheduledCallback) throw new Error('Expected workspace focus to be scheduled');
    scheduledCallback(0);

    expect(document.activeElement).toBe(target);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    cancel();
    expect(cancelFrame).toHaveBeenCalledWith(42);
  });

  it('ignores an empty or disconnected target', () => {
    const scheduleFrame = (callback: FrameRequestCallback) => {
      callback(0);
      return 7;
    };
    const disconnected = document.createElement('main');

    expect(() => scheduleWorkspaceRouteFocus(() => null, scheduleFrame, vi.fn())).not.toThrow();
    expect(() => scheduleWorkspaceRouteFocus(() => disconnected, scheduleFrame, vi.fn())).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the programmatic main-landmark focus visually neutral', () => {
    const workspaceCss = readFileSync(
      resolve(process.cwd(), 'src/pages/WorkspaceDashboard.css'),
      'utf8',
    );

    expect(workspaceCss).toMatch(
      /\.workspace-main:focus\s*\{[\s\S]*?outline:\s*none;/,
    );
  });
});
