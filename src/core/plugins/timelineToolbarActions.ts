import type { Edge, Node } from '@xyflow/react';

import { addDaysToDateOnly, formatDateOnly, parseDateOnlyTime } from '../utils/dateOnly';

export type TimelineAppendType = 'event' | 'phase' | 'milestone';

export interface TimelineAppendPlanOptions {
    nodes: Node[];
    type: TimelineAppendType;
    nodeId: string;
    edgeId: string;
    label: string;
    fallbackDate: string;
}

export interface TimelineAppendPlan {
    node: Node;
    edge: Edge | null;
}

const readTimelineEndDate = (node: Node): string | null => {
    const endDate = typeof node.data?.endDate === 'string' ? node.data.endDate : '';
    const startDate = typeof node.data?.date === 'string' ? node.data.date : '';
    const candidate = endDate || startDate;
    return candidate && parseDateOnlyTime(candidate) !== null ? candidate : null;
};

const isTimelineNode = (node: Node): boolean => (
    node.type === 'timelineNode'
    || node.data?.type === 'phase'
    || node.data?.type === 'event'
    || node.data?.type === 'milestone'
);

const findLatestTimelineNode = (nodes: Node[]): { node: Node; endDate: string } | null => {
    let latest: { node: Node; endDate: string; time: number } | null = null;

    for (const node of nodes) {
        if (!isTimelineNode(node)) continue;
        const endDate = readTimelineEndDate(node);
        if (!endDate) continue;
        const time = parseDateOnlyTime(endDate);
        if (time === null || (latest && latest.time >= time)) continue;
        latest = { node, endDate, time };
    }

    return latest ? { node: latest.node, endDate: latest.endDate } : null;
};

const adjustForwardToWeekday = (value: unknown, fallbackDate: string): string => {
    const normalized = addDaysToDateOnly(value, 0, fallbackDate);
    const time = parseDateOnlyTime(normalized);
    const date = new Date(time ?? Date.now());

    while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
    }

    return formatDateOnly(date);
};

export const buildTimelineAppendPlan = ({
    nodes,
    type,
    nodeId,
    edgeId,
    label,
    fallbackDate,
}: TimelineAppendPlanOptions): TimelineAppendPlan => {
    const latest = findLatestTimelineNode(nodes);
    const proposedStartDate = latest
        ? addDaysToDateOnly(latest.endDate, 2, fallbackDate)
        : fallbackDate;
    const startDate = adjustForwardToWeekday(proposedStartDate, fallbackDate);
    const node: Node = {
        id: nodeId,
        type: 'timelineNode',
        position: { x: 0, y: 0 },
        selected: true,
        data: {
            type,
            label,
            status: 'pending',
            date: startDate,
            ...(type === 'event' ? { endDate: startDate } : {}),
            ...(type === 'phase' ? {
                progress: 0,
                endDate: addDaysToDateOnly(startDate, 14),
            } : {}),
        },
    };

    return {
        node,
        edge: latest ? {
            id: edgeId,
            source: latest.node.id,
            target: nodeId,
            type: 'smoothstep',
            style: { stroke: '#d9d9d9', strokeWidth: 2 },
        } : null,
    };
};
