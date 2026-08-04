import type { Node } from '@xyflow/react';

import { isNodeMutationLocked } from './nodeLockPolicy';

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

/**
 * Plans a label-only replacement without mutating the input nodes.
 * Search may match metadata, but this operation intentionally edits labels only.
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

        const label = typeof node.data?.label === 'string' ? node.data.label : '';
        if (!matcher.test(label)) {
            ignoredNonLabelMatchIds.push(node.id);
            return node;
        }
        if (isNodeMutationLocked(node)) {
            skippedLockedIds.push(node.id);
            return node;
        }

        const unboundedLabel = replaceLiteralIgnoreCase(label, query, replacement);
        if (!unboundedLabel.trim()) {
            skippedBlankIds.push(node.id);
            return node;
        }

        const nextLabel = unboundedLabel.slice(0, FLOWCHART_REPLACE_TEXT_MAX_LENGTH);
        if (nextLabel === label) return node;
        if (nextLabel.length < unboundedLabel.length) truncatedIds.push(node.id);
        changedIds.push(node.id);

        return {
            ...node,
            data: {
                ...node.data,
                label: nextLabel,
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
