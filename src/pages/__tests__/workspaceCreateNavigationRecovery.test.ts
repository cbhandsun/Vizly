// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { observeWorkspaceCreateNavigationReturn } from '../workspaceCreateNavigationRecovery';

describe('workspace creation navigation recovery', () => {
  it('recovers an already persisted creation when lazy editor navigation is cancelled', () => {
    const events = new EventTarget();
    let hash = '#/?diagram=created-id';
    const recover = vi.fn();
    const dispose = observeWorkspaceCreateNavigationReturn({ events, currentHash: () => hash, isNavigationPending: () => true, recover });
    events.dispatchEvent(new Event('hashchange'));
    expect(recover).not.toHaveBeenCalled();
    hash = '#/manage?view=local';
    events.dispatchEvent(new Event('hashchange'));
    expect(recover).toHaveBeenCalledOnce();
    dispose();
    events.dispatchEvent(new Event('hashchange'));
    expect(recover).toHaveBeenCalledOnce();
  });

  it.each(['', '#/management', '#/manage/other', '#/?diagram=created-id'])('does not release for unrelated or malformed route %s', hash => {
    const events = new EventTarget();
    const recover = vi.fn();
    const dispose = observeWorkspaceCreateNavigationReturn({ events, currentHash: () => hash, isNavigationPending: () => true, recover });
    events.dispatchEvent(new Event('hashchange'));
    expect(recover).not.toHaveBeenCalled();
    dispose();
  });

  it('preserves the lock while persistence is still pending', () => {
    const events = new EventTarget();
    const recover = vi.fn();
    const dispose = observeWorkspaceCreateNavigationReturn({ events, currentHash: () => '#/manage', isNavigationPending: () => false, recover });
    events.dispatchEvent(new Event('hashchange'));
    expect(recover).not.toHaveBeenCalled();
    dispose();
  });
});
