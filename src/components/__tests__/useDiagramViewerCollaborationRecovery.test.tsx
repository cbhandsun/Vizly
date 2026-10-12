import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ retry: vi.fn(), inspect: vi.fn(), recover: vi.fn(), copy: vi.fn(), ready: true,
  remote: null as null | ((snapshot: { nodes: []; edges: [] }) => boolean), replace: vi.fn() }));
vi.mock('@vizly/core/collaboration', () => ({ resolveDiagramCollaborationStatus: () => 'disconnected' }));
vi.mock('@vizly/core/diagram-data', () => ({ getFlowDataBridge: () => ({ isCanvasReady: () => fixture.ready, replaceCanvasSnapshot: fixture.replace }) }));
vi.mock('../diagramViewerRecoveryCopy', () => ({ saveDiagramViewerRecoveryCopy: fixture.copy }));
vi.mock('../diagrams/collaboration/collaborationRecoveryClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../diagrams/collaboration/collaborationRecoveryClient')>();
  return { ...actual, createCollaborationRecoveryClient: () => ({ inspect: fixture.inspect, recover: fixture.recover }) };
});
vi.mock('../diagrams/collaboration/YjsProviderHooks', () => ({ useYjsCollaboration: (options: { onRemoteSnapshot: typeof fixture.remote }) => {
  fixture.remote = options.onRemoteSnapshot;
  return { coordinationProblem: 'cloud-conflict', isSynced: false, accessRole: 'editor', wsStatus: 'disconnected', activeUsers: [], provider: null, retryCollaboration: fixture.retry, pushLocalChangesToYjs: vi.fn() };
} }));
import { useDiagramViewerCollaboration } from '../useDiagramViewerCollaboration';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const options = (selectedDiagramId = id) => ({ selectedDiagramId, jwtToken: 'synthetic-owner', roomFromUrl: null });
describe('viewer recovery ownership and editor freeze lifecycle', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks(); fixture.ready = true;
    vi.stubEnv('VITE_YJS_WEBSOCKET_URL', 'ws://127.0.0.1:5422');
    fixture.inspect.mockResolvedValue({ sha256: 'a'.repeat(64), bytes: 2, revision: '2026-10-09T02:04:07.212Z' });
    fixture.copy.mockResolvedValue('durable-copy'); fixture.recover.mockResolvedValue(undefined);
  });
  it('freezes before copying, retains the freeze until the accepted remote canvas is committed, then permits offline editing again', async () => {
    const hook = renderHook(() => useDiagramViewerCollaboration(options()));
    fixture.copy.mockImplementation(async () => { expect(hook.result.current.isCollaborationReadOnly).toBe(true); return 'durable-copy'; });
    await act(async () => { await hook.result.current.restoreCloudRoom(); });
    expect(hook.result.current.isCollaborationReadOnly).toBe(true); expect(fixture.retry).toHaveBeenCalledOnce();
    fixture.ready = false;
    act(() => { expect(fixture.remote?.({ nodes: [], edges: [] })).toBe(false); });
    expect(hook.result.current.isCollaborationReadOnly).toBe(true);
    fixture.ready = true;
    act(() => { expect(fixture.remote?.({ nodes: [], edges: [] })).toBe(true); });
    expect(hook.result.current.isCollaborationReadOnly).toBe(false);
  });
  it('restores editability when durable copy fails and never submits recovery', async () => {
    const hook = renderHook(() => useDiagramViewerCollaboration(options())); fixture.copy.mockRejectedValue(new Error('Synthetic write failure'));
    await act(async () => { await expect(hook.result.current.restoreCloudRoom()).rejects.toThrow(); });
    expect(hook.result.current.isCollaborationReadOnly).toBe(false); expect(fixture.recover).not.toHaveBeenCalled(); expect(fixture.retry).not.toHaveBeenCalled();
  });
  it('cancels a pending operation when switching diagrams', async () => {
    let finish: (id: string) => void = () => { throw new Error('Not initialized'); };
    fixture.copy.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const hook = renderHook(props => useDiagramViewerCollaboration(props), { initialProps: options() });
    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => { pending = hook.result.current.restoreCloudRoom().catch(error => error); await Promise.resolve(); });
    hook.rerender(options('cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
    await act(async () => { finish('durable-copy'); expect(await pending).toMatchObject({ code: 'cancelled' }); });
    expect(fixture.recover).not.toHaveBeenCalled(); expect(fixture.retry).not.toHaveBeenCalled(); expect(hook.result.current.isCollaborationReadOnly).toBe(false);
  });
  it('creates a fresh controller after StrictMode effect replay', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const hook = renderHook(() => useDiagramViewerCollaboration(options()), { wrapper });
    await act(async () => { await hook.result.current.restoreCloudRoom(); });
    expect(fixture.recover).toHaveBeenCalledOnce(); expect(fixture.retry).toHaveBeenCalledOnce();
  });
});
