/**
 * React Flow 相关类型定义
 */

import { Node, Edge, NodeProps, EdgeProps, Connection, ReactFlowInstance } from '@xyflow/react';
import { Position } from './common';
export { NodeType } from '../factories/NodeFactory';
export { EdgeType } from '../factories/EdgeFactory';

// 节点数据类型，添加索引签名以兼容React Flow
export interface NodeData extends Record<string, unknown> {
  label: string;
  type?: string;
  category?: string;
  description?: string;
  icon?: string;
  color?: string;
  size?: { width: number; height: number };
  metadata?: Record<string, unknown>;
}

// 边数据类型，添加索引签名以兼容React Flow
export interface EdgeData extends Record<string, unknown> {
  label?: string;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
  metadata?: Record<string, unknown>;
}

 

export interface PositionedNode extends Node {
  measured: { width: number; height: number };
}

// 扩展的节点类型
import { NodeType } from '../factories/NodeFactory';
import { EdgeType } from '../factories/EdgeFactory';

// ... (其他代码)

export interface CustomNode extends Node {
  data: NodeData;
  type?: NodeType;
}

export interface CustomEdge extends Edge {
  data?: EdgeData;
  type?: EdgeType;
}

// 节点组件属性
export interface CustomNodeProps extends NodeProps {
  data: NodeData;
}

// 边组件属性
export interface CustomEdgeProps extends EdgeProps {
  data?: EdgeData;
}

// 连接配置
export interface ConnectionConfig {
  /** 是否允许连接 */
  isValidConnection?: (connection: Connection) => boolean;
  /** 连接线类型 */
  connectionLineType?: 'straight' | 'step' | 'bezier' | 'smart';
  /** 连接线样式 */
  connectionLineStyle?: React.CSSProperties;
}

// 扩展的React Flow实例类型，简化fitView选项
export interface ExtendedReactFlowInstance extends Omit<ReactFlowInstance, 'fitView' | 'zoomTo' | 'setViewport'> {
  fitView: (options?: { 
    padding?: number; 
    includeHiddenNodes?: boolean; 
  }) => void;
  /** 获取视口 */
  getViewport: () => { x: number; y: number; zoom: number };
  /** 设置视口 */
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  /** 缩放到指定区域 */
  zoomTo: (zoom: number, options?: { duration?: number }) => void;
}

// 布局相关类型
export interface LayoutNode {
  id: string;
  position: Position;
  data: NodeData;
  width?: number;
  height?: number;
  parentNode?: string;
  extent?: 'parent' | [[number, number], [number, number]];
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: EdgeData;
}

// 布局结果
export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: {
    width: number;
    height: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

// 节点分组类型
export interface NodeGroup {
  id: string;
  title: string;
  nodes: string[];
  position: Position;
  size: { width: number; height: number };
  theme?: string;
  collapsed?: boolean;
}

// 流程图状态
export interface FlowState {
  nodes: CustomNode[];
  edges: CustomEdge[];
  viewport: { x: number; y: number; zoom: number };
  selectedNodes: string[];
  selectedEdges: string[];
}

// 流程图操作
export type FlowAction =
  | { type: 'SET_NODES'; payload: CustomNode[] }
  | { type: 'SET_EDGES'; payload: CustomEdge[] }
  | { type: 'UPDATE_NODE'; payload: { id: string; data: Partial<NodeData> } }
  | { type: 'UPDATE_EDGE'; payload: { id: string; data: Partial<EdgeData> } }
  | { type: 'SET_VIEWPORT'; payload: { x: number; y: number; zoom: number } }
  | { type: 'SELECT_NODES'; payload: string[] }
  | { type: 'SELECT_EDGES'; payload: string[] };
