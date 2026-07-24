import type { Edge, Position } from '@xyflow/react';
import { diagramConfigManager } from '@/core/config/DiagramConfig';
import type { SimpleNodeData } from '../../hooks/useNodeMap';
import type { CenteredCoords } from './hooks/useSmartPathWorker';
import type { SmartEdgeNode, SmartEdgePoint } from './smartEdgeNodeGeometry';

export type LayoutDirection = 'LR' | 'RL' | 'TB' | 'BT';
export type Point = SmartEdgePoint;
export type DirectionBucket = 'up' | 'down' | 'left' | 'right';
export type SmartNode = SmartEdgeNode;

export type SmartEdgeConfig = {
    bundleStrength: number;
    maxBundleSize: number;
    obstaclePadding: number;
    labelCollisionOffset: number;
    jitterThresholdMultiplier: number;
    borderRadius: number;
    sourceOffset: number;
    targetOffset: number;
    minLastSegment: number;
    gridSize: number;
    jumpRadius: number;
    debug: boolean;
    debugPortHeatmap: boolean;
    strictOrthogonal: boolean;
} & Record<string, unknown>;

export type SmartEdgeData = Record<string, unknown> & {
    _draggingNodeIds?: unknown;
    manualHandleSides?: unknown;
    inferredSubDomainHandles?: unknown;
    handleSelectionPolicy?: unknown;
    auto?: unknown;
    manualHandles?: unknown;
    _manualHandles?: unknown;
    runtimeHandleLock?: unknown;
    _runtimeHandleLock?: unknown;
    edgeConfig?: Partial<SmartEdgeConfig>;
    borderRadius?: unknown;
    layoutDirection?: unknown;
};

export type ReactFlowStoreSnapshot = {
    edges?: Edge[];
    nodeLookup?: Map<string, SmartNode>;
};

type DiagramConfigSnapshot = {
    edge?: { handleSelectionPolicy?: unknown };
    layout?: { direction?: unknown };
};

type HandleFlagPair = { source: boolean; target: boolean };
type EdgeListCache = {
    outgoingBuckets: Record<string, string[]>;
    incomingBuckets: Record<string, string[]>;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

export const isLayoutDirection = (value: unknown): value is LayoutDirection =>
    value === 'LR' || value === 'RL' || value === 'TB' || value === 'BT';

export const getEdgeData = (data: unknown): SmartEdgeData =>
    isRecord(data) ? data as SmartEdgeData : {};

export const getConfigSnapshot = (): DiagramConfigSnapshot => {
    try {
        const config = diagramConfigManager.getConfig();
        return isRecord(config) ? config as DiagramConfigSnapshot : {};
    } catch {
        return {};
    }
};

export const readHandlePair = (value: unknown): HandleFlagPair => {
    if (value === true) return { source: true, target: true };
    if (isRecord(value)) {
        return { source: Boolean(value.source), target: Boolean(value.target) };
    }
    return { source: false, target: false };
};

export const smartEdgeContextCache = {
    directionVotes: new Map<number, LayoutDirection>(),
    multiEdgeLists: new Map<string, EdgeListCache>(),
    topologySignature: -1,
};

export interface SmartEdgeContextResult {
    layoutDirection: LayoutDirection;
    isExplicitLayoutDirection: boolean;
    multiEdgeInfo: {
        isManyToOne: boolean;
        isOneToMany: boolean;
        incomingCount: number;
        outgoingCount: number;
        incomingIndex: number;
        outgoingIndex: number;
        enableBus: boolean;
    };
    centeredCoords: CenteredCoords;
    fallbackPositions: { sourcePos: Position; targetPos: Position };
    edgeConfig: SmartEdgeConfig;
    handleSelectionPolicy: string;
    respectSourceHandle: boolean;
    respectTargetHandle: boolean;
    isReverseEdge: boolean;
    nodesDragging: boolean;
    sourceHandleId?: string | null;
    targetHandleId?: string | null;
    storeEdges: Edge[];
    simpleNodeMap: Map<string, SimpleNodeData>;
}
