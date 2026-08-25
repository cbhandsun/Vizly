import React, { useEffect, useMemo, useState } from 'react';

import { DISPLAY_ROUTING_CAPABILITIES } from '@/core/routing/displayRoutingCapabilities';
import {
  readDisplayRoutingDebugState,
  type DisplayRoutingDebugState,
} from '@/core/components/shared/baseReactFlowDisplayRoutingDebug';

const EMPTY_STATE: DisplayRoutingDebugState = Object.freeze({ stage: 'idle' });

const metric = (label: string, value: React.ReactNode, color = '#eee') => (
  <div style={{ background: '#222', padding: 8, borderRadius: 4 }}>
    <div style={{ color: '#888', fontSize: 10 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
  </div>
);

const formatDuration = (value: number | undefined): string => (
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}ms` : '—'
);

const hardDefectCount = (state: DisplayRoutingDebugState): number | null => {
  const report = state.hardGateDiagnostics;
  if (!report) return null;
  const quality = report.quality;
  return report.obstacleHits
    + quality.nonOrthogonalSegments
    + quality.strictCrossings
    + quality.reverseOverlap
    + quality.unrelatedOverlap
    + quality.unexplainedRelatedOverlap
    + quality.shortEndpointStubs
    + quality.tinyInteriorDoglegs
    + quality.hairpins
    + (report.commercialClearanceViolations ?? 0);
};

export const RoutingSessionTab: React.FC = () => {
  const [state, setState] = useState<DisplayRoutingDebugState>(
    () => readDisplayRoutingDebugState() ?? EMPTY_STATE,
  );

  useEffect(() => {
    const update = () => setState(readDisplayRoutingDebugState() ?? EMPTY_STATE);
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, []);

  const phases = useMemo(() => [...(state.phaseTrace ?? state.phaseProgressTrace ?? [])]
    .sort((left, right) => (
      (right.exclusiveDurationMs ?? right.durationMs)
      - (left.exclusiveDurationMs ?? left.durationMs)
    ))
    .slice(0, 12), [state.phaseProgressTrace, state.phaseTrace]);
  const defects = hardDefectCount(state);

  return (
    <div style={{ padding: 10, fontSize: 12, color: '#ccc' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {metric('Stage', state.stage ?? 'idle', state.error ? '#ff7875' : '#95de64')}
        {metric('Graph', `${state.nodeCount ?? 0} nodes / ${state.edgeCount ?? 0} edges`)}
        {metric('Route', formatDuration(state.routeMs))}
        {metric('Total', formatDuration(state.totalRouteMs))}
        {metric('Worker starts / aborts', `${state.workerStartCount ?? 0} / ${state.workerAbortCount ?? 0}`)}
        {metric('Hard defects', defects ?? '—', defects === 0 ? '#95de64' : defects === null ? '#eee' : '#ff7875')}
        {metric('Cache trust', state.cacheTrustLevel ?? 'miss')}
        {metric('Fallback', state.fallbackLevel ?? 'none')}
      </div>

      <h4 style={{ margin: '0 0 8px', borderBottom: '1px solid #444', paddingBottom: 4 }}>
        Rollout capabilities
      </h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
        {Object.entries(DISPLAY_ROUTING_CAPABILITIES).map(([name, enabled]) => (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ color: '#aaa' }}>{name}</span>
            <span style={{ color: enabled ? '#95de64' : '#ff7875', fontWeight: 700 }}>
              {enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        ))}
      </div>

      <h4 style={{ margin: '0 0 8px', borderBottom: '1px solid #444', paddingBottom: 4 }}>
        Exclusive phase hotspots
      </h4>
      <div style={{ background: '#111', borderRadius: 4, padding: 6, minHeight: 80 }}>
        {phases.length === 0 ? (
          <div style={{ color: '#666', padding: 8 }}>No Routing Session trace yet.</div>
        ) : phases.map((phase) => (
          <div key={`${phase.parentPhase ?? 'root'}:${phase.phase}`} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8,
            padding: '3px 2px', borderBottom: '1px solid #1d1d1d', fontFamily: 'monospace',
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{phase.phase}</span>
            <span style={{ color: '#69b1ff' }}>
              {formatDuration(phase.exclusiveDurationMs ?? phase.durationMs)}
            </span>
            <span style={{ color: '#777' }}>{phase.resolution}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
