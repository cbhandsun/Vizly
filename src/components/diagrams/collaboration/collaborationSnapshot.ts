import type { Edge, Node } from '@xyflow/react';
import { readCollaborationElement } from '../../../../server/collaboration/documentModel';
import { coerceClipboardData } from '@vizly/core/diagram-import';

export const COLLABORATION_MAX_NODES = 1000;
export const COLLABORATION_MAX_EDGES = 2000;
const MAX_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const blockedKeys = new Set(['__proto__', 'prototype', 'constructor']);

const validateJsonBudget = (value: unknown, budget: { bytes: number }, depth = 0): boolean => {
    if (depth > 8) return false;
    if (value === null || value === undefined || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') {
        if (value.length > 20_000) return false;
        budget.bytes += encoder.encode(value).byteLength;
        return budget.bytes <= MAX_BYTES;
    }
    if (typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
    let count = 0;
    for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        if (++count > (Array.isArray(value) ? 1000 : 200)) return false;
        budget.bytes += 8;
        if (budget.bytes > MAX_BYTES || blockedKeys.has(key) || !validateJsonBudget(key, budget, depth + 1)
            || !validateJsonBudget((value as Record<string, unknown>)[key], budget, depth + 1)) return false;
    }
    return true;
};

const readElements = (entries: Iterable<[string, unknown]>, maxCount: number, budget: { bytes: number }): unknown[] | null => {
    const elements: unknown[] = [];
    for (const [key, raw] of entries) {
        const value = readCollaborationElement(raw);
        if (elements.length >= maxCount || !value || typeof value !== 'object' || Array.isArray(value)) return null;
        if (key !== key.trim() || [...key].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
            || (value as Record<string, unknown>).id !== key || !validateJsonBudget(value, budget)) return null;
        elements.push(value);
    }
    return elements;
};

/** Reject an invalid batch atomically, preserving the last usable canvas. */
export const parseCollaborationSnapshot = (
    nodeEntries: Iterable<[string, unknown]>,
    edgeEntries: Iterable<[string, unknown]>,
): { nodes: Node[]; edges: Edge[] } | null => {
  try {
    const budget = { bytes: 0 };
    const nodes = readElements(nodeEntries, COLLABORATION_MAX_NODES, budget);
    const edges = readElements(edgeEntries, COLLABORATION_MAX_EDGES, budget);
    if (!nodes || !edges) return null;
    if (nodes.length === 0) return edges.length === 0 ? { nodes: [], edges: [] } : null;
    const snapshot = coerceClipboardData({ nodes, edges });
    if (!snapshot || snapshot.nodes.length !== nodes.length || snapshot.edges.length !== edges.length) return null;
    return { nodes: snapshot.nodes, edges: snapshot.edges };
  } catch {
    // Invalid remote values or iterators must not disrupt the last usable canvas.
    return null;
  }
};

const equalValue = (left: unknown, right: unknown, depth = 0): boolean => {
    if (Object.is(left, right)) return true;
    if (depth > 16 || !left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return keys.length === Object.keys(rightRecord).length && keys.every(key => Object.hasOwn(rightRecord, key) && equalValue(leftRecord[key], rightRecord[key], depth + 1));
};

/** Includes styles, labels, grouping, markers and future serializable fields. */
export const areCollaborationElementsEqual = (left: Node | Edge, right: Node | Edge): boolean => equalValue(left, right);
