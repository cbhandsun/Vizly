/**
 * 通用类型定义
 */

import { XYPosition } from '@xyflow/react';

// 基础几何类型
// Position is legacy, prefer XYPosition from @xyflow/react for compatibility
export type Position = XYPosition;

export interface Size {
  width: number;
  height: number;
}

export interface Rectangle extends XYPosition, Size { }

// 主题相关类型
export interface ThemeColor {
  border: string;
  background?: string;
  color?: string;
  text?: string;
  accent?: string;
}

export interface DomainTheme extends ThemeColor {
  name?: string;
}

// 配置相关类型
export interface SpacingConfig {
  H: number; // 水平间距
  V: number; // 垂直间距
}

export interface DiagramConfig {
  NODE_WIDTH: number;
  NODE_HEIGHT: number;
  SPACING: SpacingConfig;
  GROUP_PADDING?: number;
  TITLE_BAR_HEIGHT?: number;
  containmentPolicy?: 'strict' | 'soft' | 'elastic';
  rankMode?: 'elk' | 'dagre_like';
}

// 节点数据类型
export interface NodeData {
  id?: string;
  content?: string;
  title?: string;
  theme?: DomainTheme;
  width?: number;
  height?: number;
}

// 边数据类型
export interface EdgeData {
  id?: string;
  source?: string;
  target?: string;
  label?: string;
  type?: 'main' | 'support' | 'data' | 'feedback' | 'dependency';
  style?: React.CSSProperties;
}

// 组件属性基础类型
export interface BaseComponentProps {
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}

// 交互配置类型
export interface InteractionConfig {
  showMiniMap?: boolean;
  showControls?: boolean;
  panOnDrag?: boolean;
  zoomOnScroll?: boolean;
  zoomOnPinch?: boolean;
  zoomOnDoubleClick?: boolean;
  panOnScroll?: boolean;
  preventScrolling?: boolean;
  nodesDraggable?: boolean;
  nodesConnectable?: boolean;
  elementsSelectable?: boolean;
}

// 导出配置类型
export interface ExportConfig {
  format: 'png' | 'jpg' | 'svg' | 'pdf';
  quality?: number;
  scale?: number;
  backgroundColor?: string;
}

// 错误类型
export interface DiagramError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// 事件类型
export type DiagramEventType =
  | 'node-click'
  | 'node-double-click'
  | 'edge-click'
  | 'canvas-click'
  | 'zoom-change'
  | 'viewport-change';

// 事件数据类型
export interface NodeEventData {
  nodeId: string;
  position: Position;
  data: NodeData;
}

export interface EdgeEventData {
  edgeId: string;
  source: string;
  target: string;
  data: EdgeData;
}

export interface ViewportEventData {
  x: number;
  y: number;
  zoom: number;
}

export interface ZoomEventData {
  zoom: number;
  direction: 'in' | 'out';
}

// 事件数据联合类型
export type DiagramEventData =
  | NodeEventData
  | EdgeEventData
  | ViewportEventData
  | ZoomEventData
  | Record<string, unknown>;

export interface DiagramEvent<T extends DiagramEventData = DiagramEventData> {
  type: DiagramEventType;
  data: T;
  timestamp: number;
}
