import React, { useMemo } from 'react';
import { useViewport, useNodes, useEdges } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { FaArrowRight, FaExpand, FaKeyboard, FaTh, FaThumbtack } from 'react-icons/fa';
import { Tooltip, Button, Divider } from 'antd';

interface DiagramStatusBarProps {
    autoRoutingEnabled: boolean;
    selectedNodesCount: number;
    selectedEdgesCount: number;
    onFitView: () => void;
    snapToGrid?: boolean;
    onToggleSnap?: () => void;
    /** 批注模式 */
    annotationMode?: boolean;
    onToggleAnnotation?: () => void;
    annotationCount?: number;
}

export const DiagramStatusBar: React.FC<DiagramStatusBarProps> = React.memo(({
    autoRoutingEnabled,
    selectedNodesCount,
    selectedEdgesCount,
    onFitView,
    snapToGrid,
    onToggleSnap,
    annotationMode,
    onToggleAnnotation,
    annotationCount = 0,
}) => {
    const { t } = useTranslation();
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
    const mod = isMac ? '⌘' : 'Ctrl';
    const nodes = useNodes();
    const edges = useEdges();
    const { zoom } = useViewport();

    const zoomPercent = Math.round(zoom * 100);

    // 节点形状统计
    const shapeStats = useMemo(() => {
        const counts: Record<string, number> = {};
        nodes.forEach(n => {
            const shape = (n.data as Record<string, unknown>)?.shape as string || 'rectangle';
            counts[shape] = (counts[shape] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [nodes]);

    // 域统计
    const domainStats = useMemo(() => {
        const domains = new Set<string>();
        nodes.forEach(n => {
            const domain = (n.data as Record<string, unknown>)?.domain as string;
            if (domain) domains.add(domain);
        });
        return domains;
    }, [nodes]);

    const shapeSummary = [
        ...shapeStats.map(([shape, count]) => `${shape}: ${count}`),
        domainStats.size > 0
            ? `─────\n${t('designer.statusBar.domainList', { domains: [...domainStats].join(', ') })}`
            : '',
    ].filter(Boolean).join('\n');

    const snapLabel = snapToGrid
        ? t('designer.statusBar.snapEnabled')
        : t('designer.statusBar.snapDisabled');
    const annotationLabel = annotationMode
        ? t('designer.statusBar.annotationEnabled')
        : t('designer.statusBar.annotationDisabled');

    return (
        <div
            className="diagram-status-bar"
            style={{ pointerEvents: 'auto' }}
            role="region"
            aria-label={t('designer.statusBar.label')}
        >
            {/* Stats with shape tooltip */}
            <Tooltip title={shapeSummary || t('designer.statusBar.noNodes')} placement="top">
                <div className="status-item" style={{ cursor: 'help' }}>
                    <div className="status-dot" style={{ backgroundColor: '#4CAF50', boxShadow: '0 0 8px rgba(76, 175, 80, 0.4)' }}></div>
                    <span><strong>{nodes.length}</strong> {t('designer.statusBar.nodes')}</span>
                    {(shapeStats.length > 1 || domainStats.size > 0) && (
                        <span style={{ fontSize: 10, color: '#999', marginLeft: 2 }}>
                            ({shapeStats.length}类{domainStats.size > 0 ? ` · ${domainStats.size}域` : ''})
                        </span>
                    )}
                </div>
            </Tooltip>
            <div className="status-item">
                <div className="status-dot" style={{ backgroundColor: '#2196F3', boxShadow: '0 0 8px rgba(33, 150, 243, 0.4)' }}></div>
                <span><strong>{edges.length}</strong> {t('designer.statusBar.edges')}</span>
            </div>

            {(selectedNodesCount > 0 || selectedEdgesCount > 0) && (
                <>
                    <Divider orientation="vertical" style={{ margin: '0 4px' }} />
                    <div className="status-item" style={{ color: '#1890ff' }}>
                        <span>{t('designer.statusBar.selectedSummary', { nodes: selectedNodesCount, edges: selectedEdgesCount })}</span>
                    </div>
                </>
            )}

            <div className="status-separator"></div>

            {/* Snap to Grid */}
            {onToggleSnap && (
                <>
                    <Tooltip title={snapLabel}>
                        <button
                            type="button"
                            className="status-item status-action"
                            aria-label={snapLabel}
                            aria-pressed={Boolean(snapToGrid)}
                            onClick={onToggleSnap}
                        >
                            <FaTh aria-hidden="true" size={10} style={{ color: snapToGrid ? '#1976d2' : '#999' }} />
                            <span style={{ fontSize: 10, color: snapToGrid ? '#1976d2' : '#999' }}>
                                {snapToGrid
                                    ? t('designer.statusBar.snapShortEnabled')
                                    : t('designer.statusBar.snapShortDisabled')}
                            </span>
                        </button>
                    </Tooltip>
                    <div className="status-separator"></div>
                </>
            )}

            {/* Mode */}
            <Tooltip title={autoRoutingEnabled ? t('designer.statusBar.smartRoutingEnabled') : t('designer.statusBar.directRoutingEnabled')}>
                <span className="status-mode" style={{ color: autoRoutingEnabled ? '#1976d2' : '#999', cursor: 'default' }}>
                    <FaArrowRight size={10} style={{ transform: autoRoutingEnabled ? 'rotate(0deg)' : 'rotate(45deg)' }} />
                    {autoRoutingEnabled ? t('designer.statusBar.smartMesh') : t('designer.statusBar.directLink')}
                </span>
            </Tooltip>

            <div className="status-separator"></div>

            {/* Command Palette Hint */}
            <Tooltip title={t('designer.flowchart.commandPaletteHint', { mod })}>
                <div className="status-item" style={{ cursor: 'help', color: '#666' }}>
                    <FaKeyboard style={{ marginRight: 4 }} />
                    <span style={{ fontSize: '10px', opacity: 0.8, fontWeight: 700 }}>{mod}+K</span>
                </div>
            </Tooltip>

            <div className="status-separator"></div>

            {/* Annotation Mode */}
            {onToggleAnnotation && (
                <>
                    <Tooltip title={annotationLabel}>
                        <button
                            type="button"
                            className="status-item status-action"
                            aria-label={annotationLabel}
                            aria-pressed={Boolean(annotationMode)}
                            onClick={onToggleAnnotation}
                        >
                            <FaThumbtack aria-hidden="true" size={10} style={{ color: annotationMode ? '#f59e0b' : '#999' }} />
                            <span style={{ fontSize: 10, color: annotationMode ? '#f59e0b' : '#999', fontWeight: annotationMode ? 700 : 400 }}>
                                {annotationCount > 0
                                    ? t('designer.statusBar.annotationCount', { count: annotationCount })
                                    : t('designer.statusBar.annotation')}
                            </span>
                        </button>
                    </Tooltip>
                    <div className="status-separator"></div>
                </>
            )}

            {/* Zoom Info & Quick Actions */}
            <div className="status-item">
                <span style={{ minWidth: '40px', textAlign: 'right', fontFamily: 'monospace' }}>{zoomPercent}%</span>
                <Tooltip title={t('designer.toolbar.fitView')}>
                    <Button
                        type="text"
                        size="small"
                        icon={<FaExpand style={{ fontSize: '11px' }} />}
                        onClick={(e) => {
                            e.stopPropagation();
                            onFitView();
                        }}
                        style={{ marginLeft: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        aria-label={t('designer.toolbar.fitView')}
                    />
                </Tooltip>
            </div>
        </div>
    );
});

