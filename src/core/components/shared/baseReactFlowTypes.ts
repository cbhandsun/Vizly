import type React from 'react';
import type {
  Connection,
  ConnectionLineComponentProps,
  ConnectionLineType,
  ConnectionMode,
  Edge,
  EdgeChange,
  EdgeTypes,
  Node,
  NodeChange,
  NodeTypes,
  OnConnectEnd,
  OnConnectStart,
  OnNodeDrag,
  ReactFlowInstance,
  SelectionMode,
  AriaLabelConfig,
  KeyCode,
} from '@xyflow/react';
import type { BackgroundVariant } from '@xyflow/react';
import type { BaseReactFlowRoutingSessionRuntime } from './baseReactFlowRoutingSessionRuntime';

export interface BaseReactFlowProps {
  onSelectionChange?: (params: { nodes: Node[]; edges: Edge[] }) => void;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  nodes: Node[];
  edges: Edge[];
  nodeTypes?: NodeTypes;
  edgeTypes?: EdgeTypes;
  style?: React.CSSProperties;
  className?: string;
  flowClassName?: string;
  fitView?: boolean;
  minZoom?: number;
  maxZoom?: number;
  defaultViewport?: { x: number; y: number; zoom: number };
  showMiniMap?: boolean;
  showControls?: boolean;
  onNodesChange?: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onConnect?: (params: Connection) => void;
  children?: React.ReactNode;
  fitMode?: 'fitWidthTop' | 'fitAll' | 'none' | 'restoreOrFitAll';
  fitPadding?: number;
  pinFit?: boolean;
  disableZoomCompensation?: boolean;
  fitTriggerKey?: string | number;
  viewportPersistenceKey?: string;
  miniMapStyle?: React.CSSProperties;
  miniMapZoomable?: boolean;
  miniMapPannable?: boolean;
  onInit?: (instance: ReactFlowInstance) => void;
  panOnDrag?: boolean;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  zoomOnDoubleClick?: boolean;
  panOnScroll?: boolean;
  preventScrolling?: boolean;
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  nodesFocusable?: boolean;
  edgesFocusable?: boolean;
  multiSelectionKeyCode?: KeyCode | null;
  ariaLabelConfig?: Partial<AriaLabelConfig>;
  elementsSelectable?: boolean;
  enableSmartEdges?: boolean;
  smartEdgePadding?: number;
  backgroundGridColor?: string;
  backgroundVariant?: BackgroundVariant;
  backgroundGap?: number;
  showBackgroundGrid?: boolean;
  onNodeDrag?: OnNodeDrag<Node>;
  onNodeDragStart?: OnNodeDrag<Node>;
  onNodeDragStop?: OnNodeDrag<Node>;
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  onEdgeContextMenu?: (event: React.MouseEvent, edge: Edge) => void;
  onPaneContextMenu?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneClick?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneDoubleClick?: (event: React.MouseEvent | MouseEvent) => void;
  onPaneMouseMove?: (event: React.MouseEvent) => void;
  onPaneMouseLeave?: (event: React.MouseEvent) => void;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  onEdgeClick?: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeDoubleClick?: (event: React.MouseEvent, edge: Edge) => void;
  connectionRadius?: number;
  connectionLineType?: ConnectionLineType;
  connectionLineStyle?: React.CSSProperties;
  connectionLineComponent?: React.ComponentType<ConnectionLineComponentProps>;
  connectionMode?: ConnectionMode;
  onConnectEnd?: OnConnectEnd;
  onConnectStart?: OnConnectStart;
  selectionMode?: SelectionMode;
  snapToGrid?: boolean;
  snapGrid?: [number, number];
  isValidConnection?: (connection: Edge | Connection) => boolean;
  selectionOnDrag?: boolean;
  edgesReconnectable?: boolean;
  reconnectRadius?: number;
  onReconnect?: (oldEdge: Edge, newConnection: Connection) => void;
  onReconnectStart?: (
    event: MouseEvent | React.MouseEvent | TouchEvent | React.TouchEvent,
    edge: Edge,
    handleType: 'source' | 'target',
  ) => void;
  onReconnectEnd?: (event: MouseEvent | TouchEvent, edge: Edge) => void;
  onDisplayRoutingFinalApplied?: () => void;
  routingSessionRuntime?: BaseReactFlowRoutingSessionRuntime;
}
