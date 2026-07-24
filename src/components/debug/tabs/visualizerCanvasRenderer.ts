import type { Point } from '@/core/types/routing';

import {
    normalizeVisibilityGraph,
    type AlgorithmDebugPayload,
    type DebugObstacle,
    type DebugPayload,
    type VisibilityGraphLike,
    type VisualizerTransform,
    type VisualizerViewport,
} from './visualizerModel';

export interface VisualizerCanvasOptions {
    showGrid: boolean;
    showObstacles: boolean;
    showVG: boolean;
    showQuadTree: boolean;
    showTrunk: boolean;
    transform: VisualizerTransform;
    viewport: VisualizerViewport;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
);

export function drawVisualizerCanvas(
    canvas: HTMLCanvasElement,
    data: DebugPayload,
    options: VisualizerCanvasOptions,
): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const {
        showGrid,
        showObstacles,
        showVG,
        showQuadTree,
        showTrunk,
        transform,
        viewport,
    } = options;
    const toScreen = (x: number, y: number) => ({
        x: x * transform.k + transform.x,
        y: y * transform.k + transform.y,
    });

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const algorithmDebug = data.algorithmDebug && typeof data.algorithmDebug === 'object'
        ? (data.algorithmDebug as AlgorithmDebugPayload)
        : null;
    const algorithmRecord = isRecord(data.algorithmDebug) ? data.algorithmDebug : null;
    const pathPoints = data.pathPoints || data.path;
    const rawPoints = algorithmDebug?.rawPoints;
    const obstacles = data.obstacles ?? algorithmDebug?.obstacles;
    const vgRawHeader: VisibilityGraphLike | undefined =
        data.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
    const vgEdgesHeader = normalizeVisibilityGraph(vgRawHeader);

    ctx.fillStyle = '#ccc';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText([
        `Grid: ${Boolean(data.grid ?? algorithmDebug?.grid)}`,
        `Path: ${pathPoints ? pathPoints.length : 0}`,
        `Raw: ${rawPoints ? rawPoints.length : 0}`,
        `Obs: ${obstacles ? obstacles.length : 0}`,
        `VG: ${vgEdgesHeader.length}`,
        `Visited: ${(data.visited ?? algorithmDebug?.visited)?.length ?? 0}`,
    ].join(' | '), 8, 6);

    ctx.save();

    const grid = data.grid ?? algorithmDebug?.grid;
    let effectiveGrid = grid;
    if (!effectiveGrid && ((pathPoints && pathPoints.length > 0) || (obstacles && obstacles.length > 0))) {
        let minX = 0;
        let maxX = 100;
        let minY = 0;
        let maxY = 100;
        let initialized = false;

        if (pathPoints && pathPoints.length > 0) {
            minX = pathPoints[0].x;
            maxX = pathPoints[0].x;
            minY = pathPoints[0].y;
            maxY = pathPoints[0].y;
            initialized = true;
            for (const point of pathPoints) {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
            }
        }

        if (obstacles && obstacles.length > 0) {
            if (!initialized) {
                const first = obstacles[0];
                const width = first.w ?? first.width ?? 0;
                const height = first.h ?? first.height ?? 0;
                minX = first.x;
                maxX = first.x + width;
                minY = first.y;
                maxY = first.y + height;
            }
            for (const obstacle of obstacles) {
                const width = obstacle.w ?? obstacle.width ?? 0;
                const height = obstacle.h ?? obstacle.height ?? 0;
                minX = Math.min(minX, obstacle.x);
                maxX = Math.max(maxX, obstacle.x + width);
                minY = Math.min(minY, obstacle.y);
                maxY = Math.max(maxY, obstacle.y + height);
            }
        }

        const size = 20;
        const cols = Math.max(1, Math.ceil((maxX - minX || size) / size));
        const rows = Math.max(1, Math.ceil((maxY - minY || size) / size));
        effectiveGrid = { minX, minY, cols, rows, size, data: new Int32Array(cols * rows) };
    }

    if (showGrid && effectiveGrid) {
        if ('data' in effectiveGrid && effectiveGrid.data) {
            for (let row = 0; row < effectiveGrid.rows; row += 1) {
                for (let column = 0; column < effectiveGrid.cols; column += 1) {
                    const cost = effectiveGrid.data[row * effectiveGrid.cols + column];
                    if (cost <= 0) continue;
                    const screen = toScreen(
                        effectiveGrid.minX + column * effectiveGrid.size,
                        effectiveGrid.minY + row * effectiveGrid.size,
                    );
                    const size = Math.ceil(effectiveGrid.size * transform.k);
                    if (cost >= 10_000_000) ctx.fillStyle = 'rgba(211, 47, 47, 0.4)';
                    else if (cost >= 50_000) ctx.fillStyle = 'rgba(255, 152, 0, 0.4)';
                    else if (cost >= 5_000) ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
                    else if (cost >= 2_000) ctx.fillStyle = 'rgba(33, 150, 243, 0.2)';
                    else if (cost >= 100) ctx.fillStyle = 'rgba(33, 150, 243, 0.1)';
                    else if (cost === 9) ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
                    else ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.fillRect(screen.x, screen.y, size, size);
                }
            }
        } else if (Array.isArray(effectiveGrid)) {
            ctx.fillStyle = '#333';
            (effectiveGrid as Point[]).forEach((point) => {
                const screen = toScreen(point.x, point.y);
                ctx.fillRect(screen.x, screen.y, 2 * transform.k, 2 * transform.k);
            });
        }
    }

    if (showObstacles && obstacles) {
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(211, 47, 47, 0.1)';
        obstacles.forEach((obstacle) => {
            const screen = toScreen(obstacle.x, obstacle.y);
            const width = (obstacle.w ?? obstacle.width ?? 0) * transform.k;
            const height = (obstacle.h ?? obstacle.height ?? 0) * transform.k;
            ctx.fillRect(screen.x, screen.y, width, height);
            ctx.strokeRect(screen.x, screen.y, width, height);
        });
    }

    if (showObstacles) {
        const drawSpecial = (rect: DebugObstacle | undefined, color: string, stroke: string) => {
            if (!rect) return;
            const screen = toScreen(rect.x, rect.y);
            const width = (rect.w ?? rect.width ?? 0) * transform.k;
            const height = (rect.h ?? rect.height ?? 0) * transform.k;
            ctx.fillStyle = color;
            ctx.fillRect(screen.x, screen.y, width, height);
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2;
            ctx.strokeRect(screen.x, screen.y, width, height);
        };
        drawSpecial(algorithmDebug?.sourceRect, 'rgba(76, 175, 80, 0.2)', '#4caf50');
        drawSpecial(algorithmDebug?.targetRect, 'rgba(33, 150, 243, 0.2)', '#2196f3');
    }

    const quadTree = data.quadTree ?? algorithmDebug?.quadTree ?? algorithmDebug?.spatialIndex;
    if (showQuadTree && quadTree) {
        ctx.strokeStyle = '#006600';
        ctx.lineWidth = 1;
        (Array.isArray(quadTree) ? quadTree : []).forEach((cell) => {
            const screen = toScreen(cell.x, cell.y);
            ctx.strokeRect(
                screen.x,
                screen.y,
                (cell.w ?? cell.width ?? 0) * transform.k,
                (cell.h ?? cell.height ?? 0) * transform.k,
            );
        });
    }

    const vgRaw: VisibilityGraphLike | undefined =
        data.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
    const vgEdges = normalizeVisibilityGraph(vgRaw);
    if (showVG && vgEdges.length > 0) {
        ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        vgEdges.forEach(([start, end]) => {
            const screenStart = toScreen(start.x, start.y);
            const screenEnd = toScreen(end.x, end.y);
            ctx.moveTo(screenStart.x, screenStart.y);
            ctx.lineTo(screenEnd.x, screenEnd.y);
        });
        ctx.stroke();
    }

    if (rawPoints && rawPoints.length > 0) {
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const start = toScreen(rawPoints[0].x, rawPoints[0].y);
        ctx.moveTo(start.x, start.y);
        rawPoints.slice(1).forEach((point) => {
            const screen = toScreen(point.x, point.y);
            ctx.lineTo(screen.x, screen.y);
        });
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
        rawPoints.forEach((point) => {
            const screen = toScreen(point.x, point.y);
            ctx.fillRect(screen.x - 2, screen.y - 2, 4, 4);
        });
    }

    if (pathPoints && pathPoints.length > 0) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const start = toScreen(pathPoints[0].x, pathPoints[0].y);
        ctx.moveTo(start.x, start.y);
        pathPoints.slice(1).forEach((point) => {
            const screen = toScreen(point.x, point.y);
            ctx.lineTo(screen.x, screen.y);
        });
        ctx.stroke();
        ctx.fillStyle = '#fff';
        pathPoints.forEach((point) => {
            const screen = toScreen(point.x, point.y);
            ctx.fillRect(screen.x - 2, screen.y - 2, 4, 4);
        });
    }

    const visited = data.visited ?? algorithmDebug?.visited;
    if (visited) {
        ctx.fillStyle = 'rgba(100, 255, 218, 0.3)';
        visited.forEach((point) => {
            const screen = toScreen(point.x, point.y);
            const size = (grid && 'size' in grid ? grid.size : 12) * transform.k;
            ctx.fillRect(screen.x - size / 2, screen.y - size / 2, size, size);
        });
    }

    data.points?.forEach((point) => {
        const screen = toScreen(point.x, point.y);
        ctx.fillStyle = point.type === 'start' ? '#4caf50' : '#ff9800';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 6 * transform.k, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    if (showTrunk) {
        const portSelection = isRecord(algorithmRecord?.portSelection)
            ? algorithmRecord.portSelection
            : null;
        const trunkAxis = typeof portSelection?.trunkAxis === 'number'
            ? portSelection.trunkAxis
            : undefined;
        const trunkVertical = typeof portSelection?.trunkVertical === 'boolean'
            ? portSelection.trunkVertical
            : undefined;
        const peerGroupMembers = Array.isArray(portSelection?.peerGroupMembers)
            ? portSelection.peerGroupMembers
            : undefined;

        if (trunkAxis !== undefined && trunkVertical !== undefined) {
            const trunkColor = '#ffd666';
            ctx.save();
            ctx.strokeStyle = trunkColor;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            if (trunkVertical) {
                const screenX = toScreen(trunkAxis, 0).x;
                ctx.moveTo(screenX, 0);
                ctx.lineTo(screenX, viewport.height);
            } else {
                const screenY = toScreen(0, trunkAxis).y;
                ctx.moveTo(0, screenY);
                ctx.lineTo(viewport.width, screenY);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.fillStyle = trunkColor;
            ctx.font = `${Math.max(10, 11 * transform.k)}px monospace`;
            ctx.textBaseline = 'top';
            if (trunkVertical) {
                const screenX = toScreen(trunkAxis, 0).x;
                ctx.fillText(`trunk x=${trunkAxis.toFixed(0)}`, screenX + 4, 22);
            } else {
                const screenY = toScreen(0, trunkAxis).y;
                ctx.fillText(`trunk y=${trunkAxis.toFixed(0)}`, 4, screenY + 4);
            }
            ctx.restore();
        }

        if (peerGroupMembers && peerGroupMembers.length > 0 && obstacles && obstacles.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#b37feb';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.globalAlpha = 0.6;
            peerGroupMembers.forEach((peer, index) => {
                const obstacle = obstacles[index]
                    ?? obstacles.find((candidate) => candidate.id === String(peer));
                if (!obstacle) return;
                const screen = toScreen(obstacle.x, obstacle.y);
                const width = (obstacle.w ?? obstacle.width ?? 0) * transform.k;
                const height = (obstacle.h ?? obstacle.height ?? 0) * transform.k;
                ctx.strokeRect(screen.x - 2, screen.y - 2, width + 4, height + 4);
            });
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    ctx.restore();
}
