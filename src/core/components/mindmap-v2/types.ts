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
    nodes: any[];
    edges: any[];
}

export function isMindMapV2(data: any): data is VizlyMindMapV2Data {
    return data?._version === 'mindmap-v2';
}
