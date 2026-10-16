import { readSavedDiagramId } from '@/services/cloudSaveIdentity';
import { withVersionPreviewPersistence } from './diagrams/collaboration/versionPreviewSession';
import { assertDesignerSaveReady, isDesignerSaveReady } from '@/services/designerSaveReadiness';
import { assertCloudSaveViewCurrent, captureCloudSaveVersion, readSavedCloudRevision } from '@/services/cloudSaveVersion';

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
  expectedRevision?: string;
};

type CloudProviderLike = {
  isConfigured: () => boolean;
  saveDiagram: (payload: CloudDiagramPayload) => Promise<unknown>;
};

type DiagramSnapshotAttacher<TDiagram extends DiagramBridgeLike> = (
  diagram: TDiagram | ReturnType<typeof createDiagramViewerSaveCopy<TDiagram>>,
  selectedDiagramId: string,
) => Promise<{ diagram: unknown }>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export type DiagramViewerCloudProviderName = 's3' | 'supabase';

export interface DiagramViewerSavedReplica {
  id: string;
  title: string;
  content: Record<string, unknown>;
  provider: DiagramViewerCloudProviderName;
  revision?: string;
}

const parseCloudProviderName = (value: unknown): DiagramViewerCloudProviderName | null => (
  value === 's3' || value === 'supabase' ? value : null
);

const parseRequiredText = (value: unknown, maxLength = 500): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
};

export const DIAGRAM_SAVE_AS_NAME_MAX_LENGTH = 500;

export type DiagramSaveAsNameValidation =
  | { ok: true; value: string }
  | { ok: false; error: 'required' | 'tooLong' };

export const validateDiagramSaveAsName = (
  value: unknown,
  maxLength = DIAGRAM_SAVE_AS_NAME_MAX_LENGTH,
): DiagramSaveAsNameValidation => {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: 'required' };
  }

  const normalizedName = parseRequiredText(value, maxLength);
  return normalizedName
    ? { ok: true, value: normalizedName }
    : { ok: false, error: 'tooLong' };
};

export const normalizeDiagramSaveAsName = (value: unknown): string | null => {
  const validation = validateDiagramSaveAsName(value);
  return validation.ok ? validation.value : null;
};

export const isDiagramViewerBridgeSavable = (
  bridge: DiagramBridgeLike | null | undefined,
): bridge is DiagramBridgeLike & { nodes: unknown[] } => (
  Boolean(bridge && Array.isArray(bridge.nodes) && isDesignerSaveReady(bridge))
);

export const createDiagramViewerSaveCopy = <TDiagram extends DiagramBridgeLike>({
  bridge,
  name,
  createId,
}: {
  bridge: TDiagram;
  name: string;
  createId: () => string;
}): Omit<TDiagram, 'id' | 'name' | 'metadata'> & {
  id: string;
  name: string;
  metadata: Record<string, unknown> & { title: string; cloud?: undefined };
} => {
  assertDesignerSaveReady(bridge);
  return {
    ...bridge,
    id: createId(),
    name,
    metadata: {
      ...(bridge.metadata || {}),
      title: name,
      cloud: undefined,
    },
  };
};

export const syncDiagramViewerBridgeCloudReplica = ({
  bridge,
  provider,
  id,
  title,
  revision,
}: {
  bridge: DiagramBridgeLike;
  provider: DiagramViewerCloudProviderName;
  id: string;
  title: string;
  revision?: string;
}) => {
  bridge.id = id;
  bridge.name = title;
  bridge.metadata = {
    ...(bridge.metadata || {}),
    cloud: { provider, id, title, ...(revision ? { revision } : {}) },
  };
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('vizly:flow-data-bridge-identity'));
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
  prepareReplica,
}: {
  bridge: TDiagram;
  selectedDiagramId: string;
  providerName: DiagramViewerCloudProviderName;
  title: string;
  getProvider: (provider: DiagramViewerCloudProviderName) => Promise<CloudProviderLike>;
  attachSnapshot: DiagramSnapshotAttacher<TDiagram>;
  invalidatePreview: (id: string) => void;
  createId: () => string;
  prepareReplica?: (replica: DiagramViewerSavedReplica) => Promise<void>;
}) => withVersionPreviewPersistence(selectedDiagramId, async assertCurrent => {
  const safeTitle = parseRequiredText(title);
  assertDesignerSaveReady(bridge);
  if (!safeTitle) throw new Error('图表名称无效');
  const capturedId = bridge.id;
  const capturedCloud = bridge.metadata?.cloud;

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

  assertDesignerSaveReady(bridge);
  assertCloudSaveViewCurrent(bridge, capturedId, capturedCloud, undefined);
  assertCurrent();
  const saved = await provider.saveDiagram({
    id: saveCopy.id,
    title: safeTitle,
    content: { ...asRecord(snapshot.diagram), id: saveCopy.id, name: safeTitle },
    updated_at: new Date().toISOString(),
    user_id: 'anonymous',
  });

  const savedId = readSavedDiagramId(saved);
  assertCurrent();
  const revision = readSavedCloudRevision(providerName, saved);
  invalidatePreview(savedId);
  assertCloudSaveViewCurrent(bridge, capturedId, capturedCloud, undefined);
  if (prepareReplica) {
    await prepareReplica({
      id: savedId, title: safeTitle, provider: providerName, revision,
      content: { ...asRecord(snapshot.diagram), id: savedId, name: safeTitle },
    });
    assertCurrent();
    assertCloudSaveViewCurrent(bridge, capturedId, capturedCloud, undefined);
  }
  syncDiagramViewerBridgeCloudReplica({
    bridge,
    provider: providerName,
    id: savedId,
    title: safeTitle,
    revision,
  });

  return savedId;
});

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
}) => withVersionPreviewPersistence(selectedDiagramId, async assertCurrent => {
  const cloudMeta = asRecord(bridge.metadata?.cloud);
  const capturedId = bridge.id;
  const capturedCloud = bridge.metadata?.cloud;
  assertDesignerSaveReady(bridge);
  if (!cloudMeta?.provider || !cloudMeta?.title) {
    return null;
  }

  const providerName = parseCloudProviderName(cloudMeta.provider);
  const title = parseRequiredText(cloudMeta.title);
  if (!providerName || !title) {
    throw new Error('云端保存元数据无效');
  }

  const targetId = parseRequiredText(cloudMeta.id)
    || parseRequiredText(bridge.id)
    || selectedDiagramId;
  const expectedRevision = captureCloudSaveVersion(providerName, targetId, capturedCloud);
  const snapshot = await attachSnapshot(bridge, selectedDiagramId);
  const provider = await getProvider(providerName);
  assertDesignerSaveReady(bridge);
  assertCloudSaveViewCurrent(bridge, capturedId, capturedCloud, expectedRevision);
  assertCurrent();
  const saved = await provider.saveDiagram({
    id: targetId,
    title,
    content: { ...asRecord(snapshot.diagram), id: targetId },
    updated_at: new Date().toISOString(),
    user_id: 'anonymous',
    expectedRevision,
  });
  const savedId = readSavedDiagramId(saved);
  assertCurrent();
  const revision = readSavedCloudRevision(providerName, saved);
  invalidatePreview(savedId);
  assertCloudSaveViewCurrent(bridge, capturedId, capturedCloud, expectedRevision);
  syncDiagramViewerBridgeCloudReplica({ bridge, provider: providerName, id: savedId, title, revision });
  return {
    provider: providerName,
    id: savedId,
    title,
  };
});
