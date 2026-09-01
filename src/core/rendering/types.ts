export interface RenderPoint {
  x: number;
  y: number;
}

export type RenderHandlePosition = 'top' | 'right' | 'bottom' | 'left' | 'unknown';

export interface RenderBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface RenderNodeGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
  zIndex: number;
  label: string;
  subtitle?: string;
  icon?: string;
  status?: 'normal' | 'success' | 'warning' | 'error';
  type?: string;
  shape?: string;
  fill: string;
  stroke: string;
  strokeWidth?: number;
  textColor: string;
  strokeDasharray?: string;
  borderRadius: number;
  fontSize: number;
  fontWeight?: string;
  fontFamily?: string;
  textAlign?: 'start' | 'middle';
  paddingX?: number;
  paddingTop?: number;
  contentLines?: RenderNodeContentLine[];
  accent?: RenderNodeAccent;
  tableColumns?: RenderNodeTableColumn[];
  container?: RenderNodeContainerMetadata;
}

export interface RenderNodeContentLine {
  text: string;
  fontWeight?: string;
}

export interface RenderNodeAccent {
  position: 'top' | 'left';
  size: number;
  color: string;
}

export interface RenderNodeTableColumn {
  name: string;
  type: string;
  isPrimary: boolean;
  isForeign: boolean;
}

export interface RenderNodeContainerMetadata {
  isContainer: boolean;
  isSwimlane: boolean;
  isLane: boolean;
  collapsed: boolean;
  childCount: number;
  laneCount: number;
  laneDirection: 'horizontal' | 'vertical';
  headerColor?: string;
}

export interface RenderEdgeMarker {
  kind: 'arrow' | 'openArrow' | 'diamond' | 'circle' | 'none';
  color: string;
}

export interface RenderEdgeGeometry {
  id: string;
  sourceId: string;
  targetId: string;
  sourceHandle: RenderHandlePosition;
  targetHandle: RenderHandlePosition;
  points: RenderPoint[];
  path: string;
  label: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity: number;
  markerStart: RenderEdgeMarker;
  markerEnd: RenderEdgeMarker;
  zIndex: number;
  /** Transparent geometry carrier used to render one shared-trunk endpoint marker. */
  markerOnly?: boolean;
}

export interface DiagramRenderScene {
  nodes: RenderNodeGeometry[];
  edges: RenderEdgeGeometry[];
  bounds: RenderBounds;
  viewport: { x: number; y: number; zoom: number };
  theme: {
    background: string;
    nodeFill: string;
    nodeStroke: string;
    textColor: string;
    edgeStroke: string;
  };
  warnings: string[];
}
