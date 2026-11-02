import { configureApplicationTelemetry } from '@/observability/applicationTelemetry';
import { createOperationTelemetry } from '@/observability/operationTelemetry';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import * as Y from 'yjs';
import type { Node } from '@xyflow/react';
import { createCollaborationServer } from '../../../../../server/collaboration/server';
import { publishCollaborationElement, readCollaborationElement } from '../../../../../server/collaboration/documentModel';

const flow = vi.hoisted(() => ({ setNodes: vi.fn(), setEdges: vi.fn() }));
vi.mock('@xyflow/react', () => ({ useReactFlow: () => flow }));
import { useYjsCollaboration } from '../YjsProviderHooks';

const diagramId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin = 'http://localhost:5419';
const node = (label: string): Node => ({ id: 'a', position: { x: 1, y: 2 }, data: { label } });
afterEach(() => { vi.unstubAllGlobals(); flow.setNodes.mockClear(); flow.setEdges.mockClear(); });

describe('editor reconnect over real WebSocket transport', () => {
  it('synchronizes an edit committed while disconnected and persists it before remote acceptance', async () => {
    let persisted: Uint8Array | undefined;
    const initial = new Y.Doc();
    publishCollaborationElement(initial.getMap('flowchart-nodes'), 'a', node('Before'));
    const server = createCollaborationServer({
      origins: new Set([origin]),
      authorize: async token => token === 'test-editor' ? { userId: 'synthetic-editor', role: 'editor' } : null,
      bootstrap: async () => Y.encodeStateAsUpdate(initial),
      persistence: { load: async () => persisted ?? null, save: async (_id, state) => { persisted = Uint8Array.from(state); } },
    });
    class Socket extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) { super(address, protocols, { origin }); }
    }
    vi.stubGlobal('WebSocket', Socket);
    const { url } = await server.listen();
    const hook = renderHook(() => useYjsCollaboration({ roomName: `vizly-room-${diagramId}`, serverUrl: url, token: 'test-editor' }));
    try {
      await waitFor(() => expect(hook.result.current).toMatchObject({ isSynced: true, accessRole: 'editor' }));
      act(() => hook.result.current.pushLocalChangesToYjs([node('Before')], []));
      act(() => hook.result.current.provider?.disconnect());
      await waitFor(() => expect(hook.result.current.wsStatus).toBe('disconnected'));
      act(() => hook.result.current.pushLocalChangesToYjs([node('Offline edit retained')], []));
      act(() => hook.result.current.provider?.connect());
      await waitFor(() => {
        expect(hook.result.current.isSynced).toBe(true);
        const accepted = new Y.Doc();
        try {
          expect(persisted).toBeDefined();
          Y.applyUpdate(accepted, persisted!);
          expect(readCollaborationElement(accepted.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'Offline edit retained' });
          expect(flow.setNodes).toHaveBeenLastCalledWith([node('Offline edit retained')]);
        } finally { accepted.destroy(); }
      });
    } finally { hook.unmount(); await server.stop(); initial.destroy(); }
  });

  it('retains pending edits and the same document across hidden-tab token rotation', async () => {
    let persisted: Uint8Array | undefined;
    let visible: DocumentVisibilityState = 'visible';
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible);
    const server = createCollaborationServer({ origins: new Set([origin]),
      authorize: async token => ['old-token', 'new-token'].includes(token) ? { userId: 'synthetic-editor', role: 'editor' } : null,
      persistence: { load: async () => persisted ?? null, save: async (_id, state) => { persisted = Uint8Array.from(state); } },
    });
    class Socket extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) { super(address, protocols, { origin }); }
    }
    vi.stubGlobal('WebSocket', Socket);
    const { url } = await server.listen();
    const hook = renderHook(({ token }) => useYjsCollaboration({ userId: 'synthetic-editor', roomName: `vizly-room-${diagramId}`, serverUrl: url, token }), { initialProps: { token: 'old-token' } });
    try {
      await waitFor(() => expect(hook.result.current.isSynced).toBe(true));
      const provider = hook.result.current.provider!;
      act(() => { visible = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
      await waitFor(() => expect(hook.result.current.wsStatus).toBe('disconnected'));
      act(() => hook.result.current.pushLocalChangesToYjs([node('Retained across refresh')], []));
      hook.rerender({ token: 'new-token' });
      expect(hook.result.current.provider).toBe(provider);
      expect(provider.shouldConnect).toBe(false);
      act(() => { visible = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
      await waitFor(() => {
        expect(hook.result.current.isSynced).toBe(true);
        expect(hook.result.current.provider).toBe(provider);
        const accepted = new Y.Doc();
        try {
          expect(persisted).toBeDefined(); Y.applyUpdate(accepted, persisted!);
          expect(readCollaborationElement(accepted.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'Retained across refresh' });
        } finally { accepted.destroy(); }
      });
      expect(provider.params.token).toBe('new-token');
    } finally { hook.unmount(); visibility.mockRestore(); await server.stop(); }
  });

  it('clears edit permission after the real server revokes an active connection', async () => {
    const telemetry = createOperationTelemetry({ releaseId: 'c'.repeat(64), transport: async () => {} });
    const stopTelemetry = configureApplicationTelemetry(telemetry);
    let authorized = true;
    let persisted: Uint8Array | null = null;
    const initial = new Y.Doc();
    publishCollaborationElement(initial.getMap('flowchart-nodes'), 'a', node('Before'));
    const server = createCollaborationServer({
      origins: new Set([origin]), recheckMs: 20,
      persistence: { load: async () => persisted, save: async (_id, state) => { persisted = Uint8Array.from(state); } },
      authorize: async () => authorized ? { userId: 'synthetic-editor', role: 'editor' } : null,
      bootstrap: async () => Y.encodeStateAsUpdate(initial),
    });
    class Socket extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) { super(address, protocols, { origin }); }
    }
    vi.stubGlobal('WebSocket', Socket);
    const { url } = await server.listen();
    const hook = renderHook(() => useYjsCollaboration({ roomName: `vizly-room-${diagramId}`, serverUrl: url, token: 'test-editor' }));
    try {
      await waitFor(() => expect(hook.result.current).toMatchObject({ isSynced: true, accessRole: 'editor' }));
      authorized = false;
      await waitFor(() => expect(hook.result.current).toMatchObject({ accessRole: null, isSynced: false }));
      expect(hook.result.current.provider?.shouldConnect).toBe(false);
      expect(telemetry.snapshot().metrics.reconnect.failure).toBe(0);
      act(() => hook.result.current.pushLocalChangesToYjs([node('Rejected after revocation')], []));
      const document = hook.result.current.provider!.doc;
      expect(readCollaborationElement(document.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'Before' });
    } finally { hook.unmount(); await server.stop(); initial.destroy(); stopTelemetry(); }
  });

  it('rejects buffered edits when server permission was downgraded during disconnect', async () => {
    let persisted: Uint8Array | undefined;
    let editable = true;
    const initial = new Y.Doc();
    publishCollaborationElement(initial.getMap('flowchart-nodes'), 'a', node('Before'));
    const server = createCollaborationServer({
      origins: new Set([origin]),
      authorize: async token => token === 'test-editor'
        ? { userId: 'synthetic-editor', role: editable ? 'editor' : 'viewer' } : null,
      bootstrap: async () => Y.encodeStateAsUpdate(initial),
      persistence: { load: async () => persisted ?? null, save: async (_id, state) => { persisted = Uint8Array.from(state); } },
    });
    class Socket extends WebSocket {
      constructor(address: string | URL, protocols?: string | string[]) { super(address, protocols, { origin }); }
    }
    vi.stubGlobal('WebSocket', Socket);
    const { url } = await server.listen();
    const hook = renderHook(() => useYjsCollaboration({ roomName: `vizly-room-${diagramId}`, serverUrl: url, token: 'test-editor' }));
    try {
      await waitFor(() => expect(hook.result.current).toMatchObject({ isSynced: true, accessRole: 'editor' }));
      act(() => hook.result.current.pushLocalChangesToYjs([node('Before')], []));
      act(() => hook.result.current.provider?.disconnect());
      await waitFor(() => expect(hook.result.current.wsStatus).toBe('disconnected'));
      act(() => hook.result.current.pushLocalChangesToYjs([node('Buffered but no longer authorized')], []));
      editable = false;
      act(() => hook.result.current.provider?.connect());
      await waitFor(() => expect(hook.result.current.accessRole).toBe('viewer'));
      act(() => hook.result.current.provider?.disconnect());
      const accepted = new Y.Doc();
      try {
        expect(persisted).toBeDefined();
        Y.applyUpdate(accepted, persisted!);
        expect(readCollaborationElement(accepted.getMap('flowchart-nodes').get('a'))?.data).toEqual({ label: 'Before' });
      } finally { accepted.destroy(); }
    } finally { hook.unmount(); await server.stop(); initial.destroy(); }
  });
});
