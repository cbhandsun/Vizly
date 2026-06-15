import { create } from 'zustand';
import { Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

import { ContextMenuProps } from '../components/diagrams/DiagramContextMenu';

export interface ContextMenuState {
    top: number;
    left: number;
    type: ContextMenuProps['type'];
    targetId?: string;
}

export interface CommentReply {
    id: string;
    authorId: string;
    authorName: string;
    authorColor: string;
    avatar?: string;
    content: string;
    createdAt: number;
}

export interface CommentThread {
    id: string;
    x: number;
    y: number;
    authorId: string;
    authorName: string;
    authorColor: string;
    content: string;
    createdAt: number;
    isResolved: boolean;
    color: string; // ⭐ [GAP-02] 用于 Pin 的视觉颜色标识
    replies: CommentReply[];
    nodeId?: string;
}

export type Comment = CommentThread;

interface DiagramState {
  nodes: Node[];
  edges: Edge[];
  selectedNodes: Node[];
  selectedEdges: Edge[];
  isDragging: boolean;
  contextMenu: ContextMenuState | null;

  // ⭐ Phase 11: 评论系统
  comments: CommentThread[];
  activeCommentId: string | null; // ⭐ [GAP-02] 当前选中的评论 ID
  isCommentMode: boolean;
  user: {
      id: string;
      name: string;
      color: string;
      avatar?: string;
  };
  
  // ⭐ [GAP-12] 插件沙盒状态存储
  pluginStates: Record<string, any>;
  
  // Actions
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  setSelectedNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void;
  setSelectedEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  setIsDragging: (isDragging: boolean) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  
  // ⭐ Phase 11 Actions
  setComments: (comments: CommentThread[] | ((prev: CommentThread[]) => CommentThread[])) => void;
  setIsCommentMode: (enabled: boolean) => void;
  addComment: (comment: CommentThread) => void;
  updateComment: (id: string, updates: Partial<CommentThread>) => void;
  removeComment: (id: string) => void;
  setActiveCommentId: (id: string | null) => void; // ⭐ [GAP-02] 设置选中
  
  // ⭐ [GAP-12] 插件状态管理 Action
  setPluginState: (pluginId: string, state: any | ((prev: any) => any)) => void;
  
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
}

export const useDiagramStore = create<DiagramState>((set, _get) => ({
  nodes: [],
  edges: [],
  selectedNodes: [],
  selectedEdges: [],
  isDragging: false,
  contextMenu: null,
  comments: [],
  activeCommentId: null,
  isCommentMode: false,
  user: {
      id: 'current-user',
      name: 'Admin User',
      color: '#1890ff'
  },
  pluginStates: {},

  setNodes: (nodesOrUpdater) => {
    set((state) => ({
      nodes: typeof nodesOrUpdater === 'function' ? nodesOrUpdater(state.nodes) : nodesOrUpdater
    }));
  },
  
  setEdges: (edgesOrUpdater) => {
    set((state) => ({
      edges: typeof edgesOrUpdater === 'function' ? edgesOrUpdater(state.edges) : edgesOrUpdater
    }));
  },
  
  setSelectedNodes: (nodesOrUpdater) => {
    set((state) => ({
      selectedNodes: typeof nodesOrUpdater === 'function' ? nodesOrUpdater(state.selectedNodes) : nodesOrUpdater
    }));
  },

  setSelectedEdges: (edgesOrUpdater) => {
    set((state) => ({
      selectedEdges: typeof edgesOrUpdater === 'function' ? edgesOrUpdater(state.selectedEdges) : edgesOrUpdater
    }));
  },

  setIsDragging: (isDragging) => set({ isDragging }),
  setContextMenu: (contextMenu) => set({ contextMenu }),

  setComments: (commentsOrUpdater) => {
    set((state) => ({
      comments: typeof commentsOrUpdater === 'function' ? commentsOrUpdater(state.comments) : commentsOrUpdater
    }));
  },
  setIsCommentMode: (enabled) => set({ isCommentMode: enabled }),
  addComment: (comment) => set((state) => ({ comments: [...state.comments, comment] })),
  
  updateComment: (id, updates) => set((state) => ({
      comments: state.comments.map(c => c.id === id ? { ...c, ...updates } : c)
  })),

  removeComment: (id) => set((state) => ({
      comments: state.comments.filter(c => c.id !== id)
  })),

  setActiveCommentId: (id) => set({ activeCommentId: id }),

  setPluginState: (pluginId, stateOrUpdater) => set((state) => {
    const currentPluginState = state.pluginStates[pluginId] || {};
    const newState = typeof stateOrUpdater === 'function' 
        ? stateOrUpdater(currentPluginState) 
        : { ...currentPluginState, ...stateOrUpdater };
    
    return {
      pluginStates: {
        ...state.pluginStates,
        [pluginId]: newState
      }
    };
  }),

  onNodesChange: (changes: NodeChange[]) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes)
    }));
  },
  
  onEdgesChange: (changes: EdgeChange[]) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges)
    }));
  }
}));
