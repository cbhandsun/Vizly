import ELK from 'elkjs/lib/elk-api';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { logElkLayoutWorkerFailure } from '../utils/routingLogging';

const elk = new ELK({
  workerUrl: elkWorkerUrl
});

const MAX_ELK_GRAPH_ITEMS = 5_000;

interface ElkWorkerMessage {
  id: string;
  graph: Record<string, unknown>;
  options?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const hasString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every(hasString)
);

const isValidElkChild = (value: unknown): boolean => {
  if (!isRecord(value) || !hasString(value.id)) return false;
  if (value.children !== undefined && !isValidElkItems(value.children, isValidElkChild)) return false;
  if (value.edges !== undefined && !isValidElkItems(value.edges, isValidElkEdge)) return false;
  if (value.layoutOptions !== undefined && !isRecord(value.layoutOptions)) return false;
  return true;
};

const isValidElkEdge = (value: unknown): boolean => {
  if (!isRecord(value) || !hasString(value.id)) return false;
  if (value.sources !== undefined && !isStringArray(value.sources)) return false;
  if (value.targets !== undefined && !isStringArray(value.targets)) return false;
  return true;
};

function isValidElkItems(value: unknown, validator: (item: unknown) => boolean): boolean {
  return Array.isArray(value)
    && value.length <= MAX_ELK_GRAPH_ITEMS
    && value.every(validator);
}

export const validateElkWorkerMessage = (value: unknown): { ok: true; value: ElkWorkerMessage } | { ok: false; id?: string; error: string } => {
  if (!isRecord(value)) return { ok: false, error: 'Invalid ELK worker message' };
  const id = hasString(value.id) ? value.id : undefined;
  if (!id) return { ok: false, error: 'Invalid ELK worker request id' };
  if (!isRecord(value.graph)) return { ok: false, id, error: 'Invalid ELK graph' };
  if (!hasString(value.graph.id)) return { ok: false, id, error: 'Invalid ELK graph id' };
  if (value.graph.layoutOptions !== undefined && !isRecord(value.graph.layoutOptions)) {
    return { ok: false, id, error: 'Invalid ELK graph layout options' };
  }
  if (value.graph.children !== undefined && !isValidElkItems(value.graph.children, isValidElkChild)) {
    return { ok: false, id, error: 'Invalid ELK graph children' };
  }
  if (value.graph.edges !== undefined && !isValidElkItems(value.graph.edges, isValidElkEdge)) {
    return { ok: false, id, error: 'Invalid ELK graph edges' };
  }
  if (value.options !== undefined && !isRecord(value.options)) {
    return { ok: false, id, error: 'Invalid ELK layout options' };
  }

  return { ok: true, value: { id, graph: value.graph, options: value.options } };
};

self.onmessage = async (event) => {
  const validation = validateElkWorkerMessage(event.data);
  if (!validation.ok) {
    self.postMessage({
      id: validation.id ?? '',
      result: null,
      error: validation.error
    });
    return;
  }

  const { id, graph, options } = validation.value;

  try {
    // Ensure layout options are merged
    const layoutGraph = {
      ...graph,
      layoutOptions: {
        ...(isRecord(graph.layoutOptions) ? graph.layoutOptions : {}),
        ...options
      }
    };

    const result = await elk.layout(layoutGraph);

    self.postMessage({
      id,
      result,
      error: null
    });
  } catch (error) {
    logElkLayoutWorkerFailure(id, error);
    self.postMessage({
      id,
      result: null,
      error: (error as Error).message || String(error)
    });
  }
};
