import React, { type CSSProperties } from 'react';
import { BaseEdge, type BaseEdgeProps } from '@xyflow/react';

import { resolveEdgeContrastPaint } from '../../rendering/edgeContrastPaint';

export interface ContrastSafeBaseEdgeProps extends BaseEdgeProps {
  canvasBackground?: unknown;
  ancestorOpacity?: unknown;
}

type ContrastCssVariables = CSSProperties & {
  '--vizly-edge-contrast-underlay-color'?: string;
  '--vizly-edge-contrast-underlay-width'?: string;
  '--vizly-edge-marker-outline-color'?: string;
};

const joinClassNames = (...values: Array<string | undefined | false>): string | undefined => {
  const className = values.filter(Boolean).join(' ');
  return className || undefined;
};

const readStrokeLinecap = (value: unknown): 'butt' | 'inherit' | 'round' | 'square' => (
  value === 'butt' || value === 'inherit' || value === 'square' ? value : 'round'
);

const readStrokeLinejoin = (value: unknown): 'bevel' | 'inherit' | 'miter' | 'round' => (
  value === 'bevel' || value === 'inherit' || value === 'miter' ? value : 'round'
);

export const ContrastSafeBaseEdge = ({
  ancestorOpacity,
  canvasBackground = '#ffffff',
  className,
  id,
  markerEnd,
  markerStart,
  path,
  style,
  ...baseEdgeProps
}: ContrastSafeBaseEdgeProps) => {
  const decision = resolveEdgeContrastPaint({
    stroke: style?.stroke,
    strokeWidth: style?.strokeWidth,
    canvasBackground,
    opacity: style?.opacity,
    ancestorOpacity,
  });
  const hasMarker = Boolean(markerStart || markerEnd);
  const markerOutlineClass = decision.kind === 'underlay' && hasMarker
    ? `vizly-edge-contrast-marker-outline--${decision.underlayTone}`
    : undefined;
  const isCanonicalBackbone = className?.split(/\s+/u).includes('shared-trunk-canonical-backbone');
  const isSharedTrunkJunction = className?.split(/\s+/u).includes('shared-trunk-junction');
  const isAccentTrace = className?.split(/\s+/u).includes('shared-trunk-accent-trace');
  const underlayClassName = joinClassNames(
    'vizly-edge-contrast-underlay',
    isCanonicalBackbone && 'shared-trunk-canonical-backbone-underlay',
    isSharedTrunkJunction && 'shared-trunk-junction-underlay',
    isAccentTrace && 'shared-trunk-accent-trace-underlay',
  );
  const underlayStyle: ContrastCssVariables | undefined = decision.kind === 'underlay'
    ? {
      '--vizly-edge-contrast-underlay-color': decision.underlayColor,
      '--vizly-edge-contrast-underlay-width': `${decision.underlayStrokeWidth}px`,
    }
    : undefined;
  const semanticStyle: ContrastCssVariables | undefined = decision.kind === 'underlay' && hasMarker
    ? { ...style, '--vizly-edge-marker-outline-color': decision.underlayColor }
    : style;

  return (
    <>
      {decision.kind === 'underlay' && (
        <path
          aria-hidden="true"
          className={underlayClassName}
          data-edge-contrast-ratio={decision.semanticContrastRatio.toFixed(2)}
          data-edge-contrast-underlay-ratio={decision.underlayContrastRatio.toFixed(2)}
          data-edge-effective-opacity={decision.effectiveSemanticOpacity.toFixed(3)}
          d={path}
          fill="none"
          focusable="false"
          opacity={1}
          pointerEvents="none"
          stroke={decision.underlayColor}
          strokeDasharray={style?.strokeDasharray}
          strokeDashoffset={style?.strokeDashoffset}
          strokeLinecap={readStrokeLinecap(style?.strokeLinecap)}
          strokeLinejoin={readStrokeLinejoin(style?.strokeLinejoin)}
          strokeWidth={decision.underlayStrokeWidth}
          style={underlayStyle}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <BaseEdge
        {...baseEdgeProps}
        id={id}
        path={path}
        className={joinClassNames(className, markerOutlineClass)}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={semanticStyle}
        data-edge-contrast={decision.kind}
      />
    </>
  );
};

ContrastSafeBaseEdge.displayName = 'ContrastSafeBaseEdge';
