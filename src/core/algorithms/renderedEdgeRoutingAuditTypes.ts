import type {
  EdgeRoutingCommercialGateResult,
  EdgeRoutingQualityLayer,
} from './edgeRoutingCommercialGate';

export type RenderedAuditSeverity = 'error' | 'warning' | 'info';

export interface RenderedAuditNode {
  id: string;
  type?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedAuditRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedAuditEdge {
  id: string;
  source: string;
  target: string;
  path: string;
  labelRect?: RenderedAuditRect;
  stroke?: unknown;
  strokeWidth?: unknown;
  strokeDasharray?: unknown;
  opacity?: unknown;
  markerStart?: unknown;
  markerEnd?: unknown;
  zoom?: unknown;
  selected?: unknown;
  labelVisible?: unknown;
  expectedPresentation?: unknown;
}

export type RenderedAuditPresentationField =
  | 'stroke'
  | 'strokeWidth'
  | 'strokeDasharray'
  | 'opacity'
  | 'markerStart'
  | 'markerEnd'
  | 'zoom'
  | 'selected'
  | 'labelVisible';

export interface RenderedAuditPresentationPolicy {
  requiredFields?: unknown;
  lowZoomThreshold?: unknown;
  minimumVisibleOpacity?: unknown;
  minimumSelectedOpacity?: unknown;
  minimumSelectedStrokeWidth?: unknown;
}

export interface RenderedRoutingAuditOptions {
  presentation?: boolean | RenderedAuditPresentationPolicy;
}

export interface RenderedAuditFinding {
  edgeId?: string;
  rule: string;
  severity: RenderedAuditSeverity;
  reason: string;
  measuredValue?: number;
  relatedNodeIds?: string[];
  relatedEdgeIds?: string[];
  presentationField?: RenderedAuditPresentationField;
  actualValue?: string | number | boolean;
  expectedValue?: string | number | boolean;
  isHardConstraint: boolean;
  blockingFor?: readonly EdgeRoutingQualityLayer[];
  nonBlockingReason?: string;
}

export interface RenderedRoutingAuditResult {
  errors: RenderedAuditFinding[];
  warnings: RenderedAuditFinding[];
  infos: RenderedAuditFinding[];
  commercialGate: EdgeRoutingCommercialGateResult;
}
