import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyNodeChanges,
  type Node,
  type NodeChange,
  type OnNodeDrag,
} from '@xyflow/react';
import type { SnapDelta } from '../../../hooks/useSmartGuides';

const MAX_NODE_ID_LENGTH = 1_024;

const hasUsablePosition = (node: Node): boolean => (
  typeof node.id === 'string'
  && node.id.length > 0
  && node.id.length <= MAX_NODE_ID_LENGTH
  && Number.isFinite(node.position.x)
  && Number.isFinite(node.position.y)
);

export const getNonPositionNodeChanges = (
  changes: readonly NodeChange[],
): NodeChange[] => changes.filter(change => change.type !== 'position');

export const createFinalPositionChanges = (
  node: Node,
  draggedNodes: readonly Node[],
): NodeChange[] => {
  const finalNodes = new Map<string, Node>();
  for (const candidate of [node, ...draggedNodes]) {
    if (hasUsablePosition(candidate)) finalNodes.set(candidate.id, candidate);
  }

  return Array.from(finalNodes.values(), candidate => ({
    id: candidate.id,
    type: 'position' as const,
    position: { ...candidate.position },
    dragging: false,
  }));
};

export const createSnappedPositionChange = (
  node: Node,
  snapDelta: SnapDelta | null,
): NodeChange | null => {
  if (
    !hasUsablePosition(node)
    || !snapDelta
    || !Number.isFinite(snapDelta.x)
    || !Number.isFinite(snapDelta.y)
  ) {
    return null;
  }
  const x = node.position.x + snapDelta.x;
  const y = node.position.y + snapDelta.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    id: node.id,
    type: 'position',
    position: {
      x,
      y,
    },
    dragging: true,
  };
};

export type SmartNodeDragHandler = (
  event: MouseEvent | TouchEvent,
  node: Node,
  draggedNodes: Node[],
) => SnapDelta | null;

interface UseFlowchartDragBufferOptions {
  nodes: Node[];
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeDrag: OnNodeDrag<Node>;
  onNodeDragStart: OnNodeDrag<Node>;
  onNodeDragStop?: OnNodeDrag<Node>;
  onSmartNodeDrag?: SmartNodeDragHandler;
}

/**
 * Keeps high-frequency drag positions inside the canvas subtree. The shared
 * diagram store receives the final positions once, when the gesture ends.
 */
export const useFlowchartDragBuffer = ({
  nodes,
  onNodesChange,
  onNodeDrag,
  onNodeDragStart,
  onNodeDragStop,
  onSmartNodeDrag,
}: UseFlowchartDragBufferOptions) => {
  const [bufferedNodes, setBufferedNodes] = useState<Node[]>(nodes);
  const [isBuffering, setIsBuffering] = useState(false);
  const isBufferingRef = useRef(false);
  const smartGuideRafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (smartGuideRafRef.current !== null) {
      cancelAnimationFrame(smartGuideRafRef.current);
    }
  }, []);

  const handleNodeDragStart: OnNodeDrag<Node> = useCallback((event, node, draggedNodes) => {
    isBufferingRef.current = true;
    setBufferedNodes(nodes);
    setIsBuffering(true);
    onNodeDragStart(event, node, draggedNodes);
  }, [nodes, onNodeDragStart]);

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (!isBufferingRef.current) {
      onNodesChange(changes);
      return;
    }

    setBufferedNodes(current => applyNodeChanges(changes, current));
    const persistentChanges = getNonPositionNodeChanges(changes);
    if (persistentChanges.length > 0) onNodesChange(persistentChanges);
  }, [onNodesChange]);

  const handleNodeDrag: OnNodeDrag<Node> = useCallback((event, node, draggedNodes) => {
    onNodeDrag(event, node, draggedNodes);
    if (!onSmartNodeDrag) return;

    if (smartGuideRafRef.current !== null) {
      cancelAnimationFrame(smartGuideRafRef.current);
    }
    smartGuideRafRef.current = requestAnimationFrame(() => {
      smartGuideRafRef.current = null;
      const change = createSnappedPositionChange(
        node,
        onSmartNodeDrag(event, node, draggedNodes),
      );
      if (!change || !isBufferingRef.current) return;
      setBufferedNodes(current => applyNodeChanges([change], current));
    });
  }, [onNodeDrag, onSmartNodeDrag]);

  const handleNodeDragStop: OnNodeDrag<Node> = useCallback((event, node, draggedNodes) => {
    if (smartGuideRafRef.current !== null) {
      cancelAnimationFrame(smartGuideRafRef.current);
      smartGuideRafRef.current = null;
    }
    const finalPositionChanges = createFinalPositionChanges(node, draggedNodes);
    if (finalPositionChanges.length > 0) onNodesChange(finalPositionChanges);
    isBufferingRef.current = false;
    setIsBuffering(false);
    onNodeDragStop?.(event, node, draggedNodes);
  }, [onNodeDragStop, onNodesChange]);

  return {
    canvasNodes: isBuffering ? bufferedNodes : nodes,
    handleNodeDrag,
    handleNodesChange,
    handleNodeDragStart,
    handleNodeDragStop,
  };
};
