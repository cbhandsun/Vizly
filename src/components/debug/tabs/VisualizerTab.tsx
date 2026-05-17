// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import Switch from 'antd/es/switch';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import Tooltip from 'antd/es/tooltip';
import { theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { EdgeRoutingCoordinator } from '@/core';
import { AlgorithmDebugInfo, Point } from '@/core';

interface DebugObstacle {
    x: number;
    y: number;
    w?: number;
    h?: number;
    width?: number;
    height?: number;
}

type DebugEdge = [Point, Point];

type VisibilityGraphLike =
    | DebugEdge[]
    | {
        edges?: Array<{
            x1: number;
            y1: number;
            x2: number;
            y2: number;
        }>;
    };

interface AlgorithmDebugPayload {
    grid?: AlgorithmDebugInfo['grid'];
    visited?: Point[];
    obstacles?: DebugObstacle[];
    rawPoints?: Point[];
    vg?: DebugEdge[];
    visibilityGraph?: DebugEdge[];
    quadTree?: DebugObstacle[];
    spatialIndex?: DebugObstacle[];
    strategy?: string;
    sourceRect?: DebugObstacle;
    targetRect?: DebugObstacle;
}

interface DebugMetadata {
    strategy?: string;
    duration?: number;
    steps?: number;
    length?: number;
    executionTime?: number;
}

interface DebugPayload extends AlgorithmDebugInfo {
    edgeId?: string;
    pathPoints?: Point[];
    path?: Point[];
    // Additional debug info that might be passed dynamically
    obstacles?: DebugObstacle[];
    vg?: DebugEdge[];
    points?: Array<Point & { type: 'start' | 'end' | string }>;
    quadTree?: DebugObstacle[];
    metadata?: DebugMetadata;
}

interface RawDebugEdge {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

function isRawDebugEdge(value: unknown): value is RawDebugEdge {
    if (!value || typeof value !== 'object') return false;
    const v = value as Partial<RawDebugEdge>;
    return typeof v.x1 === 'number'
        && typeof v.y1 === 'number'
        && typeof v.x2 === 'number'
        && typeof v.y2 === 'number';
}

function normalizeVisibilityGraph(vg: VisibilityGraphLike | undefined | null): DebugEdge[] {
    if (!vg) return [];
    if (Array.isArray(vg)) {
        return vg.map((edge) => {
            if (Array.isArray(edge) && edge.length >= 2) {
                return edge as DebugEdge;
            }
            if (isRawDebugEdge(edge)) {
                return [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }];
            }
            return null;
        }).filter((e): e is DebugEdge => !!e);
    }
    const container = vg as { edges?: RawDebugEdge[] } | null;
    if (container?.edges && Array.isArray(container.edges)) {
        return container.edges
            .map((e) => {
                if (isRawDebugEdge(e)) {
                    return [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }];
                }
                return null;
            })
            .filter((e): e is DebugEdge => !!e);
    }
    return [];
}

// Define interface for Coordinator to avoid 'any'
interface DebuggableCoordinator {
    registerDebugListener(cb: ((data: DebugPayload) => void) | null): void;
    registerSelectionListener(cb: ((id: string | null) => void) | null): void;
    setDebugEdge(id: string | null): void;
    forceDebugReRoute(id: string | null): void;
    notifyGraphChange(): void;
}

/** [UX] Reusable scan result row — used in both anomaly list and full-edge list */
interface ScanRowItemProps {
    row: { edgeId: string; port: string; strategy: string; geo: string; isM2O: boolean; anomaly: boolean };
    geoColor: (geo: string) => string;
    token: any;
    onClick: () => void;
}
const ScanRowItem: React.FC<ScanRowItemProps> = ({ row, geoColor, token, onClick }) => {
    const bg = row.anomaly ? 'rgba(255,77,79,0.08)' : 'rgba(82,196,26,0.05)';
    const bgHover = row.anomaly ? 'rgba(255,77,79,0.2)' : 'rgba(82,196,26,0.12)';
    const idColor = row.anomaly ? '#ff7875' : '#95de64';
    return (
        <div
            onClick={onClick}
            style={{
                display: 'flex', gap: 6, alignItems: 'center',
                padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                background: bg, marginBottom: 2, transition: 'background 0.12s',
                fontSize: 11,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = bgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = bg)}
        >
            {row.anomaly ? <span style={{ color: '#ff4d4f', fontSize: 9 }}>●</span> : <span style={{ color: '#52c41a', fontSize: 9 }}>●</span>}
            <span style={{ color: idColor, fontWeight: 600, minWidth: 30 }}>{row.edgeId}</span>
            <span style={{ color: token.colorTextTertiary, minWidth: 70 }}>{row.port}</span>
            <span style={{ color: geoColor(row.geo), flex: 1, fontSize: 10 }}>{row.geo}</span>
            {row.isM2O && <span style={{ color: '#1890ff', fontSize: 9 }}>M2O</span>}
        </div>
    );
};

export const VisualizerTab: React.FC<{ customHeight?: string }> = ({ customHeight }) => {

    const { t } = useTranslation();
    const { token } = theme.useToken();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [debugData, setDebugData] = useState<DebugPayload | null>(null);
    const [targetEdgeId, setTargetEdgeId] = useState<string>('');
    const [showGrid, setShowGrid] = useState(false);
    const [showObstacles, setShowObstacles] = useState(true);
    const [showVG, setShowVG] = useState(true);
    const [showQuadTree, setShowQuadTree] = useState(false);
    const [showTrunk, setShowTrunk] = useState(true); // [主干可视化] Trunk Axis + Peer Group overlay
    const [isMaximized, setIsMaximized] = useState(false);
    // [UX] Mouse world-coordinate tracking for HUD crosshair display
    const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number } | null>(null);
    // [UX] Expand all edges in scan (not just anomalies)
    const [showAllScanEdges, setShowAllScanEdges] = useState(false);

    // [SCAN] Batch scan state
    interface ScanRow { edgeId: string; port: string; strategy: string; geo: string; isM2O: boolean; anomaly: boolean; }
    const [scanResults, setScanResults] = useState<ScanRow[] | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [showScan, setShowScan] = useState(false);

    // Zoom & Pan State
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    // [FIX] Keep a ref to the React debug listener so scanAllEdges can restore it after clearing
    const debugListenerRef = useRef<((data: DebugPayload) => void) | null>(null);

    const targetEdgeIdRef = useRef(targetEdgeId);
    // [UX] Ref to fitToContent so reset button can reuse it without stale closure
    const debugDataRef = useRef<DebugPayload | null>(null);

    // Canvas sizing state
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

    useEffect(() => {
        targetEdgeIdRef.current = targetEdgeId;
    }, [targetEdgeId]);

    // Handle Resize
    useEffect(() => {
        if (!containerRef.current) return;

        const updateSize = () => {
            if (containerRef.current) {
                const { clientWidth, clientHeight } = containerRef.current;
                setCanvasSize({
                    width: clientWidth,
                    height: clientHeight || 600
                });
            }
        };

        const observer = new ResizeObserver(updateSize);
        observer.observe(containerRef.current);
        updateSize();

        return () => observer.disconnect();
    }, [isMaximized, customHeight]);

    // Helper to transform coordinates
    const toScreen = useCallback((x: number, y: number) => {
        return {
            x: x * transform.k + transform.x,
            y: y * transform.k + transform.y
        };
    }, [transform]);

    // Auto-fit content
    const fitToContent = useCallback((data: DebugPayload) => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        const width = clientWidth || canvasSize.width;
        const height = clientHeight || canvasSize.height;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasContent = false;

        const updateBounds = (x: number, y: number) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            hasContent = true;
        };

        const updateRect = (x: number, y: number, w: number, h: number) => {
            updateBounds(x, y);
            updateBounds(x + w, y + h);
        };

        const algorithmDebug = data.algorithmDebug && typeof data.algorithmDebug === 'object'
            ? (data.algorithmDebug as AlgorithmDebugPayload)
            : null;

        // === PRIORITY BOUNDS: Path + Source/Target rects ===
        // Fit tightly around the "hero" elements first.
        // Without this, 21 obstacles spread over 4742px collapse scale to 0.063x,
        // making the 2px path line render at 0.13px — effectively invisible.
        const path = data.pathPoints || data.path;
        if (path && Array.isArray(path)) {
            path.forEach((p) => updateBounds(p.x, p.y));
        }

        const rawPoints = algorithmDebug?.rawPoints;
        if (rawPoints && Array.isArray(rawPoints)) {
            rawPoints.forEach((p) => updateBounds(p.x, p.y));
        }

        const srcRect = algorithmDebug?.sourceRect;
        const tgtRect = algorithmDebug?.targetRect;
        if (srcRect) updateRect(srcRect.x, srcRect.y, srcRect.w ?? (srcRect as any).width ?? 0, srcRect.h ?? (srcRect as any).height ?? 0);
        if (tgtRect) updateRect(tgtRect.x, tgtRect.y, tgtRect.w ?? (tgtRect as any).width ?? 0, tgtRect.h ?? (tgtRect as any).height ?? 0);

        if (data.points && Array.isArray(data.points)) {
            data.points.forEach((p) => updateBounds(p.x, p.y));
        }

        // === SECONDARY BOUNDS: Obstacles filtered by proximity ===
        // Only include obstacles within 2x the primary content span.
        // Distant obstacles in unrelated graph regions are excluded.
        const primaryMinX = hasContent ? minX : -Infinity;
        const primaryMinY = hasContent ? minY : -Infinity;
        const primaryMaxX = hasContent ? maxX : Infinity;
        const primaryMaxY = hasContent ? maxY : Infinity;
        const primaryW = Math.max(primaryMaxX - primaryMinX, 200);
        const primaryH = Math.max(primaryMaxY - primaryMinY, 200);
        const OBSTACLE_MARGIN = 2.0;

        const obstacles = data.obstacles ?? algorithmDebug?.obstacles;
        if (obstacles && Array.isArray(obstacles)) {
            obstacles.forEach((o) => {
                const ox = o.x, oy = o.y;
                const ow = o.w ?? o.width ?? 0, oh = o.h ?? o.height ?? 0;
                const inX = ox + ow >= primaryMinX - primaryW * OBSTACLE_MARGIN && ox <= primaryMaxX + primaryW * OBSTACLE_MARGIN;
                const inY = oy + oh >= primaryMinY - primaryH * OBSTACLE_MARGIN && oy <= primaryMaxY + primaryH * OBSTACLE_MARGIN;
                if (inX && inY) updateRect(ox, oy, ow, oh);
            });
        }

        // Grid (always include — defines the search space scope)
        const grid = data.grid ?? algorithmDebug?.grid;
        if (grid && 'data' in grid) {
            updateRect(grid.minX, grid.minY, grid.cols * grid.size, grid.rows * grid.size);
        }

        const visitedForFit = data.visited ?? algorithmDebug?.visited;
        if (visitedForFit && Array.isArray(visitedForFit)) {
            visitedForFit.forEach((p) => updateBounds(p.x, p.y));
        }

        const vgRaw: VisibilityGraphLike | undefined =
            data.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
        const vgEdges = normalizeVisibilityGraph(vgRaw);
        if (vgEdges.length > 0) {
            vgEdges.forEach((edge) => {
                updateBounds(edge[0].x, edge[0].y);
                updateBounds(edge[1].x, edge[1].y);
            });
        }

        if (!hasContent) return;

        // Add padding
        const padding = 50;
        const contentW = maxX - minX;
        const contentH = maxY - minY;

        if (contentW <= 0 || contentH <= 0) return;

        const scaleX = (width - padding * 2) / contentW;
        const scaleY = (height - padding * 2) / contentH;
        let scale = Math.min(scaleX, scaleY);
        if (!Number.isFinite(scale) || scale <= 0) {
            scale = 1;
        }
        const MAX_SCALE = 4;
        // [FIX] MIN_SCALE lowered to 0.05: proximity filtering above prevents the scale
        // from going very low in practice; this is a safety floor for edge cases.
        const MIN_SCALE = 0.05;
        scale = Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const x = width / 2 - centerX * scale;
        const y = height / 2 - centerY * scale;

        setTransform({ x, y, k: scale });
    }, [canvasSize]);

    const drawVisualization = useCallback((data: DebugPayload) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const algorithmDebug = data.algorithmDebug && typeof data.algorithmDebug === 'object'
            ? (data.algorithmDebug as AlgorithmDebugPayload)
            : null;

        const pathPoints = data.pathPoints || data.path;
        const rawPoints = algorithmDebug?.rawPoints;
        const obstacles = data.obstacles ?? algorithmDebug?.obstacles;

        const vgRawHeader: VisibilityGraphLike | undefined =
            data.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
        const vgEdgesHeader = normalizeVisibilityGraph(vgRawHeader);

        ctx.fillStyle = '#ccc';
        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'top';
        const header = [
            `Grid: ${Boolean(data.grid ?? algorithmDebug?.grid)}`,
            `Path: ${pathPoints ? pathPoints.length : 0}`,
            `Raw: ${rawPoints ? rawPoints.length : 0}`,
            `Obs: ${obstacles ? obstacles.length : 0}`,
            `VG: ${vgEdgesHeader.length}`,
            `Visited: ${(data.visited ?? algorithmDebug?.visited)?.length ?? 0}`
        ].join(' | ');
        ctx.fillText(header, 8, 6);

        ctx.save();

        let grid = data.grid ?? algorithmDebug?.grid;
        let effectiveGrid = grid;

        if (!effectiveGrid && ((pathPoints && pathPoints.length > 0) || (obstacles && obstacles.length > 0))) {
            let minX = 0, maxX = 100, minY = 0, maxY = 100;
            let initialized = false;

            if (pathPoints && pathPoints.length > 0) {
                minX = pathPoints[0].x;
                maxX = pathPoints[0].x;
                minY = pathPoints[0].y;
                maxY = pathPoints[0].y;
                initialized = true;
                for (const p of pathPoints) {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                }
            }

            if (obstacles && obstacles.length > 0) {
                if (!initialized) {
                    const first = obstacles[0];
                    const ow = first.w ?? first.width ?? 0;
                    const oh = first.h ?? first.height ?? 0;
                    minX = first.x;
                    maxX = first.x + ow;
                    minY = first.y;
                    maxY = first.y + oh;
                    initialized = true;
                }
                for (const o of obstacles) {
                    const ow = o.w ?? o.width ?? 0;
                    const oh = o.h ?? o.height ?? 0;
                    if (o.x < minX) minX = o.x;
                    if (o.x + ow > maxX) maxX = o.x + ow;
                    if (o.y < minY) minY = o.y;
                    if (o.y + oh > maxY) maxY = o.y + oh;
                }
            }

            const size = 20;
            const widthSpan = maxX - minX || size;
            const heightSpan = maxY - minY || size;
            const cols = Math.max(1, Math.ceil(widthSpan / size));
            const rows = Math.max(1, Math.ceil(heightSpan / size));
            const dataArr = new Int32Array(cols * rows);

            effectiveGrid = {
                minX,
                minY,
                cols,
                rows,
                size,
                data: dataArr
            };
        }

        grid = effectiveGrid || grid;

        // 1. Grid (Heatmap)
        if (showGrid && grid) {
            const g = grid;
            if ('data' in g && g.data) {
                // AlgorithmDebugInfo format
                const dataArr = g.data;
                for (let r = 0; r < g.rows; r++) {
                    for (let c = 0; c < g.cols; c++) {
                        const idx = r * g.cols + c;
                        const cost = dataArr[idx];
                        if (cost > 0) { // Only draw non-zero cost cells
                            const x = g.minX + c * g.size;
                            const y = g.minY + r * g.size;
                            const s = toScreen(x, y);
                            const size = Math.ceil(g.size * transform.k);

                            // Color coding based on cost
                            if (cost >= 10000000) ctx.fillStyle = 'rgba(211, 47, 47, 0.4)'; // Obstacle (Red)
                            else if (cost >= 50000) ctx.fillStyle = 'rgba(255, 152, 0, 0.4)'; // Line Cross (Orange)
                            else if (cost >= 5000) ctx.fillStyle = 'rgba(255, 193, 7, 0.3)'; // Line Occupied (Amber)
                            else if (cost >= 2000) ctx.fillStyle = 'rgba(33, 150, 243, 0.2)'; // Buffer Close (Blue)
                            else if (cost >= 100) ctx.fillStyle = 'rgba(33, 150, 243, 0.1)'; // Buffer Far (Light Blue)
                            else if (cost === 9) ctx.fillStyle = 'rgba(0, 255, 0, 0.3)'; // Source/Target (Green)
                            else ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // Normal

                            ctx.fillRect(s.x, s.y, size, size);
                        }
                    }
                }
            } else if (Array.isArray(g)) {
                // Fallback for old simple grid (point list)
                ctx.fillStyle = '#333';
                (g as Point[]).forEach((p) => {
                    const s = toScreen(p.x, p.y);
                    ctx.fillRect(s.x, s.y, 2 * transform.k, 2 * transform.k);
                });
            }
        }

        // 2. Obstacles
        if (showObstacles && obstacles) {
            ctx.strokeStyle = '#d32f2f';
            ctx.lineWidth = 1;
            ctx.fillStyle = 'rgba(211, 47, 47, 0.1)';
            obstacles.forEach((o) => {
                const s = toScreen(o.x, o.y);
                const w = (o.w ?? o.width ?? 0) * transform.k;
                const h = (o.h ?? o.height ?? 0) * transform.k;
                ctx.fillRect(s.x, s.y, w, h);
                ctx.strokeRect(s.x, s.y, w, h);
            });
        }

        // 2.2 Source/Target Rects (Explicit)
        // Draw even if Obstacles on/off? Let's bind to Obstacles flag or always?
        // Usually part of "Obstacles" logically, but distinct.
        // Let's draw them if Obstacles are shown OR always. 
        // User request specifically asked for them to be distinguished.
        const srcRect = algorithmDebug?.sourceRect;
        const tgtRect = algorithmDebug?.targetRect;

        if (showObstacles) {
            const drawSpecial = (r: DebugObstacle | undefined, color: string, stroke: string) => {
                if (!r) return;
                const s = toScreen(r.x, r.y);
                const w = (r.w ?? r.width ?? 0) * transform.k;
                const h = (r.h ?? r.height ?? 0) * transform.k;
                ctx.fillStyle = color;
                ctx.fillRect(s.x, s.y, w, h);
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 2;
                ctx.strokeRect(s.x, s.y, w, h);
            };

            drawSpecial(srcRect, 'rgba(76, 175, 80, 0.2)', '#4caf50'); // Green
            drawSpecial(tgtRect, 'rgba(33, 150, 243, 0.2)', '#2196f3'); // Blue
        }

        // 2.1 QuadTree
        const quadTree = data.quadTree ?? algorithmDebug?.quadTree ?? algorithmDebug?.spatialIndex;
        if (showQuadTree && quadTree) {
            ctx.strokeStyle = '#006600';
            ctx.lineWidth = 1;
            (Array.isArray(quadTree) ? quadTree : []).forEach((q) => {
                const s = toScreen(q.x, q.y);
                const w = (q.w ?? q.width ?? 0) * transform.k;
                const h = (q.h ?? q.height ?? 0) * transform.k;
                ctx.strokeRect(s.x, s.y, w, h);
            });
        }

        const vgRaw: VisibilityGraphLike | undefined =
            data.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
        const vgEdges = normalizeVisibilityGraph(vgRaw);
        if (showVG && vgEdges.length > 0) {
            ctx.strokeStyle = 'rgba(76, 175, 80, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            vgEdges.forEach((edge) => {
                const s1 = toScreen(edge[0].x, edge[0].y);
                const s2 = toScreen(edge[1].x, edge[1].y);
                ctx.moveTo(s1.x, s1.y);
                ctx.lineTo(s2.x, s2.y);
            });
            ctx.stroke();
        }

        // 4. Path (pathPoints)
        // 4.1 Raw Path (Pink) - Draw first so it's behind final path
        if (rawPoints && rawPoints.length > 0) {
            ctx.strokeStyle = '#ff00ff'; // Pink
            ctx.lineWidth = 1;
            ctx.beginPath();
            const start = toScreen(rawPoints[0].x, rawPoints[0].y);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < rawPoints.length; i++) {
                const p = toScreen(rawPoints[i].x, rawPoints[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // Draw vertices
            ctx.fillStyle = 'rgba(255, 0, 255, 0.5)';
            rawPoints.forEach((p) => {
                const s = toScreen(p.x, p.y);
                ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
            });
        }

        if (pathPoints && pathPoints.length > 0) {
            ctx.strokeStyle = '#00ff00'; // Green as per screenshot
            ctx.lineWidth = 2;
            ctx.beginPath();
            const start = toScreen(pathPoints[0].x, pathPoints[0].y);
            ctx.moveTo(start.x, start.y);
            for (let i = 1; i < pathPoints.length; i++) {
                const p = toScreen(pathPoints[i].x, pathPoints[i].y);
                ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();

            // Draw vertices
            ctx.fillStyle = '#fff';
            pathPoints.forEach((p) => {
                const s = toScreen(p.x, p.y);
                ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
            });
        }

        // 5. Visited Nodes (A* Debug)
        const visited = data.visited ?? algorithmDebug?.visited;
        if (visited) {
            ctx.fillStyle = 'rgba(100, 255, 218, 0.3)';
            visited.forEach((p) => {
                const s = toScreen(p.x, p.y);
                // Assume visited points are grid centers, size roughly matches grid size (guess 12)
                const size = (grid && 'size' in grid ? grid.size : 12) * transform.k;
                ctx.fillRect(s.x - size / 2, s.y - size / 2, size, size);
            });
        }

        // 6. Points (Start/End)
        if (data.points) {
            data.points.forEach((p) => {
                const s = toScreen(p.x, p.y);
                ctx.fillStyle = p.type === 'start' ? '#4caf50' : '#ff9800';
                ctx.beginPath();
                ctx.arc(s.x, s.y, 6 * transform.k, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.stroke();
            });
        }

        // 7. Trunk Axis + Peer Group Visualization
        // 从 algorithmDebug.portSelection 中提取 trunkAxis / peerGroup 数据
        if (showTrunk) {
            const ad = data.algorithmDebug && typeof data.algorithmDebug === 'object'
                ? (data.algorithmDebug as Record<string, any>) : null;
            const ps = ad?.portSelection;
            const trunkAxis: number | undefined = ps?.trunkAxis;
            const trunkVertical: boolean | undefined = ps?.trunkVertical;
            const peerGroupMembers: any[] | undefined = Array.isArray(ps?.peerGroupMembers) ? ps.peerGroupMembers : undefined;

            if (typeof trunkAxis === 'number' && trunkVertical != null) {
                // 绘制主干轴线（全宽虚线）
                const TRUNK_COLOR = '#ffd666';
                ctx.save();
                ctx.strokeStyle = TRUNK_COLOR;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([6, 4]);
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                if (trunkVertical) {
                    // 垂直主干：x = trunkAxis
                    const sx = toScreen(trunkAxis, 0).x;
                    ctx.moveTo(sx, 0);
                    ctx.lineTo(sx, canvasSize.height);
                } else {
                    // 水平主干：y = trunkAxis
                    const sy = toScreen(0, trunkAxis).y;
                    ctx.moveTo(0, sy);
                    ctx.lineTo(canvasSize.width, sy);
                }
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;

                // 标注主干坐标
                ctx.fillStyle = TRUNK_COLOR;
                ctx.font = `${Math.max(10, 11 * transform.k)}px monospace`;
                ctx.textBaseline = 'top';
                if (trunkVertical) {
                    const sx = toScreen(trunkAxis, 0).x;
                    ctx.fillText(`trunk x=${trunkAxis.toFixed(0)}`, sx + 4, 22);
                } else {
                    const sy = toScreen(0, trunkAxis).y;
                    ctx.fillText(`trunk y=${trunkAxis.toFixed(0)}`, 4, sy + 4);
                }
                ctx.restore();
            }

            // 绘制 Peer Group 包围框（如果有 peerGroupMembers）
            if (peerGroupMembers && peerGroupMembers.length > 0) {
                // 尝试从 obstacles 中匹配 peer 节点矩形
                const obsArr = (data.obstacles ?? (data.algorithmDebug as any)?.obstacles) as DebugObstacle[] | undefined;
                if (obsArr && obsArr.length > 0) {
                    ctx.save();
                    ctx.strokeStyle = '#b37feb';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]);
                    ctx.globalAlpha = 0.6;

                    // 将 peerGroupMembers id/index 匹配到 obstacles
                    // obstacles 可能没有 id，用顶点匹配即可
                    peerGroupMembers.forEach((peer: any, idx: number) => {
                        const o = obsArr[idx] ?? obsArr.find(o => (o as any).id === String(peer));
                        if (!o) return;
                        const s = toScreen(o.x, o.y);
                        const w = (o.w ?? o.width ?? 0) * transform.k;
                        const h = (o.h ?? o.height ?? 0) * transform.k;
                        ctx.strokeRect(s.x - 2, s.y - 2, w + 4, h + 4);
                    });

                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }
            }
        }

        ctx.restore();
    }, [canvasRef, showGrid, showObstacles, showVG, showQuadTree, showTrunk, transform, toScreen, canvasSize]);

    // Redraw when data or flags change
    useEffect(() => {
        if (debugData) {
            drawVisualization(debugData);
        }
    }, [debugData, showGrid, showObstacles, showVG, showQuadTree, showTrunk, transform, drawVisualization, canvasSize]);

    // Handlers for Zoom/Pan
    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const scaleBy = 1.1;
        const oldScale = transform.k;
        const newScale = e.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

        // Pivot around mouse
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - transform.x) / oldScale;
        const worldY = (mouseY - transform.y) / oldScale;

        const newX = mouseX - worldX * newScale;
        const newY = mouseY - worldY * newScale;

        setTransform({ x: newX, y: newY, k: newScale });
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDragging(true);
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        // [UX] Track world coordinates for HUD display
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            setMouseWorldPos({
                x: Math.round((sx - transform.x) / transform.k),
                y: Math.round((sy - transform.y) / transform.k),
            });
        }
        if (!isDragging) return;
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleMouseLeaveCanvas = () => {
        setIsDragging(false);
        setMouseWorldPos(null);
    };

    useEffect(() => {
        const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as DebuggableCoordinator;

        const handleDebugData = (data: DebugPayload) => {
            const want = targetEdgeIdRef.current;
            if (data && (!want || !data.edgeId || data.edgeId === want)) {
                setDebugData(data);
                debugDataRef.current = data;
                fitToContent(data);
            }
        };
        // [FIX] Save listener ref so scanAllEdges can restore it
        debugListenerRef.current = handleDebugData;

        const handleSelectionChange = (edgeId: string | null) => {
            if (edgeId) setTargetEdgeId(edgeId);
        };

        coordinator.registerDebugListener(handleDebugData);
        coordinator.registerSelectionListener(handleSelectionChange);

        // [FALLBACK] Also listen to the window CustomEvent fired by Ctrl+click on edges.
        // This ensures VisualizerTab receives edge selection even if coordinator listener
        // was registered before coordinator was ready, or after coordinator reset.
        const handleWindowEdgeSelect = (e: Event) => {
            const edgeId = (e as CustomEvent<{ edgeId: string }>).detail?.edgeId;
            if (edgeId) {
                setTargetEdgeId(edgeId);
            }
        };
        window.addEventListener('vizly:selectDebugEdge', handleWindowEdgeSelect);

        return () => {
            coordinator.registerDebugListener(null);
            coordinator.registerSelectionListener(null);
            window.removeEventListener('vizly:selectDebugEdge', handleWindowEdgeSelect);
        };

    }, [fitToContent]);

    useEffect(() => {
        const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as DebuggableCoordinator;
        coordinator.setDebugEdge(targetEdgeId || null);
    }, [targetEdgeId]);

    // [UX] Extract strategy info + quality metrics for HUD display
    const hudInfo = (() => {
        if (!debugData) return null;
        const ad = debugData.algorithmDebug && typeof debugData.algorithmDebug === 'object'
            ? (debugData.algorithmDebug as Record<string, any>) : null;
        const ps = ad?.portSelection;
        const dataAny = debugData as unknown as Record<string, any>;
        const strategy = debugData.metadata?.strategy ?? ad?.strategy ?? '?';
        const s = dataAny.selectedSourcePos ?? ps?.selected?.source ?? '?';
        const tt = dataAny.selectedTargetPos ?? ps?.selected?.target ?? '?';
        const geo = ps?.geometry ?? ps?.detectedGeometry ?? '?';
        const ms = debugData.metadata?.duration?.toFixed(1) ?? '?';
        // [路径质量] 从 metadata 提取弯折数/长度/效率比
        const meta = debugData.metadata as any;
        const bendCount: number | undefined = meta?.bendCount;
        const pathLength: number | undefined = meta?.pathLength;
        const efficiencyRatio: number | undefined = meta?.efficiencyRatio;
        return { strategy, portStr: `${s} → ${tt}`, geo, ms, bendCount, pathLength, efficiencyRatio };
    })();

    const canvasContent = (
        <>
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeaveCanvas}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', cursor: isDragging ? 'grabbing' : 'grab' }}
            />
            {!debugData && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: token.colorTextQuaternary, pointerEvents: 'none' }}>
                    {t('designer.debug.visualizer.noDebugData')}
                </div>
            )}
            {/* [UX] HUD overlay — always visible, no scrolling needed */}
            {hudInfo && (
                <div style={{
                    position: 'absolute', top: 6, right: 8,
                    background: 'rgba(0,0,0,0.72)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '5px 10px',
                    fontSize: 11, lineHeight: '18px',
                    pointerEvents: 'none',
                    backdropFilter: 'blur(4px)',
                }}>
                    <div style={{ color: '#52c41a', fontWeight: 700, letterSpacing: 0.4 }}>{hudInfo.strategy}</div>
                    <div style={{ color: '#69b1ff' }}>Port: <span style={{ color: '#fff', fontWeight: 600 }}>{hudInfo.portStr}</span></div>
                    <div style={{ color: '#aaa' }}>Geo: <span style={{ color: geoColor(hudInfo.geo) }}>{hudInfo.geo}</span></div>
                    <div style={{ color: '#888' }}>{hudInfo.ms}ms · {(transform.k * 100).toFixed(0)}%</div>
                    {/* [路径质量] 弯折数 + 效率比 */}
                    {hudInfo.bendCount !== undefined && (
                        <div style={{
                            marginTop: 2, paddingTop: 2,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', gap: 8
                        }}>
                            <span style={{ color: hudInfo.bendCount <= 2 ? '#52c41a' : hudInfo.bendCount <= 4 ? '#faad14' : '#ff4d4f' }}>
                                ↪ {hudInfo.bendCount} bends
                            </span>
                            {hudInfo.efficiencyRatio !== undefined && (
                                <span style={{
                                    color: hudInfo.efficiencyRatio >= 0.8 ? '#52c41a'
                                        : hudInfo.efficiencyRatio >= 0.5 ? '#faad14' : '#ff4d4f'
                                }}>
                                    △ {(hudInfo.efficiencyRatio * 100).toFixed(0)}%
                                </span>
                            )}
                            {hudInfo.pathLength !== undefined && (
                                <span style={{ color: '#666' }}>{hudInfo.pathLength}px</span>
                            )}
                        </div>
                    )}
                </div>
            )}
            {/* [UX] Mouse world-coordinate crosshair display */}
            {mouseWorldPos && (
                <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: 'rgba(0,0,0,0.6)',
                    borderRadius: 4, padding: '2px 8px',
                    fontSize: 10, color: '#888',
                    pointerEvents: 'none',
                    fontFamily: 'monospace',
                }}>
                    {mouseWorldPos.x}, {mouseWorldPos.y}
                </div>
            )}
        </>
    );

    // [UX] Geometry type color coding — same palette used in HUD and scan results
    function geoColor(geo: string): string {
        if (!geo || geo === '?') return '#888';
        if (geo.includes('diagonal')) return '#ffa940';   // orange — ambiguous
        if (geo.includes('backward') || geo.includes('reverse')) return '#ff4d4f'; // red — problem
        if (geo.includes('forward') || geo.includes('horizontal')) return '#52c41a'; // green — ideal
        if (geo.includes('vertical')) return '#69b1ff';   // blue — vertical
        if (geo.includes('collocated') || geo.includes('overlap')) return '#b37feb'; // purple — special
        return '#aaa';
    }

    const renderControls = () => (
        <Space size={12} style={{ fontSize: 11, color: token.colorTextSecondary, flexWrap: 'wrap' }}>
            <Space size={6}>
                <Switch size="small" checked={showGrid} onChange={setShowGrid} />
                <span>{t('designer.debug.visualizer.grid')}</span>
            </Space>
            <Space size={6}>
                <Switch size="small" checked={showObstacles} onChange={setShowObstacles} />
                <span>{t('designer.debug.visualizer.obstacles')}</span>
            </Space>
            <Space size={6}>
                <Switch size="small" checked={showVG} onChange={setShowVG} />
                <span>{t('designer.debug.visualizer.vg')}</span>
            </Space>
            <Space size={6}>
                <Switch size="small" checked={showQuadTree} onChange={setShowQuadTree} />
                <span>{t('designer.debug.visualizer.quadTree')}</span>
            </Space>
            <Space size={6}>
                <Switch size="small" checked={showTrunk} onChange={setShowTrunk} />
                <span style={{ color: '#ffd666' }}>主干轴</span>
            </Space>
            {/* [UX] Reset view button + zoom indicator */}
            <Tooltip title="重置视图 (fit to content)">
                <Button
                    size="small"
                    onClick={() => { if (debugDataRef.current) fitToContent(debugDataRef.current); }}
                    style={{ fontSize: 11, padding: '0 6px', height: 20, lineHeight: '18px' }}
                >
                    ⊞ 重置
                </Button>
            </Tooltip>
            <span style={{ color: token.colorTextQuaternary, fontFamily: 'monospace' }}>
                {(transform.k * 100).toFixed(0)}%
            </span>
        </Space>
    );

    const renderLegend = () => (
        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(211, 47, 47, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.obstacle')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(76, 175, 80, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.source')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(33, 150, 243, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.target')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(255, 152, 0, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.lineCross')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(255, 193, 7, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.turn')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(33, 150, 243, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.buffer')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(100, 255, 218, 0.8)', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.visited')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: '#ff00ff', marginRight: 4 }}></span> {t('designer.debug.visualizer.legend.rawPath')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                        display: 'inline-block', width: 16, height: 2, marginRight: 4,
                        background: 'repeating-linear-gradient(90deg,#ffd666 0,#ffd666 4px,transparent 4px,transparent 8px)'
                    }}></span> 主干轴
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                        display: 'inline-block', width: 8, height: 8, marginRight: 4,
                        border: '1px dashed #b37feb', borderRadius: 1
                    }}></span> Peer Group
                </div>
            </div>

            {debugData && (
                <div style={{ marginTop: 8, fontSize: 10, color: token.colorTextTertiary, maxHeight: 110, overflowY: 'auto' }}>
                    {(() => {
                        const algorithmDebug = debugData.algorithmDebug && typeof debugData.algorithmDebug === 'object'
                            ? (debugData.algorithmDebug as AlgorithmDebugPayload)
                            : null;
                        const strategy = debugData.metadata?.strategy ?? algorithmDebug?.strategy ?? 'Unknown';
                        const grid = debugData.grid ?? algorithmDebug?.grid;
                        const vgRaw: VisibilityGraphLike | undefined =
                            debugData.vg ?? algorithmDebug?.vg ?? algorithmDebug?.visibilityGraph;
                        const vgEdges = normalizeVisibilityGraph(vgRaw);
                        const quadTree = debugData.quadTree ?? algorithmDebug?.spatialIndex ?? algorithmDebug?.quadTree;
                        const visited = debugData.visited ?? algorithmDebug?.visited;
                        const algorithmDebugAny = debugData.algorithmDebug && typeof debugData.algorithmDebug === 'object'
                            ? (debugData.algorithmDebug as Record<string, any>)
                            : null;
                        const ps = algorithmDebugAny?.portSelection;
                        const c = ps?.centers;
                        const dx = typeof c?.dx === 'number' ? c.dx.toFixed(0) : '?';
                        const dy = typeof c?.dy === 'number' ? c.dy.toFixed(0) : '?';
                        const s = (debugData as unknown as Record<string, any>).selectedSourcePos ?? ps?.selected?.source ?? '?';
                        const tt = (debugData as unknown as Record<string, any>).selectedTargetPos ?? ps?.selected?.target ?? '?';
                        const dir = ps?.effectiveDir ?? ps?.layoutDirection ?? debugData.metadata?.strategy ?? '?';
                        const geo = ps?.geometry ?? ps?.detectedGeometry ?? '?';
                        const expS = typeof ps?.hasExplicitSource === 'boolean' ? (ps.hasExplicitSource ? 'Yes' : 'No') : '?';
                        const expT = typeof ps?.hasExplicitTarget === 'boolean' ? (ps.hasExplicitTarget ? 'Yes' : 'No') : '?';
                        const hS = ps?.sourceHandle ?? '?';
                        const hT = ps?.targetHandle ?? '?';
                        const ld = ps?.layoutDirection ?? '?';
                        const m2o = typeof ps?.isManyToOne === 'boolean' ? (ps.isManyToOne ? 'Yes' : 'No') : '?';
                        const iCnt = typeof ps?.incomingCount === 'number' ? String(ps.incomingCount) : '?';
                        const trunk = typeof ps?.hasPrecomputedTrunk === 'boolean' ? (ps.hasPrecomputedTrunk ? 'Yes' : 'No') : '?';
                        const pgs = typeof ps?.peerGroupSize === 'number' ? String(ps.peerGroupSize) : '?';
                        const pgk = typeof ps?.peerGroupKey === 'string' ? ps.peerGroupKey : '?';
                        const pgm = Array.isArray(ps?.peerGroupMembers) ? (ps.peerGroupMembers as unknown[]).map(String).slice(0, 8).join(',') : '';
                        const trunkAxis = typeof ps?.trunkAxis === 'number' ? ps.trunkAxis.toFixed(0) : '?';
                        const trunkV = typeof ps?.trunkVertical === 'boolean' ? (ps.trunkVertical ? 'V' : 'H') : '?';
                        const wr = algorithmDebugAny?.waypointRefinement;
                        const wrInitial = typeof wr?.initial?.totalScore === 'number' ? wr.initial.totalScore : null;
                        const wrFinal = typeof wr?.final?.totalScore === 'number' ? wr.final.totalScore : null;
                        const wrChanged = typeof wr?.changed === 'boolean' ? (wr.changed ? 'moved' : 'kept') : '?';
                        const wrShift = typeof wr?.segmentShiftChanges === 'number' ? wr.segmentShiftChanges : 0;
                        const wrReroute = typeof wr?.rerouteChanges === 'number' ? wr.rerouteChanges : 0;
                        const wrHard = typeof wr?.final?.hardCrossings === 'number' ? wr.final.hardCrossings : '?';
                        const wrSoft = typeof wr?.final?.softCrossings === 'number' ? wr.final.softCrossings : '?';
                        const wrNear = typeof wr?.final?.softNearMisses === 'number' ? wr.final.softNearMisses : '?';

                        return (
                            <>
                                <div style={{ color: token.colorSuccess, fontWeight: 600 }}>
                                    {t('designer.debug.visualizer.stats.strategy', { value: strategy })}
                                </div>
                                <div>
                                    {t('designer.debug.visualizer.stats.grid', { value: grid ? t('common.on') : t('common.off') })}
                                    {' | '}
                                    {t('designer.debug.visualizer.stats.vg', { value: vgEdges.length > 0 ? String(vgEdges.length) : t('common.off') })}
                                    {' | '}
                                    {t('designer.debug.visualizer.stats.qt', { value: quadTree ? t('common.on') : t('common.off') })}
                                </div>
                                <div>
                                    {t('designer.debug.visualizer.stats.visited', { count: visited ? visited.length : 0 })}
                                </div>
                                <div>
                                    {t('designer.debug.visualizer.stats.ports', { source: s, target: tt, dir, geo, dx, dy })}
                                </div>
                                <div>
                                    {`Explicit: S=${expS} T=${expT} | Handles: ${hS} -> ${hT} | LayoutDir: ${ld}`}
                                </div>
                                <div>
                                    {`Bus: M2O=${m2o} incomingCount=${iCnt} | Trunk: pre=${trunk} | PeerGroup=${pgs} (${pgk})`}
                                </div>
                                <div>
                                    {`TrunkAxis: ${trunkV} ${trunkAxis}`}
                                </div>
                                {pgm ? <div>{`Peers: ${pgm}${Array.isArray(ps?.peerGroupMembers) && (ps.peerGroupMembers as unknown[]).length > 8 ? '…' : ''}`}</div> : null}
                                {wrInitial !== null && wrFinal !== null ? (
                                    <div style={{ color: wrFinal < wrInitial ? token.colorSuccess : token.colorTextTertiary }}>
                                        {`WR: ${wrInitial} -> ${wrFinal} (${wrChanged}) | hard=${wrHard} soft=${wrSoft} near=${wrNear} | shift=${wrShift} reroute=${wrReroute}`}
                                    </div>
                                ) : null}
                                {debugData.metadata && (
                                    <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        <div>{t('designer.debug.visualizer.stats.time', { ms: debugData.metadata.duration?.toFixed(2) ?? '?' })}</div>
                                        <div>{t('designer.debug.visualizer.stats.steps', { count: debugData.metadata.steps ?? 0 })}</div>
                                        {debugData.metadata.length ? <div>{t('designer.debug.visualizer.stats.length', { value: debugData.metadata.length.toFixed(0) })}</div> : null}
                                    </div>
                                )}
                                {/* [路径质量] 弯折/效率/长度 指标行 */}
                                {(() => {
                                    const meta = debugData.metadata as any;
                                    const bc = meta?.bendCount;
                                    const er = meta?.efficiencyRatio;
                                    const pl = meta?.pathLength;
                                    if (bc === undefined && er === undefined) return null;
                                    const bcColor = bc <= 2 ? '#52c41a' : bc <= 4 ? '#faad14' : '#ff4d4f';
                                    const erColor = er >= 0.8 ? '#52c41a' : er >= 0.5 ? '#faad14' : '#ff4d4f';
                                    return (
                                        <div style={{
                                            marginTop: 6, padding: '4px 6px',
                                            background: 'rgba(255,255,255,0.04)',
                                            borderRadius: 4, display: 'flex', gap: 10, flexWrap: 'wrap'
                                        }}>
                                            <span style={{ color: bcColor }}>↪ {bc} bends</span>
                                            {er !== undefined && <span style={{ color: erColor }}>△ {(er * 100).toFixed(0)}% eff</span>}
                                            {pl !== undefined && <span style={{ color: '#555' }}>{pl}px</span>}
                                        </div>
                                    );
                                })()}
                            </>
                        );
                    })()}
                </div>
            )}

            <Typography.Text type="secondary" style={{ marginTop: 6, fontSize: 11 }}>
                {t('designer.debug.visualizer.selectEdgeHint')}
            </Typography.Text>
        </div>
    );

    const runDebug = () => {
        const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as DebuggableCoordinator;
        const edgeId = targetEdgeIdRef.current || targetEdgeId || null;
        if ('forceDebugReRoute' in coordinator && typeof coordinator.forceDebugReRoute === 'function') {
            if ('setDebugEdge' in coordinator && typeof coordinator.setDebugEdge === 'function') {
                coordinator.setDebugEdge(edgeId);
            }
            coordinator.forceDebugReRoute(edgeId);
        } else {
            coordinator.notifyGraphChange();
        }
    };

    // [SCAN] Scan all edges - 优化版：优先读路由缓存，避免强制重路由
    const scanAllEdges = useCallback(async () => {
        const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as DebuggableCoordinator;
        if (!('setDebugEdge' in coordinator) || !('forceDebugReRoute' in coordinator)) return;

        const edgeEls = document.querySelectorAll('.react-flow__edge');
        const edgeIds = [...edgeEls].map(e => e.getAttribute('data-id')).filter(Boolean) as string[];
        if (edgeIds.length === 0) return;

        setIsScanning(true);
        setScanResults(null);
        setShowScan(true);

        const rows: ScanRow[] = [];

        // [提速] 尝试从缓存读取每个边的路由结果，避免强制重路由
        // 如果缓存命中则直接提取元数据；不命中再 fallback 到强制重路由
        const cacheCoord = coordinator as any;
        const hasGetCached = typeof cacheCoord.getCachedResult === 'function';

        for (const eid of edgeIds) {
            // 尝试从 latestRequests 构建请求对象然后读缓存
            let cachedMeta: any = null;
            if (hasGetCached) {
                const entry = cacheCoord.latestRequests?.get(eid);
                if (entry) {
                    const cached = cacheCoord.getCachedResult(entry.request);
                    if (cached) cachedMeta = cached;
                }
            }

            if (cachedMeta && cachedMeta.algorithmDebug) {
                // 缓存命中 — 直接提取元数据
                const data = cachedMeta as any;
                const ad = data.algorithmDebug && typeof data.algorithmDebug === 'object'
                    ? data.algorithmDebug as Record<string, any> : null;
                const ps = ad?.portSelection;
                const dataAny = data as Record<string, any>;
                const strategy = data.metadata?.strategy ?? ad?.strategy ?? 'Unknown';
                const s = dataAny.selectedSourcePos ?? ps?.selected?.source ?? '?';
                const tt = dataAny.selectedTargetPos ?? ps?.selected?.target ?? '?';
                const geo = ps?.geometry ?? ps?.detectedGeometry ?? '?';
                const isM2O = ps?.isManyToOne === true;
                const layoutDir = ps?.layoutDirection ?? '';
                const backward = typeof geo === 'string' && geo.includes('backward');
                const tbMismatch = layoutDir === 'TB' && (s === 'left' || s === 'right' || tt === 'left' || tt === 'right');
                const lrMismatch = (layoutDir === 'LR' || layoutDir === 'RL') && (s === 'top' || s === 'bottom' || tt === 'top' || tt === 'bottom');
                rows.push({ edgeId: eid, port: `${s}→${tt}`, strategy, geo, isM2O, anomaly: backward || tbMismatch || lrMismatch });
            } else {
                // 缓存未命中 — fallback 到强制重路由
                await new Promise<void>((resolve) => {
                    const onDebug = (data: DebugPayload) => {
                        const ad = data.algorithmDebug && typeof data.algorithmDebug === 'object'
                            ? (data.algorithmDebug as Record<string, any>) : null;
                        const ps = ad?.portSelection;
                        const dataAny = data as unknown as Record<string, any>;
                        const strategy = data.metadata?.strategy ?? ad?.strategy ?? 'Unknown';
                        const s = dataAny.selectedSourcePos ?? ps?.selected?.source ?? '?';
                        const tt = dataAny.selectedTargetPos ?? ps?.selected?.target ?? '?';
                        const geo = ps?.geometry ?? ps?.detectedGeometry ?? '?';
                        const isM2O = ps?.isManyToOne === true;
                        const layoutDir = ps?.layoutDirection ?? '';
                        const backward = typeof geo === 'string' && geo.includes('backward');
                        const tbMismatch = layoutDir === 'TB' && (s === 'left' || s === 'right' || tt === 'left' || tt === 'right');
                        const lrMismatch = (layoutDir === 'LR' || layoutDir === 'RL') && (s === 'top' || s === 'bottom' || tt === 'top' || tt === 'bottom');
                        rows.push({ edgeId: eid, port: `${s}→${tt}`, strategy, geo, isM2O, anomaly: backward || tbMismatch || lrMismatch });
                        coordinator.registerDebugListener(debugListenerRef.current);
                        resolve();
                    };
                    coordinator.registerDebugListener(onDebug);
                    coordinator.setDebugEdge(eid);
                    coordinator.forceDebugReRoute(eid);
                    setTimeout(() => { coordinator.registerDebugListener(debugListenerRef.current); resolve(); }, 1500);
                });
            }
        }

        coordinator.setDebugEdge(targetEdgeIdRef.current || null);
        setScanResults(rows);
        setIsScanning(false);

        document.querySelectorAll('.react-flow__edge').forEach(el => {
            el.classList.remove('vizly-debug-anomaly', 'vizly-debug-ok');
        });
        rows.forEach(row => {
            const el = document.querySelector(`.react-flow__edge[data-id="${row.edgeId}"]`);
            if (el) el.classList.add(row.anomaly ? 'vizly-debug-anomaly' : 'vizly-debug-ok');
        });
    }, []);

    // Clear edge highlights when scan panel is closed
    const clearScanHighlights = useCallback(() => {
        document.querySelectorAll('.react-flow__edge').forEach(el => {
            el.classList.remove('vizly-debug-anomaly', 'vizly-debug-ok');
        });
        setShowScan(false);
    }, []);

    return (
        <div style={{ padding: 10, height: '100%', display: 'flex', flexDirection: 'column', color: token.colorText, overflowY: 'auto' }}>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Input
                    placeholder={t('designer.debug.visualizer.edgeIdPlaceholder')}
                    value={targetEdgeId}
                    onChange={(e) => setTargetEdgeId(e.target.value)}
                    onPressEnter={runDebug}
                    size="small"
                    allowClear
                />
                <Button type="primary" size="small" onClick={runDebug}>
                    {t('designer.debug.visualizer.debug')}
                </Button>
                <Tooltip title="扫描图中所有边，列出端口异常">
                    <Button
                        size="small"
                        loading={isScanning}
                        onClick={scanAllEdges}
                        style={{ background: showScan ? '#1d3557' : undefined }}
                    >
                        🔍 扫描全图
                    </Button>
                </Tooltip>
                <Tooltip title={isMaximized ? t('designer.debug.visualizer.restore') : t('designer.debug.visualizer.maximize')}>
                    <Button
                        size="small"
                        onClick={() => setIsMaximized(!isMaximized)}
                        aria-label={isMaximized ? t('designer.debug.visualizer.restore') : t('designer.debug.visualizer.maximize')}
                    >
                        {isMaximized ? '❐' : '□'}
                    </Button>
                </Tooltip>
            </div>

            {/* [SCAN] Visual scan results */}
            {showScan && scanResults && (() => {
                const total = scanResults.length;
                const anomalyCount = scanResults.filter(r => r.anomaly).length;
                const okCount = total - anomalyCount;
                const m2oCount = scanResults.filter(r => r.isM2O).length;
                const healthPct = total > 0 ? Math.round((okCount / total) * 100) : 100;
                const anomalies = scanResults.filter(r => r.anomaly);
                const healthColor = anomalyCount === 0 ? '#52c41a' : anomalyCount <= 2 ? '#faad14' : '#ff4d4f';

                return (
                    <div style={{
                        marginBottom: 8,
                        background: 'rgba(0,0,0,0.3)',
                        border: `1px solid ${anomalyCount > 0 ? '#ff4d4f44' : '#52c41a44'}`,
                        borderRadius: 6,
                        padding: '8px 10px',
                        fontSize: 11,
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontWeight: 600, color: token.colorText }}>路由健康检查</span>
                            <Button type="text" size="small" onClick={clearScanHighlights}
                                style={{ padding: '0 4px', height: 16, fontSize: 11, color: token.colorTextSecondary }}>
                                ✕ 清除高亮
                            </Button>
                        </div>

                        {/* Health bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{
                                flex: 1, height: 6, borderRadius: 3,
                                background: '#333', overflow: 'hidden', position: 'relative'
                            }}>
                                <div style={{
                                    position: 'absolute', left: 0, top: 0,
                                    width: `${healthPct}%`, height: '100%',
                                    background: healthColor,
                                    transition: 'width 0.4s ease'
                                }} />
                            </div>
                            <span style={{ color: healthColor, fontWeight: 700, minWidth: 32 }}>{healthPct}%</span>
                        </div>

                        {/* Stats row */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: anomalies.length > 0 ? 8 : 0 }}>
                            <span style={{ color: '#52c41a' }}>✅ 正常 {okCount}</span>
                            <span style={{ color: anomalyCount > 0 ? '#ff4d4f' : token.colorTextSecondary }}>
                                {anomalyCount > 0 ? '🔴' : '◎'} 异常 {anomalyCount}
                            </span>
                            <span style={{ color: '#1890ff' }}>⇉ M2O {m2oCount}</span>
                            <span style={{ color: token.colorTextSecondary }}>共 {total} 条</span>
                        </div>

                        {/* Anomaly list + optional full list */}
                        {anomalies.length > 0 && (
                            <div style={{ borderTop: '1px solid #333', paddingTop: 6 }}>
                                <div style={{ color: '#ff4d4f', marginBottom: 4, fontWeight: 600 }}>⚠ 异常边（点击调试）</div>
                                {anomalies.map(row => (
                                    <ScanRowItem key={row.edgeId} row={row} geoColor={geoColor} token={token}
                                        onClick={() => { setTargetEdgeId(row.edgeId); targetEdgeIdRef.current = row.edgeId; runDebug(); }}
                                    />
                                ))}
                            </div>
                        )}
                        {/* [UX] Expandable list of all edges */}
                        <div style={{ borderTop: '1px solid #222', paddingTop: 4, marginTop: 4 }}>
                            <Button type="text" size="small"
                                style={{ fontSize: 10, color: token.colorTextTertiary, padding: '0 2px', height: 18 }}
                                onClick={() => setShowAllScanEdges(v => !v)}
                            >
                                {showAllScanEdges ? '▲ 收起全部边' : `▼ 查看全部 ${scanResults.length} 条边`}
                            </Button>
                            {showAllScanEdges && (
                                <div style={{ marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
                                    {scanResults.map(row => (
                                        <ScanRowItem key={row.edgeId} row={row} geoColor={geoColor} token={token}
                                            onClick={() => { setTargetEdgeId(row.edgeId); targetEdgeIdRef.current = row.edgeId; runDebug(); }}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {anomalies.length === 0 && (
                            <div style={{ color: '#52c41a', textAlign: 'center', padding: '4px 0', fontWeight: 500 }}>
                                🎉 所有连线路由正常！
                            </div>
                        )}
                    </div>
                );
            })()}

            <div style={{ marginBottom: '8px' }}>
                {renderControls()}
            </div>

            {/* Normal View */}
            {!isMaximized && (
                <div ref={containerRef} style={{
                    flex: customHeight ? 'none' : 1,
                    height: customHeight ? customHeight : 'auto',
                    minHeight: '400px',
                    position: 'relative',
                    background: '#000',
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}>
                    {canvasContent}
                </div>
            )}

            {/* Maximized Overlay */}
            {isMaximized && createPortal(
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    zIndex: 99999,
                    background: token.colorBgLayout,
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <div style={{ padding: 10, background: token.colorBgElevated, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                            <span style={{ color: token.colorTextHeading, fontWeight: 600 }}>{t('designer.debug.visualizer.title')}</span>
                            {renderControls()}
                        </div>
                        <Button size="small" onClick={() => setIsMaximized(false)}>
                            {t('designer.debug.visualizer.close')}
                        </Button>
                    </div>
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }} ref={containerRef}>
                        {canvasContent}
                    </div>
                    <div style={{ padding: 10, background: token.colorBgElevated, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                        {renderLegend()}
                    </div>
                </div>,
                document.body
            )}

            {/* Legend / Info Footer (Normal View) */}
            {!isMaximized && (
                <div style={{ marginTop: '10px', borderTop: '1px solid #333', paddingTop: '5px' }}>
                    {renderLegend()}
                </div>
            )}
        </div>
    );
};
