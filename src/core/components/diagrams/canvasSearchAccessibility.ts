export const CANVAS_SEARCH_RESULT_LABEL_MAX_LENGTH = 160;

const sanitizeSearchResultLabel = (value: unknown): string => (
    typeof value === 'string'
        ? Array.from(value)
              .map(character => {
                  const code = character.charCodeAt(0);
                  if (code === 9 || code === 10 || code === 13) return ' ';
                  return code >= 32 && code !== 127 ? character : '';
              })
              .join('')
              .replace(/\s+/gu, ' ')
              .trim()
              .slice(0, CANVAS_SEARCH_RESULT_LABEL_MAX_LENGTH)
        : ''
);

export const formatCanvasSearchResultLabel = (
    value: unknown,
    fallbackId: string,
): string => sanitizeSearchResultLabel(value) || sanitizeSearchResultLabel(fallbackId) || 'unknown';

export const getCanvasSearchMatchAnnouncementLabel = (
    match: FlowchartCanvasSearchMatch,
    nodes: readonly Node[],
    edges: readonly Edge[],
): string => {
    if (match.kind === 'node') {
        const node = nodes.find(candidate => candidate.id === match.id);
        return formatCanvasSearchResultLabel(node?.data?.label, match.id);
    }
    const edge = edges.find(candidate => candidate.id === match.id);
    return formatCanvasSearchResultLabel(
        edge ? getFlowchartEdgeVisibleLabel(edge) : '',
        match.id,
    );
};
import type { Edge, Node } from '@xyflow/react';

import {
    getFlowchartEdgeVisibleLabel,
    type FlowchartCanvasSearchMatch,
} from './flowchartSearchReplace';
