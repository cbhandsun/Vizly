import type { Edge, Node } from '@xyflow/react';

import { isNodeMutationLocked } from './nodeLockPolicy';
import {
  MAX_NODE_DESCRIPTION_LENGTH,
  normalizeNodeDescriptionForEditing,
} from './nodeDescriptionText';

export const FLOWCHART_SEARCH_QUERY_MAX_LENGTH = 240;
export const FLOWCHART_REPLACE_TEXT_MAX_LENGTH = 1_000;

const sanitizeControlCharacters = (value: string): string => Array.from(value)
    .filter((character) => {
        const code = character.charCodeAt(0);
        return (code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13;
    })
    .join('');

export interface FlowchartReplaceResult {
    nodes: Node[];
    changedIds: string[];
    skippedLockedIds: string[];
    skippedBlankIds: string[];
    ignoredNonLabelMatchIds: string[];
    truncatedIds: string[];
    queryValid: boolean;
}

export type FlowchartCanvasSearchMatch =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string };

export interface FlowchartCanvasReplaceResult {
  nodes: Node[];
  edges: Edge[];
  changedMatches: FlowchartCanvasSearchMatch[];
  skippedLockedMatches: FlowchartCanvasSearchMatch[];
  skippedBlankMatches: FlowchartCanvasSearchMatch[];
  ignoredMetadataMatches: FlowchartCanvasSearchMatch[];
  truncatedMatches: FlowchartCanvasSearchMatch[];
  queryValid: boolean;
}

export const coerceFlowchartSearchText = (value: unknown): string => (
    typeof value === 'string'
        ? sanitizeControlCharacters(value).slice(0, FLOWCHART_SEARCH_QUERY_MAX_LENGTH)
        : ''
);

export const coerceFlowchartReplaceText = (value: unknown): string => (
    typeof value === 'string'
        ? sanitizeControlCharacters(value).slice(0, FLOWCHART_REPLACE_TEXT_MAX_LENGTH)
        : ''
);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const replaceLiteralIgnoreCase = (
    label: string,
    query: string,
    replacement: string,
): string => label.replace(new RegExp(escapeRegExp(query), 'giu'), () => replacement);

const escapeHtmlText = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] as string));

const getNodeLabel = (node: Node): string => (
  typeof node.data?.label === 'string' ? node.data.label : ''
);

const getNodeVisibleDescription = (node: Node): string => normalizeNodeDescriptionForEditing(
  node.data?.description,
);

const getEdgeData = (edge: Edge): Record<string, unknown> => (
  edge.data && typeof edge.data === 'object' ? edge.data as Record<string, unknown> : {}
);

export const getFlowchartEdgeVisibleLabel = (edge: Edge): string => {
  const dataLabel = getEdgeData(edge).label;
  if (typeof dataLabel === 'string') return dataLabel;
  return typeof edge.label === 'string' ? edge.label : '';
};

const isEdgeMutationLocked = (edge: Edge): boolean => {
  const data = getEdgeData(edge);
  return data.locked === true || data.isLocked === true || edge.deletable === false;
};

export const buildFlowchartNodeSearchSignature = (node: Node): string => JSON.stringify([
  getNodeLabel(node),
  getNodeVisibleDescription(node),
  typeof node.data?.domain === 'string' ? node.data.domain : '',
  node.id,
]);

export const flowchartNodeMatchesSearch = (node: Node, rawQuery: unknown): boolean => {
  const query = coerceFlowchartSearchText(rawQuery).trim().toLocaleLowerCase();
  if (!query) return false;
  return [
    getNodeLabel(node),
    getNodeVisibleDescription(node),
    typeof node.data?.domain === 'string' ? node.data.domain : '',
    node.id,
  ].some(value => value.toLocaleLowerCase().includes(query));
};

export const buildFlowchartEdgeSearchSignature = (edge: Edge): string => JSON.stringify([
  getFlowchartEdgeVisibleLabel(edge),
  edge.id,
  edge.source,
  edge.target,
]);

export const flowchartEdgeMatchesSearch = (edge: Edge, rawQuery: unknown): boolean => {
  const query = coerceFlowchartSearchText(rawQuery).trim().toLocaleLowerCase();
  if (!query) return false;
  return [getFlowchartEdgeVisibleLabel(edge), edge.id]
    .some(value => value.toLocaleLowerCase().includes(query));
};

export const buildFlowchartCanvasSearchMatchKey = (
  match: FlowchartCanvasSearchMatch,
): string => `${match.kind}:${match.id}`;

export const buildFlowchartCanvasSearchSignature = (
  match: FlowchartCanvasSearchMatch,
  nodes: readonly Node[],
  edges: readonly Edge[],
): string | null => {
  if (match.kind === 'node') {
    const node = nodes.find(candidate => candidate.id === match.id);
    return node ? buildFlowchartNodeSearchSignature(node) : null;
  }
  const edge = edges.find(candidate => candidate.id === match.id);
  return edge ? buildFlowchartEdgeSearchSignature(edge) : null;
};

export const flowchartCanvasMatchMatchesSearch = (
  match: FlowchartCanvasSearchMatch,
  nodes: readonly Node[],
  edges: readonly Edge[],
  rawQuery: unknown,
): boolean => {
  if (match.kind === 'node') {
    const node = nodes.find(candidate => candidate.id === match.id);
    return node ? flowchartNodeMatchesSearch(node, rawQuery) : false;
  }
  const edge = edges.find(candidate => candidate.id === match.id);
  return edge ? flowchartEdgeMatchesSearch(edge, rawQuery) : false;
};

export const buildFlowchartCanvasSearchResults = (
  nodes: readonly Node[],
  edges: readonly Edge[],
  rawQuery: unknown,
): FlowchartCanvasSearchMatch[] => {
  const query = coerceFlowchartSearchText(rawQuery).trim();
  if (!query) return [];
  return [
    ...nodes
      .filter(node => flowchartNodeMatchesSearch(node, query))
      .map(node => ({ kind: 'node' as const, id: node.id })),
    ...edges
      .filter(edge => flowchartEdgeMatchesSearch(edge, query))
      .map(edge => ({ kind: 'edge' as const, id: edge.id })),
  ];
};

/**
 * Plans a visible node-text replacement without mutating the input nodes.
 * Rich descriptions are normalized to bounded plain text before replacement so
 * user input remains literal and cannot become executable markup.
 */
export const planFlowchartLabelReplacement = (
    nodes: readonly Node[],
    targetIds: readonly string[],
    rawQuery: unknown,
    rawReplacement: unknown,
): FlowchartReplaceResult => {
    const query = coerceFlowchartSearchText(rawQuery).trim();
    const replacement = coerceFlowchartReplaceText(rawReplacement);
    const targetIdSet = new Set(targetIds);
    const changedIds: string[] = [];
    const skippedLockedIds: string[] = [];
    const skippedBlankIds: string[] = [];
    const ignoredNonLabelMatchIds: string[] = [];
    const truncatedIds: string[] = [];

    if (!query) {
        return {
            nodes: [...nodes],
            changedIds,
            skippedLockedIds,
            skippedBlankIds,
            ignoredNonLabelMatchIds,
            truncatedIds,
            queryValid: false,
        };
    }

    const matcher = new RegExp(escapeRegExp(query), 'iu');
    const nextNodes = nodes.map((node) => {
        if (!targetIdSet.has(node.id)) return node;

        const label = getNodeLabel(node);
        const description = getNodeVisibleDescription(node);
        const labelMatches = matcher.test(label);
        const descriptionMatches = matcher.test(description);
        if (!labelMatches && !descriptionMatches) {
            ignoredNonLabelMatchIds.push(node.id);
            return node;
        }
        if (isNodeMutationLocked(node)) {
            skippedLockedIds.push(node.id);
            return node;
        }

        const unboundedLabel = labelMatches
          ? replaceLiteralIgnoreCase(label, query, replacement)
          : label;
        const unboundedDescription = descriptionMatches
          ? replaceLiteralIgnoreCase(description, query, replacement)
          : description;
        const nextVisibleText = description ? unboundedDescription : unboundedLabel;
        if (!nextVisibleText.trim()) {
            skippedBlankIds.push(node.id);
            return node;
        }

        const nextLabel = unboundedLabel.slice(0, FLOWCHART_REPLACE_TEXT_MAX_LENGTH);
        const nextDescription = unboundedDescription.slice(0, MAX_NODE_DESCRIPTION_LENGTH);
        const labelChanged = nextLabel !== label;
        const descriptionChanged = descriptionMatches && nextDescription !== description;
        if (!labelChanged && !descriptionChanged) return node;
        if (
          nextLabel.length < unboundedLabel.length
          || nextDescription.length < unboundedDescription.length
        ) truncatedIds.push(node.id);
        changedIds.push(node.id);

        return {
            ...node,
            data: {
                ...node.data,
                label: nextLabel,
                ...(descriptionChanged ? { description: escapeHtmlText(nextDescription) } : {}),
            },
        };
    });

    return {
        nodes: nextNodes,
        changedIds,
        skippedLockedIds,
        skippedBlankIds,
        ignoredNonLabelMatchIds,
        truncatedIds,
        queryValid: true,
    };
};

export const planFlowchartCanvasTextReplacement = (
  nodes: readonly Node[],
  edges: readonly Edge[],
  matches: readonly FlowchartCanvasSearchMatch[],
  rawQuery: unknown,
  rawReplacement: unknown,
): FlowchartCanvasReplaceResult => {
  const query = coerceFlowchartSearchText(rawQuery).trim();
  const replacement = coerceFlowchartReplaceText(rawReplacement);
  const nodeMatches = matches.filter(match => match.kind === 'node');
  const edgeMatches = matches.filter(match => match.kind === 'edge');
  const nodeResult = planFlowchartLabelReplacement(
    nodes,
    nodeMatches.map(match => match.id),
    query,
    replacement,
  );
  const changedMatches: FlowchartCanvasSearchMatch[] = nodeResult.changedIds
    .map(id => ({ kind: 'node', id }));
  const skippedLockedMatches: FlowchartCanvasSearchMatch[] = nodeResult.skippedLockedIds
    .map(id => ({ kind: 'node', id }));
  const skippedBlankMatches: FlowchartCanvasSearchMatch[] = nodeResult.skippedBlankIds
    .map(id => ({ kind: 'node', id }));
  const ignoredMetadataMatches: FlowchartCanvasSearchMatch[] = nodeResult.ignoredNonLabelMatchIds
    .map(id => ({ kind: 'node', id }));
  const truncatedMatches: FlowchartCanvasSearchMatch[] = nodeResult.truncatedIds
    .map(id => ({ kind: 'node', id }));
  const targetEdgeIds = new Set(edgeMatches.map(match => match.id));

  if (!query) {
    return {
      nodes: nodeResult.nodes,
      edges: [...edges],
      changedMatches,
      skippedLockedMatches,
      skippedBlankMatches,
      ignoredMetadataMatches,
      truncatedMatches,
      queryValid: false,
    };
  }

  const matcher = new RegExp(escapeRegExp(query), 'iu');
  const nextEdges = edges.map(edge => {
    if (!targetEdgeIds.has(edge.id)) return edge;
    const label = getFlowchartEdgeVisibleLabel(edge);
    if (!matcher.test(label)) {
      ignoredMetadataMatches.push({ kind: 'edge', id: edge.id });
      return edge;
    }
    if (isEdgeMutationLocked(edge)) {
      skippedLockedMatches.push({ kind: 'edge', id: edge.id });
      return edge;
    }
    const unboundedLabel = replaceLiteralIgnoreCase(label, query, replacement);
    if (!unboundedLabel.trim()) {
      skippedBlankMatches.push({ kind: 'edge', id: edge.id });
      return edge;
    }
    const nextLabel = unboundedLabel.slice(0, FLOWCHART_REPLACE_TEXT_MAX_LENGTH);
    if (nextLabel === label) return edge;
    if (nextLabel.length < unboundedLabel.length) {
      truncatedMatches.push({ kind: 'edge', id: edge.id });
    }
    changedMatches.push({ kind: 'edge', id: edge.id });
    return {
      ...edge,
      label: nextLabel,
      data: { ...getEdgeData(edge), label: nextLabel },
    };
  });

  return {
    nodes: nodeResult.nodes,
    edges: nextEdges,
    changedMatches,
    skippedLockedMatches,
    skippedBlankMatches,
    ignoredMetadataMatches,
    truncatedMatches,
    queryValid: true,
  };
};
