import { create } from 'zustand';
import { Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';

import { ContextMenuProps } from '../components/diagrams/DiagramContextMenu';

export interface ContextMenuState {
    top: number;
    left: number;
    type: ContextMenuProps['type'];
    targetId?: string;
}

interface DiagramState {
  nodes: Node[];
  edges: Edge[];
  selectedNodes: Node[];
  selectedEdges: Edge[];
  isDragging: boolean;
  contextMenu: ContextMenuState | null;
  
  // Actions
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  setSelectedNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void;
  setSelectedEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  setIsDragging: (isDragging: boolean) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
}

export const useDiagramStore = create<DiagramState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodes: [],
  selectedEdges: [],
  isDragging: false,
  contextMenu: null,

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
