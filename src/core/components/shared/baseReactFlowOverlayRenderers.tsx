import React, { useMemo } from 'react';
import { EdgeLabelRenderer, useStore } from '@xyflow/react';

import { getWindowSearchString } from '../../utils/inputBoundary';
import { logBaseReactFlowOverlayFlagReadFailure } from './baseReactFlowLogging';
import {
  computeBaseReactFlowAlignGuideLine,
  computeBaseReactFlowRightEdgeGuideLines,
  readBaseReactFlowAlignGuideEnabled,
  readBaseReactFlowRightEdgeGuideFlags,
} from './baseReactFlowOverlayGuides';

const readStorageItem = (key: string): string | null => (
  typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
);

export const BaseReactFlowAlignGuide: React.FC = () => {
  const nodes = useStore(state => state.nodes);
  const enabled = useMemo(() => readBaseReactFlowAlignGuideEnabled({
    getSearch: getWindowSearchString,
    getStorageItem: readStorageItem,
    onReadFailure: (scope, error) => logBaseReactFlowOverlayFlagReadFailure(scope, error),
  }), []);

  if (!enabled || nodes.length === 0) return null;
  const guideLine = computeBaseReactFlowAlignGuideLine(nodes);
  if (!guideLine) return null;

  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(${guideLine.x}px, ${guideLine.y}px)`,
          width: 0,
          height: guideLine.height,
          borderLeft: '2px dashed #ef4444',
          boxShadow: '0 0 0 1px rgba(239,68,68,0.12)',
          pointerEvents: 'none',
          zIndex: 4,
        }}
        aria-label="align-guide"
        title="左锚参考线"
      />
    </EdgeLabelRenderer>
  );
};

export const BaseReactFlowRightEdgeGuides: React.FC = () => {
  const nodes = useStore(state => state.nodes);
  const flags = useMemo(() => readBaseReactFlowRightEdgeGuideFlags({
    getSearch: getWindowSearchString,
    getStorageItem: readStorageItem,
    onReadFailure: (scope, error) => logBaseReactFlowOverlayFlagReadFailure(scope, error),
  }), []);

  if ((!flags.rightLine && !flags.contentLine) || nodes.length === 0) return null;
  const overlays = computeBaseReactFlowRightEdgeGuideLines({ nodes, flags });

  return (
    <>
      {overlays.map(overlay => (
        <EdgeLabelRenderer key={overlay.key}>
          <div
            style={{
              position: 'absolute',
              transform: `translate(${overlay.x}px, ${overlay.y}px)`,
              width: 0,
              height: overlay.height,
              borderLeft: overlay.kind === 'right' ? '2px dashed #60a5fa' : '2px dashed #f59e0b',
              boxShadow: overlay.kind === 'right'
                ? '0 0 0 1px rgba(96,165,250,0.12)'
                : '0 0 0 1px rgba(245,158,11,0.12)',
              pointerEvents: 'none',
              zIndex: 4,
            }}
            aria-label={overlay.kind === 'right' ? 'domain-right-guide' : 'domain-content-max-guide'}
            title={overlay.kind === 'right' ? '域右缘参考线' : '内容最大右缘参考线'}
          />
        </EdgeLabelRenderer>
      ))}
    </>
  );
};
