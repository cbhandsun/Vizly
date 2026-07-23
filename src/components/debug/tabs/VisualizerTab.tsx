import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import Switch from 'antd/es/switch';
import Space from 'antd/es/space';
import Tooltip from 'antd/es/tooltip';
import { theme } from 'antd';
import type { GlobalToken } from 'antd/es/theme/interface';
import { useTranslation } from 'react-i18next';
import { EdgeRoutingCoordinator } from '@/core/services/EdgeRoutingCoordinator';
import {
    calculateVisualizerFit,
    extractVisualizerScanFields,
    type DebugPayload,
} from './visualizerModel';
import { drawVisualizerCanvas } from './visualizerCanvasRenderer';
import { VisualizerLegend } from './VisualizerLegend';

// Define interface for Coordinator to avoid 'any'
interface DebuggableCoordinator {
    registerDebugListener(cb: ((data: DebugPayload) => void) | null): void;
    registerSelectionListener(cb: ((id: string | null) => void) | null): void;
    setDebugEdge(id: string | null): void;
    forceDebugReRoute(id: string | null): void;
    notifyGraphChange(): void;
    getCachedDebugPayload(edgeId: string): Record<string, unknown> | null;
}

interface ScanRowItemProps {
    row: { edgeId: string; port: string; strategy: string; geo: string; isM2O: boolean; anomaly: boolean };
    geoColor: (geo: string) => string;
    token: GlobalToken;
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
    const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number } | null>(null);
    const [showAllScanEdges, setShowAllScanEdges] = useState(false);

    interface ScanRow { edgeId: string; port: string; strategy: string; geo: string; isM2O: boolean; anomaly: boolean; }
    const [scanResults, setScanResults] = useState<ScanRow[] | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [showScan, setShowScan] = useState(false);

    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    const [isDragging, setIsDragging] = useState(false);
    const lastMouseRef = useRef({ x: 0, y: 0 });
    // [FIX] Keep a ref to the React debug listener so scanAllEdges can restore it after clearing
    const debugListenerRef = useRef<((data: DebugPayload) => void) | null>(null);

    const targetEdgeIdRef = useRef(targetEdgeId);
    // [UX] Ref to fitToContent so reset button can reuse it without stale closure
    const debugDataRef = useRef<DebugPayload | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

    useEffect(() => {
        targetEdgeIdRef.current = targetEdgeId;
    }, [targetEdgeId]);

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

    const fitToContent = useCallback((data: DebugPayload) => {
        if (!containerRef.current) return;
        const { clientWidth, clientHeight } = containerRef.current;
        const nextTransform = calculateVisualizerFit(data, {
            width: clientWidth || canvasSize.width,
            height: clientHeight || canvasSize.height,
        });
        if (nextTransform) setTransform(nextTransform);
    }, [canvasSize]);

    const drawVisualization = useCallback((data: DebugPayload) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        drawVisualizerCanvas(canvas, data, {
            showGrid,
            showObstacles,
            showVG,
            showQuadTree,
            showTrunk,
            transform,
            viewport: canvasSize,
        });
    }, [canvasSize, showGrid, showObstacles, showQuadTree, showTrunk, showVG, transform]);

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
        const fields = extractVisualizerScanFields(debugData);
        const strategy = fields.strategy;
        const s = fields.source;
        const tt = fields.target;
        const geo = fields.geometry;
        const ms = debugData.metadata?.duration?.toFixed(1) ?? '?';
        // [路径质量] 从 metadata 提取弯折数/长度/效率比
        const bendCount = debugData.metadata?.bendCount;
        const pathLength = debugData.metadata?.pathLength;
        const efficiencyRatio = debugData.metadata?.efficiencyRatio;
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

    const renderLegend = () => <VisualizerLegend debugData={debugData} />;

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
        for (const eid of edgeIds) {
            // 尝试从 latestRequests 构建请求对象然后读缓存
            const cachedMeta = coordinator.getCachedDebugPayload(eid);

            if (cachedMeta) {
                // 缓存命中 — 直接提取元数据
                const fields = extractVisualizerScanFields(cachedMeta);
                const { strategy, source: s, target: tt, geometry: geo } = fields;
                const isM2O = fields.isManyToOne;
                const layoutDir = fields.layoutDirection;
                const backward = typeof geo === 'string' && geo.includes('backward');
                const tbMismatch = layoutDir === 'TB' && (s === 'left' || s === 'right' || tt === 'left' || tt === 'right');
                const lrMismatch = (layoutDir === 'LR' || layoutDir === 'RL') && (s === 'top' || s === 'bottom' || tt === 'top' || tt === 'bottom');
                rows.push({ edgeId: eid, port: `${s}→${tt}`, strategy, geo, isM2O, anomaly: backward || tbMismatch || lrMismatch });
            } else {
                // 缓存未命中 — fallback 到强制重路由
                await new Promise<void>((resolve) => {
                    const onDebug = (data: DebugPayload) => {
                        const fields = extractVisualizerScanFields(data);
                        const { strategy, source: s, target: tt, geometry: geo } = fields;
                        const isM2O = fields.isManyToOne;
                        const layoutDir = fields.layoutDirection;
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
