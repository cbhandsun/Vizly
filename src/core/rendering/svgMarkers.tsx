import React from 'react';
import type { RenderEdgeMarker } from './types';
import { getSvgMarkerId } from './svgMarkerIds';

export const SvgMarkerDefs = ({ namespace, markers }: { namespace: string; markers: RenderEdgeMarker[] }) => {
  const unique = new Map<string, RenderEdgeMarker>();
  markers.forEach(marker => {
    if (marker.kind !== 'none') unique.set(getSvgMarkerId(namespace, marker), marker);
  });
  if (unique.size === 0) return null;

  return (
    <defs>
      {[...unique].map(([id, marker]) => (
        <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          {marker.kind === 'openArrow' ? (
            <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke={marker.color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          ) : marker.kind === 'diamond' ? (
            <path d="M 1 5 L 5 1 L 9 5 L 5 9 Z" fill={marker.color} />
          ) : marker.kind === 'circle' ? (
            <circle cx="5" cy="5" r="3.5" fill={marker.color} />
          ) : (
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={marker.color} />
          )}
        </marker>
      ))}
    </defs>
  );
};
