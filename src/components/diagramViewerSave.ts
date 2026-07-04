type DiagramBridgeLike = {
  id: string;
  name?: string;
  nodes?: unknown[];
  metadata?: Record<string, any>;
};

type CloudProviderLike = {
  isConfigured: () => boolean;
  saveDiagram: (payload: {
    id: string;
    title: string;
    content: any;
    updated_at: string;
    user_id: string;
  }) => Promise<void>;
};

export const isDiagramViewerBridgeSavable = (bridge: DiagramBridgeLike | null | undefined): boolean => (
  Boolean(bridge && Array.isArray(bridge.nodes) && bridge.nodes.length >= 0)
);

export const createDiagramViewerSaveCopy = ({
  bridge,
  name,
  createId,
}: {
  bridge: DiagramBridgeLike & Record<string, any>;
  name: string;
  createId: () => string;
}) => ({
  ...bridge,
  id: createId(),
  name,
  metadata: {
    ...(bridge.metadata || {}),
    title: name,
  },
});

export const syncDiagramViewerBridgeCloudReplica = ({
  bridge,
  provider,
  id,
  title,
}: {
  bridge: DiagramBridgeLike & Record<string, any>;
  provider: string;
  id: string;
  title: string;
}) => {
  bridge.id = id;
  bridge.name = title;
  bridge.metadata = {
    ...(bridge.metadata || {}),
    cloud: { provider, id, title },
  };
};

export const saveDiagramViewerCloudReplica = async ({
  bridge,
  selectedDiagramId,
  providerName,
  title,
  getProvider,
  attachSnapshot,
  invalidatePreview,
  createId,
}: {
  bridge: DiagramBridgeLike & Record<string, any>;
  selectedDiagramId: string;
  providerName: 's3' | 'supabase';
  title: string;
  getProvider: (provider: 's3' | 'supabase') => Promise<CloudProviderLike>;
  attachSnapshot: (diagram: any, selectedDiagramId: string) => Promise<{ diagram: any }>;
  invalidatePreview: (id: string) => void;
  createId: () => string;
}) => {
  const saveCopy = createDiagramViewerSaveCopy({
    bridge,
    name: title,
    createId,
  });
  const snapshot = await attachSnapshot(saveCopy, selectedDiagramId);
  const provider = await getProvider(providerName);
  if (!provider.isConfigured()) {
    throw new Error(`${providerName} 驱动未配置`);
  }

  await provider.saveDiagram({
    id: saveCopy.id,
    title,
    content: { ...snapshot.diagram, id: saveCopy.id, name: title } as any,
    updated_at: new Date().toISOString(),
    user_id: 'anonymous',
  });

  invalidatePreview(saveCopy.id);
  syncDiagramViewerBridgeCloudReplica({
    bridge,
    provider: providerName,
    id: saveCopy.id,
    title,
  });

  return saveCopy.id;
};

export const saveDiagramViewerDirectCloud = async ({
  bridge,
  selectedDiagramId,
  getProvider,
  attachSnapshot,
  invalidatePreview,
}: {
  bridge: DiagramBridgeLike & Record<string, any>;
  selectedDiagramId: string;
  getProvider: (provider: string) => Promise<CloudProviderLike>;
  attachSnapshot: (diagram: any, selectedDiagramId: string) => Promise<{ diagram: any }>;
  invalidatePreview: (id: string) => void;
}) => {
  const cloudMeta = bridge?.metadata?.cloud;
  if (!cloudMeta?.provider || !cloudMeta?.title) {
    return null;
  }

  const snapshot = await attachSnapshot(bridge, selectedDiagramId);
  const provider = await getProvider(String(cloudMeta.provider));
  const targetId = cloudMeta.id || bridge.id;
  await provider.saveDiagram({
    id: targetId,
    title: cloudMeta.title,
    content: { ...snapshot.diagram, id: targetId } as any,
    updated_at: new Date().toISOString(),
    user_id: 'anonymous',
  });
  invalidatePreview(targetId);
  return {
    provider: String(cloudMeta.provider),
    id: targetId,
    title: String(cloudMeta.title),
  };
};
