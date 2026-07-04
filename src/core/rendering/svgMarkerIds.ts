import type { RenderEdgeMarker } from './types';

const safeMarkerNamespace = (namespace: string): string => (
  namespace.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'diagram'
);

export const getSvgMarkerId = (namespace: string, marker: RenderEdgeMarker): string => (
  `${safeMarkerNamespace(namespace)}-${marker.kind}-${marker.color.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || 'stroke'}`
);

export const getSvgMarkerUrl = (namespace: string, marker: RenderEdgeMarker): string | undefined => (
  marker.kind === 'none' ? undefined : `url(#${getSvgMarkerId(namespace, marker)})`
);

