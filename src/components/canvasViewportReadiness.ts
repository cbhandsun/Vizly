import { isDesignerSaveReady } from '@/services/designerSaveReadiness';

export type CanvasViewportReadiness = 'waiting' | 'empty' | 'ready';
const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const dimension = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10_000_000
);

/** View commands need live rendered geometry, rather than transport connectivity. */
export const resolveCanvasViewportReadiness = (snapshot: unknown, bridge: unknown): CanvasViewportReadiness => {
  try {
    if (bridge != null && !isDesignerSaveReady(bridge)) return 'waiting';
    if (!record(snapshot) || !Array.isArray(snapshot.nodes)) return 'waiting';
    if (snapshot.nodes.length === 0) return bridge != null ? 'empty' : 'waiting';
    let visible = 0;
    for (const node of snapshot.nodes) {
      if (!record(node) || (node.hidden !== undefined && typeof node.hidden !== 'boolean')) return 'waiting';
      if (node.hidden === true) continue;
      visible++;
      const measured = record(node.measured) ? node.measured : undefined;
      if (!dimension(measured?.width ?? node.width) || !dimension(measured?.height ?? node.height)) return 'waiting';
    }
    return visible > 0 ? 'ready' : 'empty';
  } catch {
    return 'waiting';
  }
};
