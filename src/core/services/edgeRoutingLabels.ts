import type { PathFindingResult, SharedGraphContext } from '../types/routing';

export type RoutedLabelObstacle = {
    edgeId: string;
    ownerId: string;
    x: number;
    y: number;
    width: number;
    height: number;
};

const ROUTED_LABEL_MIN_WIDTH = 36;
const ROUTED_LABEL_MAX_WIDTH = 220;
const ROUTED_LABEL_HEIGHT = 26;

export function getGraphEdgeLabelText(edgeId: string, graph: SharedGraphContext): string {
    const edge = (graph.edges ?? []).find((entry): entry is Record<string, unknown> =>
        Boolean(entry && typeof entry === 'object' && 'id' in entry && entry.id === edgeId)
    );
    const data = edge?.data && typeof edge.data === 'object'
        ? edge.data as Record<string, unknown>
        : undefined;
    const raw = edge?.label ?? data?.label;
    return typeof raw === 'string' ? raw.replace(/<[^>]+>/g, '').trim() : '';
}

export function buildRoutedLabelObstacle(
    edgeId: string,
    labelText: string,
    result: Pick<PathFindingResult, 'labelX' | 'labelY'>
): RoutedLabelObstacle | null {
    if (!labelText) return null;

    const x = Number(result.labelX);
    const y = Number(result.labelY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    const width = Math.max(
        ROUTED_LABEL_MIN_WIDTH,
        Math.min(ROUTED_LABEL_MAX_WIDTH, labelText.length * 8 + 22)
    );

    return {
        edgeId,
        ownerId: edgeId,
        x: x - width / 2,
        y: y - ROUTED_LABEL_HEIGHT / 2,
        width,
        height: ROUTED_LABEL_HEIGHT,
    };
}
