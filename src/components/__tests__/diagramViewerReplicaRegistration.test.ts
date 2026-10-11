import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDiagramViewerCloudReplica } from '../diagramViewerReplicaRegistration';

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), registerRemoteDiagram: vi.fn() }));
vi.mock('@/data/DataRegistry', () => ({ dataRegistry: {
  initialize: mocks.initialize, getDataService: () => ({ registerRemoteDiagram: mocks.registerRemoteDiagram }),
} }));

describe('saved replica local registration', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it.each(['supabase', 's3'] as const)('retains saved content and authoritative %s metadata for the next mount', async provider => {
    const content = { nodes: [], metadata: { cloud: { id: 'old' } } };
    await registerDiagramViewerCloudReplica({ id: 'copy', title: 'Saved copy', content, provider, revision: 'revision' });
    expect(mocks.initialize).toHaveBeenCalledOnce();
    expect(mocks.registerRemoteDiagram).toHaveBeenCalledWith(content, { id: 'copy', title: 'Saved copy' }, true, {
      id: 'copy', name: 'Saved copy', isReadonly: false,
      metadata: { title: 'Saved copy', cloud: { provider, id: 'copy', title: 'Saved copy', revision: 'revision' } },
    });
  });
  it('propagates persistent registration failure so navigation cannot report success', async () => {
    mocks.registerRemoteDiagram.mockRejectedValue(new Error('controlled write failure'));
    await expect(registerDiagramViewerCloudReplica({ id: 'copy', title: 'Copy', provider: 'supabase', content: {} }))
      .rejects.toThrow('controlled write failure');
  });
});
