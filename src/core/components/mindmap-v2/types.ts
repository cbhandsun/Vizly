/**
 * Vizly MindMap v2 — Type definitions
 * Based on mind-elixir-core data model
 */

import type { MindElixirData, NodeObj, Theme } from 'mind-elixir';

export type { MindElixirData, NodeObj, Theme };

/** Vizly-specific save format for mindmap-v2 */
export interface VizlyMindMapV2Data {
    /** Schema version marker */
    _version: 'mindmap-v2';
    /** The tree data compatible with mind-elixir */
    nodeData: NodeObj;
    /** Direction constant: 0=TB, 1=R, 2=LR(SIDE), 3=L */
    direction: 0 | 1 | 2 | 3;
    /** Theme snapshot (rarely needed, themeKey is preferred) */
    theme?: Theme;
    /** Persisted theme key (e.g. 'indigo', 'ocean', 'dark') */
    themeKey?: string;
}

/** Legacy React Flow based format (mindmap-v1) */
export interface VizlyMindMapV1Data {
    nodes: unknown[];
    edges: unknown[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

export function isMindMapV2(data: unknown): data is VizlyMindMapV2Data {
    if (!isRecord(data) || data._version !== 'mindmap-v2' || !isRecord(data.nodeData)) return false;
    return typeof data.nodeData.id === 'string'
        && typeof data.nodeData.topic === 'string'
        && (data.direction === 0 || data.direction === 1 || data.direction === 2 || data.direction === 3);
}
