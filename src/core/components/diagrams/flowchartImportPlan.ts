import type { Edge, Node } from '@xyflow/react';

import type { StandardDiagramData } from '@/core/models/DiagramModels';
import {
    coerceReactFlowImport,
    coerceStandardDiagramImport,
    isLikelyStandardDiagramData,
} from '@/core/utils/diagramJsonImport';

type ParsedPluginGraph = {
    nodes: Node[];
    edges?: Edge[];
} | null;

export type FlowchartImportPlugin = {
    parseData?: (data: StandardDiagramData) => ParsedPluginGraph;
};

export type FlowchartJsonImportPlan =
    | {
        kind: 'standard-plugin';
        nodes: Node[];
        edges: Edge[];
    }
    | {
        kind: 'standard-reload';
        currentId: string;
        normalized: StandardDiagramData;
        title: string;
    }
    | {
        kind: 'reactflow';
        nodes: Node[];
        edges: Edge[];
    };

export const buildFlowchartJsonImportPlan = ({
    data,
    activePlugin,
    fallbackId,
    fallbackTitle,
    openedAt,
    invalidFormatMessage,
}: {
    data: unknown;
    activePlugin?: FlowchartImportPlugin | null;
    fallbackId: string;
    fallbackTitle: string;
    openedAt: string;
    invalidFormatMessage: string;
}): FlowchartJsonImportPlan => {
    const shouldTreatAsStandardData = isLikelyStandardDiagramData(data) || Boolean(activePlugin?.parseData);

    if (shouldTreatAsStandardData) {
        const safeData = coerceStandardDiagramImport(data, {
            id: fallbackId,
            title: fallbackTitle,
        }) as StandardDiagramData;
        const parsed = activePlugin?.parseData?.(safeData) ?? null;

        if (parsed && parsed.nodes.length > 0) {
            return {
                kind: 'standard-plugin',
                nodes: parsed.nodes,
                edges: parsed.edges || [],
            };
        }

        const normalized = {
            ...safeData,
            id: fallbackId,
            metadata: {
                ...(safeData.metadata || {}),
                openedAt,
            },
        } as StandardDiagramData;

        return {
            kind: 'standard-reload',
            currentId: fallbackId,
            normalized,
            title: normalized.name || normalized.metadata?.title || fallbackId,
        };
    }

    if (data && typeof data === 'object' && 'nodes' in data && 'edges' in data) {
        const canvas = coerceReactFlowImport(data);
        return {
            kind: 'reactflow',
            nodes: canvas.nodes,
            edges: canvas.edges,
        };
    }

    throw new Error(invalidFormatMessage);
};
