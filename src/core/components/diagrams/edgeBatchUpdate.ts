import type { Edge, EdgeMarkerType } from '@xyflow/react';

import type { EdgeDataUpdate } from '../../types/diagram-updates';
import { coerceFlowchartReplaceText } from './flowchartSearchReplace';
import { isEdgeMutationLocked } from './edgeMutationPolicy';

export interface EdgeBatchUpdatePlan {
    edges: Edge[];
    changedIds: string[];
    skippedLockedIds: string[];
}

const hasOwn = (value: object, key: PropertyKey): boolean => (
    Object.prototype.hasOwnProperty.call(value, key)
);

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
);

const shallowRecordEqual = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    const leftRecord = asRecord(left);
    const rightRecord = asRecord(right);
    if (!leftRecord || !rightRecord) return false;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return leftKeys.length === rightKeys.length
        && leftKeys.every(key => hasOwn(rightRecord, key) && Object.is(leftRecord[key], rightRecord[key]));
};

const edgeEqualForBatchUpdate = (left: Edge, right: Edge): boolean => {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
    return Array.from(keys).every((key) => {
        if (key === 'style' || key === 'data' || key === 'markerEnd' || key === 'markerStart') {
            return shallowRecordEqual(leftRecord[key], rightRecord[key]);
        }
        return Object.is(leftRecord[key], rightRecord[key]);
    });
};

const assignOptionalMarker = (
    edgeRecord: Record<string, unknown>,
    key: 'markerEnd' | 'markerStart',
    rawMarker: unknown,
): void => {
    if (rawMarker === undefined || rawMarker === null || rawMarker === '') {
        delete edgeRecord[key];
        return;
    }

    const currentMarker = edgeRecord[key];
    const markerPatch = asRecord(rawMarker);
    if (!markerPatch) {
        edgeRecord[key] = rawMarker as EdgeMarkerType;
        return;
    }

    const currentMarkerRecord = asRecord(currentMarker);
    edgeRecord[key] = {
        ...(currentMarkerRecord ?? (typeof currentMarker === 'string' ? { type: currentMarker } : {})),
        ...markerPatch,
    };
};

const applyLabel = (edgeRecord: Record<string, unknown>, rawLabel: unknown): void => {
    const label = coerceFlowchartReplaceText(rawLabel);
    const visibleLabel = label.trim() ? label : undefined;
    const data = asRecord(edgeRecord.data);

    if (visibleLabel === undefined) {
        delete edgeRecord.label;
        if (data && hasOwn(data, 'label')) {
            const nextData = { ...data };
            delete nextData.label;
            edgeRecord.data = nextData;
        }
    } else {
        edgeRecord.label = visibleLabel;
        edgeRecord.data = { ...(data ?? {}), label: visibleLabel };
    }
};

const applyEdgeUpdate = (edge: Edge, update: EdgeDataUpdate): Edge => {
    const edgeRecord: Record<string, unknown> = { ...edge };
    const stylePatch = asRecord(update.style);
    if (stylePatch) {
        edgeRecord.style = { ...(asRecord(edge.style) ?? {}), ...stylePatch };
    }

    const dataPatch = asRecord(update.data);
    if (dataPatch) {
        edgeRecord.data = { ...(asRecord(edge.data) ?? {}), ...dataPatch };
    }

    if (hasOwn(update, 'markerEnd')) assignOptionalMarker(edgeRecord, 'markerEnd', update.markerEnd);
    if (hasOwn(update, 'markerStart')) assignOptionalMarker(edgeRecord, 'markerStart', update.markerStart);

    const dataLabelWasProvided = dataPatch ? hasOwn(dataPatch, 'label') : false;
    if (hasOwn(update, 'label')) {
        applyLabel(edgeRecord, update.label);
    } else if (dataLabelWasProvided) {
        applyLabel(edgeRecord, dataPatch?.label);
    }

    for (const [key, value] of Object.entries(update)) {
        if (['style', 'data', 'markerEnd', 'markerStart', 'label'].includes(key)) continue;
        edgeRecord[key] = value;
    }

    return edgeRecord as Edge;
};

export const planEdgeBatchUpdate = (
    edges: readonly Edge[],
    rawTargetIds: readonly string[],
    update: EdgeDataUpdate,
): EdgeBatchUpdatePlan => {
    const targetIds = new Set(rawTargetIds.filter(id => typeof id === 'string' && id.length > 0));
    const changedIds: string[] = [];
    const skippedLockedIds: string[] = [];

    const nextEdges = edges.map((edge) => {
        if (!targetIds.has(edge.id)) return edge;
        if (isEdgeMutationLocked(edge)) {
            skippedLockedIds.push(edge.id);
            return edge;
        }

        const updatedEdge = applyEdgeUpdate(edge, update);
        if (edgeEqualForBatchUpdate(edge, updatedEdge)) return edge;
        changedIds.push(edge.id);
        return updatedEdge;
    });

    return {
        edges: changedIds.length > 0 ? nextEdges : [...edges],
        changedIds,
        skippedLockedIds,
    };
};
