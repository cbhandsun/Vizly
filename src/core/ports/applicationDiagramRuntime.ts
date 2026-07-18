import type { StandardDiagramData } from '../models/DiagramModels';
import { coerceDiagramId, coerceSafeStringParam } from '../utils/inputBoundary';

export interface DiagramRegistrationFallback {
  id: string;
  title: string;
}

export type DiagramRegistrationOverrides = Partial<Pick<
  StandardDiagramData,
  'id' | 'name' | 'metadata' | 'isReadonly'
>>;

export interface ApplicationDiagramRuntime {
  isStandardPresetId: (id: unknown) => boolean;
  loadStandardPreset: (id: unknown) => Promise<StandardDiagramData | null>;
  loadDiagram: (id: string, options?: { initialize?: boolean }) => Promise<StandardDiagramData | null>;
  registerDiagram: (
    content: unknown,
    fallback: DiagramRegistrationFallback,
    persistToIndexedDB?: boolean,
    overrides?: DiagramRegistrationOverrides,
  ) => Promise<StandardDiagramData>;
  listDiagrams: () => Promise<StandardDiagramData[]>;
}

const unconfigured = async (): Promise<never> => {
  throw new Error('Application diagram runtime has not been configured.');
};

let adapter: ApplicationDiagramRuntime = {
  isStandardPresetId: () => false,
  loadStandardPreset: unconfigured,
  loadDiagram: unconfigured,
  registerDiagram: unconfigured,
  listDiagrams: unconfigured,
};

const normalizeId = (value: unknown): string => coerceDiagramId(value, '');

const runtime: ApplicationDiagramRuntime = {
  isStandardPresetId: (id) => {
    const normalizedId = normalizeId(id);
    return normalizedId ? adapter.isStandardPresetId(normalizedId) : false;
  },
  loadStandardPreset: async (id) => {
    const normalizedId = normalizeId(id);
    return normalizedId ? adapter.loadStandardPreset(normalizedId) : null;
  },
  loadDiagram: async (id, options) => {
    const normalizedId = normalizeId(id);
    return normalizedId ? adapter.loadDiagram(normalizedId, options) : null;
  },
  registerDiagram: async (content, fallback, persistToIndexedDB, overrides) => {
    const id = normalizeId(overrides?.id ?? fallback.id);
    if (!id) throw new Error('A valid diagram id is required for registration.');
    const title = coerceSafeStringParam(fallback.title, 'Untitled Diagram', 240);
    return adapter.registerDiagram(
      content,
      { id, title },
      persistToIndexedDB,
      { ...overrides, id },
    );
  },
  listDiagrams: () => adapter.listDiagrams(),
};

export const configureApplicationDiagramRuntime = (nextRuntime: ApplicationDiagramRuntime): void => {
  adapter = nextRuntime;
};

export const getApplicationDiagramRuntime = (): ApplicationDiagramRuntime => runtime;
