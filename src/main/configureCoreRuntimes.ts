import { isStandardPresetId } from '@/data/standardized/presetMetadata';
import { configureApplicationDiagramRuntime } from '@/core/ports/applicationDiagramRuntime';
import { configureMindMapAIRuntime } from '@/core/ports/mindMapAIRuntime';
import type { MindMapAIChatResponse } from '@/core/ports/mindMapAIRuntime';
import { configureEdgeRoutingCoordinatorRuntime } from '@/core/ports/edgeRoutingCoordinatorRuntime';

configureEdgeRoutingCoordinatorRuntime(async () => {
  const { EdgeRoutingCoordinator } = await import('@/core/services/EdgeRoutingCoordinator');
  return EdgeRoutingCoordinator.getInstance();
});

configureApplicationDiagramRuntime({
  isStandardPresetId: (id) => isStandardPresetId(typeof id === 'string' ? id : undefined),
  loadStandardPreset: async (id) => {
    const { loadStandardPresetById } = await import('@/data/standardized/presetLoader');
    return loadStandardPresetById(typeof id === 'string' ? id : undefined);
  },
  loadDiagram: async (id, options) => {
    const { dataRegistry } = await import('@/data/DataRegistry');
    if (options?.initialize) await dataRegistry.initialize();
    return dataRegistry.getDataService().getDiagram(id);
  },
  registerDiagram: async (content, fallback, persistToIndexedDB = true, overrides = {}) => {
    const { dataRegistry } = await import('@/data/DataRegistry');
    return dataRegistry.getDataService().registerRemoteDiagram(
      content,
      fallback,
      persistToIndexedDB,
      overrides,
    );
  },
  listDiagrams: async () => {
    const { dataRegistry } = await import('@/data/DataRegistry');
    const result = await dataRegistry.getDataService().queryDiagrams({});
    return result.data;
  },
});

configureMindMapAIRuntime({
  loadConfig: async () => import('@/components/ai/aiConfigStorage').then(({ getAIConfig }) => getAIConfig()),
  requestChatCompletionJson: async (provider, request) => {
    const { requestAIChatCompletionJson } = await import('@/services/ai/aiProviderClient');
    return requestAIChatCompletionJson<MindMapAIChatResponse>(provider, request);
  },
  formatRequestError: async (error, maxLength) => {
    const { formatAIProviderRequestError } = await import('@/services/ai/aiProviderClient');
    return formatAIProviderRequestError(error, maxLength);
  },
});
