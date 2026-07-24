import React from 'react';
import Typography from 'antd/es/typography';
import { theme } from 'antd';
import { useTranslation } from 'react-i18next';

import { createVisualizerLegendDetails } from './visualizerLegendModel';
import type { DebugPayload } from './visualizerModel';

const legendItems = [
    ['rgba(211, 47, 47, 0.8)', 'obstacle'],
    ['rgba(76, 175, 80, 0.8)', 'source'],
    ['rgba(33, 150, 243, 0.8)', 'target'],
    ['rgba(255, 152, 0, 0.8)', 'lineCross'],
    ['rgba(255, 193, 7, 0.8)', 'turn'],
    ['rgba(33, 150, 243, 0.8)', 'buffer'],
    ['rgba(100, 255, 218, 0.8)', 'visited'],
    ['#ff00ff', 'rawPath'],
] as const;

export const VisualizerLegend: React.FC<{ debugData: DebugPayload | null }> = ({ debugData }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const details = debugData ? createVisualizerLegendDetails(debugData) : null;

    return (
        <div style={{ fontSize: 11, color: token.colorTextSecondary }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
                {legendItems.map(([color, key]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, background: color, marginRight: 4 }} />
                        {t(`designer.debug.visualizer.legend.${key}`)}
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 16, height: 2, marginRight: 4, background: 'repeating-linear-gradient(90deg,#ffd666 0,#ffd666 4px,transparent 4px,transparent 8px)' }} />
                    主干轴
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, marginRight: 4, border: '1px dashed #b37feb', borderRadius: 1 }} />
                    Peer Group
                </div>
            </div>

            {debugData && details && (
                <div style={{ marginTop: 8, fontSize: 10, color: token.colorTextTertiary, maxHeight: 110, overflowY: 'auto' }}>
                    <div style={{ color: token.colorSuccess, fontWeight: 600 }}>
                        {t('designer.debug.visualizer.stats.strategy', { value: details.strategy })}
                    </div>
                    <div>
                        {t('designer.debug.visualizer.stats.grid', { value: details.hasGrid ? t('common.on') : t('common.off') })}
                        {' | '}
                        {t('designer.debug.visualizer.stats.vg', { value: details.visibilityEdgeCount > 0 ? String(details.visibilityEdgeCount) : t('common.off') })}
                        {' | '}
                        {t('designer.debug.visualizer.stats.qt', { value: details.hasQuadTree ? t('common.on') : t('common.off') })}
                    </div>
                    <div>{t('designer.debug.visualizer.stats.visited', { count: details.visitedCount })}</div>
                    <div>{t('designer.debug.visualizer.stats.ports', { source: details.source, target: details.target, dir: details.direction, geo: details.geometry, dx: details.deltaX, dy: details.deltaY })}</div>
                    <div>{`Explicit: S=${details.explicitSource} T=${details.explicitTarget} | Handles: ${details.sourceHandle} -> ${details.targetHandle} | LayoutDir: ${details.layoutDirection}`}</div>
                    <div>{`Bus: M2O=${details.manyToOne} incomingCount=${details.incomingCount} | Trunk: pre=${details.hasPrecomputedTrunk} | PeerGroup=${details.peerGroupSize} (${details.peerGroupKey})`}</div>
                    <div>{`TrunkAxis: ${details.trunkOrientation} ${details.trunkAxis}`}</div>
                    {details.peerGroupMembers && <div>{`Peers: ${details.peerGroupMembers}${details.hasMorePeerGroupMembers ? '…' : ''}`}</div>}
                    {details.waypointInitialScore !== null && details.waypointFinalScore !== null && (
                        <div style={{ color: details.waypointFinalScore < details.waypointInitialScore ? token.colorSuccess : token.colorTextTertiary }}>
                            {`WR: ${details.waypointInitialScore} -> ${details.waypointFinalScore} (${details.waypointChanged}) | hard=${details.waypointHardCrossings} soft=${details.waypointSoftCrossings} near=${details.waypointNearMisses} | shift=${details.waypointShiftChanges} reroute=${details.waypointRerouteChanges}`}
                        </div>
                    )}
                    {debugData.metadata && (
                        <div style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <div>{t('designer.debug.visualizer.stats.time', { ms: debugData.metadata.duration?.toFixed(2) ?? '?' })}</div>
                            <div>{t('designer.debug.visualizer.stats.steps', { count: debugData.metadata.steps ?? 0 })}</div>
                            {debugData.metadata.length ? <div>{t('designer.debug.visualizer.stats.length', { value: debugData.metadata.length.toFixed(0) })}</div> : null}
                        </div>
                    )}
                    {(debugData.metadata?.bendCount !== undefined || debugData.metadata?.efficiencyRatio !== undefined) && (
                        <div style={{ marginTop: 6, padding: '4px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ color: (debugData.metadata?.bendCount ?? 0) <= 2 ? '#52c41a' : (debugData.metadata?.bendCount ?? 0) <= 4 ? '#faad14' : '#ff4d4f' }}>
                                ↪ {debugData.metadata?.bendCount} bends
                            </span>
                            {debugData.metadata?.efficiencyRatio !== undefined && (
                                <span style={{ color: debugData.metadata.efficiencyRatio >= 0.8 ? '#52c41a' : debugData.metadata.efficiencyRatio >= 0.5 ? '#faad14' : '#ff4d4f' }}>
                                    △ {(debugData.metadata.efficiencyRatio * 100).toFixed(0)}% eff
                                </span>
                            )}
                            {debugData.metadata?.pathLength !== undefined && <span style={{ color: '#555' }}>{debugData.metadata.pathLength}px</span>}
                        </div>
                    )}
                </div>
            )}

            <Typography.Text type="secondary" style={{ marginTop: 6, fontSize: 11 }}>
                {t('designer.debug.visualizer.selectEdgeHint')}
            </Typography.Text>
        </div>
    );
};
