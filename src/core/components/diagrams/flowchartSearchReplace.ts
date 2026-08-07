import type { Node } from '@xyflow/react';

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
