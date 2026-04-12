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
    const [isMaximized, setIsMaximized] = useState(false);

    // Zoom & Pan State
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });

    const targetEdgeIdRef = useRef(targetEdgeId);

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

        // Check Grid
        const grid = data.grid ?? algorithmDebug?.grid;
        if (grid && 'data' in grid) {
            updateRect(grid.minX, grid.minY, grid.cols * grid.size, grid.rows * grid.size);
        }

        // Check Obstacles
        const obstacles = data.obstacles ?? algorithmDebug?.obstacles;
        if (obstacles && Array.isArray(obstacles)) {
            obstacles.forEach((o) => updateRect(o.x, o.y, o.w ?? o.width ?? 0, o.h ?? o.height ?? 0));
        }

        // Check Path
        const path = data.pathPoints || data.path;
        if (path && Array.isArray(path)) {
            path.forEach((p) => updateBounds(p.x, p.y));
        }

        // Check Raw Path
        const rawPoints = algorithmDebug?.rawPoints;
        if (rawPoints && Array.isArray(rawPoints)) {
            rawPoints.forEach((p) => updateBounds(p.x, p.y));
        }

        // Check Raw Visited (search graph)
        const visitedForFit = data.visited ?? algorithmDebug?.visited;
        if (visitedForFit && Array.isArray(visitedForFit)) {
            visitedForFit.forEach((p) => updateBounds(p.x, p.y));
        }

        // Check Points (Start/End)
        if (data.points && Array.isArray(data.points)) {
            data.points.forEach((p) => updateBounds(p.x, p.y));
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
        const MIN_SCALE = 0.1;
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

        ctx.restore();
    }, [canvasRef, showGrid, showObstacles, showVG, showQuadTree, transform, toScreen]);

    // Redraw when data or flags change
    useEffect(() => {
        if (debugData) {
            drawVisualization(debugData);
        }
    }, [debugData, showGrid, showObstacles, showVG, showQuadTree, transform, drawVisualization, canvasSize]);

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
        if (!isDragging) return;
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as DebuggableCoordinator;

        const handleDebugData = (data: DebugPayload) => {
            const want = targetEdgeIdRef.current;
            if (data && (!want || !data.edgeId || data.edgeId === want)) {
                setDebugData(data);
                fitToContent(data);
            }
        };

        const handleSelectionChange = (edgeId: string | null) => {
            if (edgeId) setTargetEdgeId(edgeId);
        };

        coordinator.registerDebugListener(handleDebugData);
        coordinator.registerSelectionListener(handleSelectionChange);

        return () => {
            coordinator.registerDebugListener(null);
            coordinator.registerSelectionListener(null);
        };
    }, [fitToContent]);

    useEffect(() => {
        const coordinator = EdgeRoutingCoordinator.getInstance() as unknown as DebuggableCoordinator;
        coordinator.setDebugEdge(targetEdgeId || null);
    }, [targetEdgeId]);

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
                onMouseLeave={handleMouseUp}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', cursor: isDragging ? 'grabbing' : 'grab' }}
            />
            {!debugData && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: token.colorTextQuaternary, pointerEvents: 'none' }}>
                    {t('designer.debug.visualizer.noDebugData')}
                </div>
            )}
        </>
    );

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
                                {debugData.metadata && (
                                    <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        <div>{t('designer.debug.visualizer.stats.time', { ms: debugData.metadata.duration?.toFixed(2) ?? '?' })}</div>
                                        <div>{t('designer.debug.visualizer.stats.steps', { count: debugData.metadata.steps ?? 0 })}</div>
                                        {debugData.metadata.length ? <div>{t('designer.debug.visualizer.stats.length', { value: debugData.metadata.length.toFixed(0) })}</div> : null}
                                    </div>
                                )}
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

    return (
        <div style={{ padding: 10, height: '100%', display: 'flex', flexDirection: 'column', color: token.colorText, overflowY: 'auto' }}>
            <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
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
