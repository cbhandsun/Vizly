import { coerceDiagramId } from '@/core/utils/inputBoundary';
import { upsertDiagramConfigIndex } from '@/core/utils/diagramTypeStorage';

import {
  createTemplateSeed,
  loadDataRegistry,
  loadSupabaseClient,
  loadUnifiedStorage,
  type TemplateKey,
  type UnifiedDiagramItem,
} from './diagramManagementPage.helpers';

type ActionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface WorkspaceDiagramActionDependencies {
  loadDataRegistry: typeof loadDataRegistry;
  loadSupabaseClient: typeof loadSupabaseClient;
  loadUnifiedStorage: typeof loadUnifiedStorage;
  createTemplateSeed: typeof createTemplateSeed;
  upsertDiagramConfigIndex: typeof upsertDiagramConfigIndex;
  getStorage: () => ActionStorage | null;
  createId: () => string;
  now: () => number;
  nowIso: () => string;
}

export type OpenWorkspaceDiagramResult =
  | { kind: 'navigate'; diagramId: string }
  | { kind: 'auth-required' }
  | { kind: 'invalid-id' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

const boundedTitle = (value: unknown, fallback: string): string => {
  const safeFallback = fallback.trim().slice(0, 240) || 'Untitled';
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 240)
    : safeFallback;
};

const boundedTimestamp = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 64)
    : undefined;

const createValidId = (dependencies: WorkspaceDiagramActionDependencies): string => {
  const id = coerceDiagramId(dependencies.createId());
  if (!id) throw new Error('Generated diagram id is invalid');
  return id;
};

const defaultDependencies = (): WorkspaceDiagramActionDependencies => ({
  loadDataRegistry,
  loadSupabaseClient,
  loadUnifiedStorage,
  createTemplateSeed,
  upsertDiagramConfigIndex,
  getStorage: () => typeof localStorage === 'undefined' ? null : localStorage,
  createId: () => crypto.randomUUID(),
  now: () => Date.now(),
  nowIso: () => new Date().toISOString(),
});

const persistDiagramIndex = (
  dependencies: WorkspaceDiagramActionDependencies,
  diagram: { id: unknown; type?: unknown; name?: unknown },
): void => {
  const storage = dependencies.getStorage();
  const id = coerceDiagramId(diagram.id);
  if (!storage || !id) return;

  try {
    dependencies.upsertDiagramConfigIndex(storage, {
      id,
      type: typeof diagram.type === 'string' && diagram.type ? diagram.type : 'flowchart',
      name: typeof diagram.name === 'string' ? diagram.name : undefined,
      updatedAt: dependencies.now(),
    });
  } catch {
    // Optional index persistence must not block opening a valid diagram.
  }
};

export const createWorkspaceDiagramActions = (
  overrides: Partial<WorkspaceDiagramActionDependencies> = {},
) => {
  const dependencies = { ...defaultDependencies(), ...overrides };

  const openTemplate = async (item: UnifiedDiagramItem): Promise<OpenWorkspaceDiagramResult> => {
    const templateId = coerceDiagramId(asRecord(item.raw).id);
    if (!templateId) return { kind: 'invalid-id' };

    const supabase = await dependencies.loadSupabaseClient();
    if (!supabase) return { kind: 'unavailable' };

    const { data, error } = await supabase
      .from('system_templates')
      .select('content, title, id')
      .eq('id', templateId)
      .single();
    if (error || !data || !data.content) return { kind: 'not-found' };

    const dataRegistry = await dependencies.loadDataRegistry();
    await dataRegistry.initialize();
    const localService = dataRegistry.getDataService();
    const clonedId = createValidId(dependencies);
    const title = boundedTitle(data.title, item.title || 'Untitled');
    const cloned = localService.registerRemoteDiagram(data.content, {
      id: clonedId,
      title,
    }, true, {
      id: clonedId,
      name: title,
      metadata: { title },
    });
    const registeredId = coerceDiagramId(cloned.id);
    if (!registeredId) return { kind: 'invalid-id' };
    persistDiagramIndex(dependencies, cloned);
    try {
      dependencies.getStorage()?.removeItem(`flowchart-autosave-v2-${registeredId}`);
    } catch {
      // Stale autosave cleanup is best effort.
    }
    return { kind: 'navigate', diagramId: registeredId };
  };

  const openCloudDiagram = async (item: UnifiedDiagramItem): Promise<OpenWorkspaceDiagramResult> => {
    if (item.source !== 's3' && item.source !== 'supabase') return { kind: 'unavailable' };
    const cloudProvider = item.source;
    const diagramId = coerceDiagramId(asRecord(item.raw).id);
    if (!diagramId) return { kind: 'invalid-id' };

    const unifiedStorage = await dependencies.loadUnifiedStorage();
    const savedDiagram = await unifiedStorage.loadDiagram(diagramId);
    if (!savedDiagram) return { kind: 'not-found' };
    const savedDiagramId = coerceDiagramId(savedDiagram.id);
    if (!savedDiagramId) return { kind: 'invalid-id' };
    const title = boundedTitle(savedDiagram.title, item.title || 'Untitled');
    const updatedAt = boundedTimestamp(savedDiagram.updated_at);

    const dataRegistry = await dependencies.loadDataRegistry();
    await dataRegistry.initialize();
    const localService = dataRegistry.getDataService();
    const normalized = localService.registerRemoteDiagram(savedDiagram.content, {
      id: savedDiagramId,
      title,
    }, true, {
      id: savedDiagramId,
      name: title,
      metadata: {
        title,
        updatedAt,
        cloud: {
          provider: cloudProvider,
          id: savedDiagramId,
          title,
          openedAt: dependencies.nowIso(),
        },
      },
      isReadonly: item.role === 'viewer',
    });
    persistDiagramIndex(dependencies, normalized);
    return { kind: 'navigate', diagramId: savedDiagramId };
  };

  return {
    async openDiagram(
      item: UnifiedDiagramItem,
      authenticated: boolean,
    ): Promise<OpenWorkspaceDiagramResult> {
      if (item.source === 'local') {
        const diagramId = coerceDiagramId(asRecord(item.raw).id);
        return diagramId ? { kind: 'navigate', diagramId } : { kind: 'invalid-id' };
      }
      if (item.source === 'supabase' && !authenticated) return { kind: 'auth-required' };
      if (item.source === 'template' || item.source === 'general_template') return openTemplate(item);
      return openCloudDiagram(item);
    },

    async deleteDiagram(item: UnifiedDiagramItem): Promise<'deleted' | 'invalid-id'> {
      const diagramId = coerceDiagramId(asRecord(item.raw).id);
      if (!diagramId) return 'invalid-id';

      if (item.source === 'local') {
        const dataRegistry = await dependencies.loadDataRegistry();
        await dataRegistry.initialize();
        dataRegistry.getDataService().deleteDiagram(diagramId);
      } else {
        const unifiedStorage = await dependencies.loadUnifiedStorage();
        await unifiedStorage.deleteDiagram(diagramId);
      }
      return 'deleted';
    },

    async createDiagram(
      templateKey: TemplateKey,
      requestedName?: unknown,
      mindMapRootTopic?: unknown,
    ): Promise<string | null> {
      const templateData = dependencies.createTemplateSeed(templateKey, { mindMapRootTopic });
      if (!templateData) return null;

      const dataRegistry = await dependencies.loadDataRegistry();
      await dataRegistry.initialize();
      const localService = dataRegistry.getDataService();
      const cloned = structuredClone(templateData);
      cloned.id = createValidId(dependencies);
      cloned.type ||= templateKey === 'blank' ? 'flowchart' : templateKey;
      cloned.name = boundedTitle(requestedName, cloned.name || 'Untitled');
      cloned.metadata = {
        ...cloned.metadata,
        title: cloned.name,
      };
      localService.registerDiagram(cloned);
      persistDiagramIndex(dependencies, cloned);
      return cloned.id;
    },
  };
};
