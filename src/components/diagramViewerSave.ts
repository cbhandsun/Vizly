export type DiagramBridgeLike = {
  id?: string;
  name?: string;
  nodes?: unknown[];
  metadata?: Record<string, unknown>;
} & Record<string, unknown>;

type CloudDiagramPayload = {
  id: string;
  title: string;
  content: Record<string, unknown>;
  updated_at: string;
  user_id: string;
};

type CloudProviderLike = {
  isConfigured: () => boolean;
  saveDiagram: (payload: CloudDiagramPayload) => Promise<unknown>;
};

type DiagramSnapshotAttacher<TDiagram extends DiagramBridgeLike> = (
  diagram: TDiagram,
  selectedDiagramId: string,
) => Promise<{ diagram: unknown }>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export type DiagramViewerCloudProviderName = 's3' | 'supabase';

const parseCloudProviderName = (value: unknown): DiagramViewerCloudProviderName | null => (
  value === 's3' || value === 'supabase' ? value : null
);

const parseRequiredText = (value: unknown, maxLength = 500): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
};

export const normalizeDiagramSaveAsName = (value: unknown): string | null => parseRequiredText(value, 500);

export const isDiagramViewerBridgeSavable = (
  bridge: DiagramBridgeLike | null | undefined,
): bridge is DiagramBridgeLike & { nodes: unknown[] } => (
  Boolean(bridge && Array.isArray(bridge.nodes) && bridge.nodes.length >= 0)
);

export const createDiagramViewerSaveCopy = <TDiagram extends DiagramBridgeLike>({
  bridge,
  name,
  createId,
}: {
  bridge: TDiagram;
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
  bridge: DiagramBridgeLike;
  provider: DiagramViewerCloudProviderName;
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

export const saveDiagramViewerCloudReplica = async <TDiagram extends DiagramBridgeLike>({
  bridge,
  selectedDiagramId,
  providerName,
  title,
  getProvider,
  attachSnapshot,
  invalidatePreview,
  createId,
}: {
  bridge: TDiagram;
  selectedDiagramId: string;
  providerName: DiagramViewerCloudProviderName;
  title: string;
  getProvider: (provider: DiagramViewerCloudProviderName) => Promise<CloudProviderLike>;
  attachSnapshot: DiagramSnapshotAttacher<TDiagram>;
  invalidatePreview: (id: string) => void;
  createId: () => string;
}) => {
  const safeTitle = parseRequiredText(title);
  if (!safeTitle) throw new Error('图表名称无效');

  const saveCopy = createDiagramViewerSaveCopy({
    bridge,
    name: safeTitle,
    createId,
  });
  const snapshot = await attachSnapshot(saveCopy, selectedDiagramId);
  const provider = await getProvider(providerName);
  if (!provider.isConfigured()) {
    throw new Error(`${providerName} 驱动未配置`);
  }

  await provider.saveDiagram({
    id: saveCopy.id,
    title: safeTitle,
    content: { ...asRecord(snapshot.diagram), id: saveCopy.id, name: safeTitle },
    updated_at: new Date().toISOString(),
    user_id: 'anonymous',
  });

  invalidatePreview(saveCopy.id);
  syncDiagramViewerBridgeCloudReplica({
    bridge,
    provider: providerName,
    id: saveCopy.id,
    title: safeTitle,
  });

  return saveCopy.id;
};

export const saveDiagramViewerDirectCloud = async <TDiagram extends DiagramBridgeLike>({
  bridge,
  selectedDiagramId,
  getProvider,
  attachSnapshot,
  invalidatePreview,
}: {
  bridge: TDiagram;
  selectedDiagramId: string;
  getProvider: (provider: DiagramViewerCloudProviderName) => Promise<CloudProviderLike>;
  attachSnapshot: DiagramSnapshotAttacher<TDiagram>;
  invalidatePreview: (id: string) => void;
}) => {
  const cloudMeta = asRecord(bridge.metadata?.cloud);
  if (!cloudMeta?.provider || !cloudMeta?.title) {
    return null;
  }

  const providerName = parseCloudProviderName(cloudMeta.provider);
  const title = parseRequiredText(cloudMeta.title);
  if (!providerName || !title) {
    throw new Error('云端保存元数据无效');
  }

  const snapshot = await attachSnapshot(bridge, selectedDiagramId);
  const provider = await getProvider(providerName);
  const targetId = parseRequiredText(cloudMeta.id)
    || parseRequiredText(bridge.id)
    || selectedDiagramId;
  await provider.saveDiagram({
    id: targetId,
    title,
    content: { ...asRecord(snapshot.diagram), id: targetId },
    updated_at: new Date().toISOString(),
    user_id: 'anonymous',
  });
  invalidatePreview(targetId);
  return {
    provider: providerName,
    id: targetId,
    title,
  };
};
