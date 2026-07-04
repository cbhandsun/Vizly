import type { Rectangle } from '../types/routing';

export type EdgeRoutingObstacleRectInput = Partial<Rectangle> & {
    edgeId?: string;
    ownerId?: string;
};

const EDGE_ROUTING_MIN_RECT_SIZE = 1;

function buildObstacleRectDedupeKey(rect: Rectangle): string {
    return `${Math.round(rect.x * 10) / 10}:${Math.round(rect.y * 10) / 10}:${Math.round(rect.width * 10) / 10}:${Math.round(rect.height * 10) / 10}`;
}

export function normalizeEdgeRoutingObstacleRect(
    rect: EdgeRoutingObstacleRectInput | undefined,
    excludedOwnerIds?: ReadonlySet<string>
): Rectangle | null {
    if (!rect) return null;

    const ownerId = rect.edgeId ?? rect.ownerId;
    if (ownerId && excludedOwnerIds?.has(ownerId)) {
        return null;
    }

    const x = Number(rect.x);
    const y = Number(rect.y);
    const width = Number(rect.width);
    const height = Number(rect.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
    }
    if (width <= EDGE_ROUTING_MIN_RECT_SIZE || height <= EDGE_ROUTING_MIN_RECT_SIZE) {
        return null;
    }

    return { x, y, width, height };
}

export function createEdgeRoutingObstacleCollector(
    target: Rectangle[],
    options?: {
        dedupe?: boolean;
        excludedOwnerIds?: ReadonlySet<string>;
    }
): (rect: EdgeRoutingObstacleRectInput | undefined) => void {
    const seen = options?.dedupe ? new Set<string>() : null;

    return rect => {
        const normalized = normalizeEdgeRoutingObstacleRect(rect, options?.excludedOwnerIds);
        if (!normalized) return;

        if (seen) {
            const key = buildObstacleRectDedupeKey(normalized);
            if (seen.has(key)) return;
            seen.add(key);
        }

        target.push(normalized);
    };
}
