import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ bridge: undefined as unknown, enabled: false, role: null as 'editor' | 'viewer' | null }));
vi.mock('@vizly/core/collaboration', () => ({ resolveDiagramCollaborationStatus: (wanted: boolean) => wanted ? 'connecting' : 'disconnected' }));
vi.mock('@vizly/core/diagram-data', () => ({ getFlowDataBridge: () => fixture.bridge }));
vi.mock('../diagrams/collaboration/YjsProviderHooks', () => ({ useYjsCollaboration: (options: { enabled?: boolean }) => {
  fixture.enabled = options.enabled === true;
  return { coordinationProblem: null, isSynced: false, accessRole: fixture.role, wsStatus: 'disconnected', activeUsers: [], provider: null,
    retryCollaboration: vi.fn(), pushLocalChangesToYjs: vi.fn() };
} }));
import { useDiagramViewerCollaboration } from '../useDiagramViewerCollaboration';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const options = (selectedDiagramId = id) => ({ selectedDiagramId, jwtToken: 'synthetic-owner', roomFromUrl: null as string | null });
const bridge = (provider = 'supabase', cloudId = id) => ({ id, metadata: { cloud: { provider, id: cloudId } } });

describe('viewer automatic collaboration requires its actual cloud document', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', 'ws://127.0.0.1:5422');
    fixture.bridge = undefined; fixture.enabled = false; fixture.role = null;
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

  it.each([undefined, { id, metadata: {} }, bridge('s3'), bridge('supabase', other)])('does not auto-connect local, unloaded or unrelated documents', value => {
    fixture.bridge = value;
    const hook = renderHook(() => useDiagramViewerCollaboration(options()));
    expect(fixture.enabled).toBe(false);
    expect(hook.result.current.collaborationStatus).toBe('disconnected');
  });

  it('connects a matching Supabase cloud document', () => {
    fixture.bridge = bridge();
    renderHook(() => useDiagramViewerCollaboration(options()));
    expect(fixture.enabled).toBe(true);
  });

  it('keeps the viewer canvas locked while reconnect authorization is unknown and unlocks only a confirmed editor', () => {
    fixture.bridge = bridge(); fixture.role = 'viewer';
    const hook = renderHook(() => useDiagramViewerCollaboration(options()));
    expect(hook.result.current.isCollaborationReadOnly).toBe(true);
    fixture.role = null; hook.rerender();
    expect(hook.result.current.isCollaborationReadOnly).toBe(true);
    fixture.role = 'viewer'; hook.rerender();
    expect(hook.result.current.isCollaborationReadOnly).toBe(true);
    fixture.role = 'editor'; hook.rerender();
    expect(hook.result.current.isCollaborationReadOnly).toBe(false);
  });

  it('locks the initial unknown cloud identity without locking a local document or a disabled transport', () => {
    const hook = renderHook(() => useDiagramViewerCollaboration(options()));
    expect(hook.result.current.isCollaborationReadOnly).toBe(false);
    act(() => { fixture.bridge = bridge(); vi.advanceTimersByTime(250); });
    expect(hook.result.current.isCollaborationReadOnly).toBe(true);
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', ''); hook.rerender();
    expect(hook.result.current.isCollaborationReadOnly).toBe(false);
  });

  it('does not carry a viewer lock into a different local document', () => {
    fixture.bridge = bridge(); fixture.role = 'viewer';
    const hook = renderHook(props => useDiagramViewerCollaboration(props), { initialProps: options() });
    expect(hook.result.current.isCollaborationReadOnly).toBe(true);
    fixture.bridge = { id: other, metadata: {} }; fixture.role = null;
    hook.rerender(options(other));
    expect(hook.result.current.isCollaborationReadOnly).toBe(false);
  });

  it('observes asynchronous identity loading and later removal without editing the canvas', () => {
    renderHook(() => useDiagramViewerCollaboration(options()));
    expect(fixture.enabled).toBe(false);
    act(() => { fixture.bridge = bridge(); vi.advanceTimersByTime(250); });
    expect(fixture.enabled).toBe(true);
    act(() => { fixture.bridge = { id, metadata: {} }; vi.advanceTimersByTime(250); });
    expect(fixture.enabled).toBe(false);
  });

  it('does not retain cloud demand when switching to a local copy', () => {
    fixture.bridge = bridge();
    const hook = renderHook(props => useDiagramViewerCollaboration(props), { initialProps: options() });
    expect(fixture.enabled).toBe(true);
    fixture.bridge = { id: other, metadata: {} };
    hook.rerender(options(other));
    expect(fixture.enabled).toBe(false);
  });

  it('preserves explicit matching room requests for server authorization', () => {
    renderHook(() => useDiagramViewerCollaboration({ ...options(), roomFromUrl: `vizly-room-${id}` }));
    expect(fixture.enabled).toBe(true);
  });

  it('keeps manual collaboration details available on a local document', () => {
    const hook = renderHook(() => useDiagramViewerCollaboration(options()));
    expect(fixture.enabled).toBe(false);
    act(() => hook.result.current.openCollaborationModal());
    expect(fixture.enabled).toBe(true);
  });

  it('keeps an explicitly started session connected after closing its details and ends it on document change', () => {
    const hook = renderHook(props => useDiagramViewerCollaboration(props), { initialProps: options() });
    act(() => hook.result.current.openCollaborationModal());
    expect(fixture.enabled).toBe(true);
    act(() => hook.result.current.setCollabModalVisible(false));
    expect(hook.result.current.collabModalVisible).toBe(false);
    expect(fixture.enabled).toBe(true);
    hook.rerender(options(other));
    expect(fixture.enabled).toBe(false);
    hook.rerender(options());
    expect(fixture.enabled).toBe(false);
  });

  it('disconnects automatic demand and removes its observer when the transport is unconfigured', () => {
    fixture.bridge = bridge();
    const hook = renderHook(props => useDiagramViewerCollaboration(props), { initialProps: options() });
    expect(fixture.enabled).toBe(true);
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', '');
    hook.rerender(options());
    expect(fixture.enabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves explicit collaboration details and rejects room aliases', () => {
    const hook = renderHook(() => useDiagramViewerCollaboration({ ...options(), roomFromUrl: 'unrelated-room' }));
    act(() => hook.result.current.openCollaborationModal());
    expect(fixture.enabled).toBe(false);
  });

  it('releases its identity observer on unmount and allocates none without a transport', () => {
    const hook = renderHook(() => useDiagramViewerCollaboration(options()));
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', '');
    renderHook(() => useDiagramViewerCollaboration(options()));
    expect(vi.getTimerCount()).toBe(0);
  });
});
