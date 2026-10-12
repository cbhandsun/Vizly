import * as Y from 'yjs';
import { applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { describe, expect, it, vi } from 'vitest';
import { createCollaborationAwareness } from '../collaborationAwareness';

describe('owned presence transport', () => {
  it('coalesces 60Hz cursor changes, publishes the final state and cancels timers on destruction', () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const awareness = createCollaborationAwareness(doc);
    const states: unknown[] = [];
    awareness.on('update', () => states.push(awareness.getLocalState()?.cursor));
    try {
      for (let frame = 0; frame < 60; frame++) {
        awareness.setLocalStateField('cursor', { x: frame, y: frame });
        vi.advanceTimersByTime(16);
      }
      vi.advanceTimersByTime(200);
      expect(states.length).toBeLessThanOrEqual(6);
      expect(states.at(-1)).toEqual({ x: 59, y: 59 });
      awareness.setLocalStateField('cursor', { x: 99, y: 99 });
      doc.destroy();
      const count = states.length;
      vi.advanceTimersByTime(1000);
      expect(states).toHaveLength(count);
    } finally { doc.destroy(); vi.useRealTimers(); }
  });

  it('removes presence immediately even when a cursor update is pending', () => {
    vi.useFakeTimers();
    const doc = new Y.Doc();
    const awareness = createCollaborationAwareness(doc);
    const update = vi.fn();
    awareness.on('update', update);
    try {
      awareness.setLocalStateField('cursor', { x: 1, y: 2 });
      awareness.setLocalStateField('cursor', { x: 3, y: 4 });
      awareness.setLocalState(null);
      expect(update).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1000);
      expect(update).toHaveBeenCalledTimes(2);
    } finally { doc.destroy(); vi.useRealTimers(); }
  });
  it('publishes local presence and removal updates', () => {
    const doc = new Y.Doc();
    const awareness = createCollaborationAwareness(doc);
    const update = vi.fn();
    awareness.on('update', update);
    awareness.setLocalStateField('user', { name: 'Local', color: '#0ea5e9' });
    awareness.setLocalState(null);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.every(call => call[1] === 'local')).toBe(true);
    doc.destroy();
  });

  it('retains remote presence and UI changes without echoing another client identity', () => {
    const localDoc = new Y.Doc();
    const remoteDoc = new Y.Doc();
    const local = createCollaborationAwareness(localDoc);
    const remote = createCollaborationAwareness(remoteDoc);
    const transport = vi.fn();
    const change = vi.fn();
    local.on('update', transport);
    local.on('change', change);
    remote.setLocalStateField('cursor', { x: 10, y: 20 });
    applyAwarenessUpdate(local, encodeAwarenessUpdate(remote, [remote.clientID]), 'remote-socket');
    expect(local.getStates().get(remote.clientID)?.cursor).toEqual({ x: 10, y: 20 });
    expect(change).toHaveBeenCalledTimes(1);
    expect(transport).not.toHaveBeenCalled();
    remote.setLocalState(null);
    applyAwarenessUpdate(local, encodeAwarenessUpdate(remote, [remote.clientID]), 'remote-socket');
    expect(local.getStates().has(remote.clientID)).toBe(false);
    expect(transport).not.toHaveBeenCalled();
    localDoc.destroy(); remoteDoc.destroy();
  });
});
