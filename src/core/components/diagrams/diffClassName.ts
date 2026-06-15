import type { DiffResult } from '../../utils/diagramDiff';

export function getDiffClassName(
  elementId: string,
  diff: DiffResult | null
): string {
  if (!diff) return '';

  if (diff.addedNodes.includes(elementId) || diff.addedEdges.includes(elementId)) {
    return 'diff-added';
  }
  if (diff.modifiedNodes.some(n => n.id === elementId) || diff.modifiedEdges.some(e => e.id === elementId)) {
    return 'diff-modified';
  }
  return '';
}
