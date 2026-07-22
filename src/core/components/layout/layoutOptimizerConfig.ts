import { diagramConfigManager } from '@/core/config/DiagramConfig';

const DEFAULT_NODE_MAX_WIDTH = 420;
const MAX_NODE_MAX_WIDTH = 10_000;

const coerceNodeMaxWidth = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, MAX_NODE_MAX_WIDTH);
};

export const resolveLayoutNodeMaxWidth = (
  override?: unknown,
  readConfig: () => unknown = () => diagramConfigManager.getConfig(),
): number => {
  const safeOverride = coerceNodeMaxWidth(override);
  if (safeOverride !== null) return safeOverride;

  try {
    const config = readConfig();
    if (!config || typeof config !== 'object') return DEFAULT_NODE_MAX_WIDTH;
    const node = Reflect.get(config, 'node');
    if (!node || typeof node !== 'object') return DEFAULT_NODE_MAX_WIDTH;
    return coerceNodeMaxWidth(Reflect.get(node, 'maxWidth')) ?? DEFAULT_NODE_MAX_WIDTH;
  } catch {
    return DEFAULT_NODE_MAX_WIDTH;
  }
};
