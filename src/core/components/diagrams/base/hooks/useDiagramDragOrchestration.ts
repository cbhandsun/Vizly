import { useState, useRef, useCallback } from 'react';
import type { Node } from '@xyflow/react';

export interface DragOrchestrationParams {
  rfNodes: Node[];
}

type AbsolutePositionNode = Node & {
  positionAbsolute?: { x: number; y: number };
};

export function useDiagramDragOrchestration({ rfNodes }: DragOrchestrationParams) {
  const [dragUpdateCounter, setDragUpdateCounter] = useState(0);
  const livePositionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [draggingNodeIds, setDraggingNodeIds] = useState<string[]>([]);

  const handleNodeDrag = useCallback((_event: MouseEvent | TouchEvent, node: Node, nodes: Node[]) => {
    const currentIds: Set<string> = new Set();
    const draggedNodesMap = new Map<string, Node>();

    const addNodeAndChildren = (n: Node, parentNewAbsPos?: { x: number, y: number }) => {
      let currentNewAbsPos = { x: 0, y: 0 };

      if (parentNewAbsPos) {
        currentNewAbsPos = {
          x: parentNewAbsPos.x + (n.position?.x ?? 0),
          y: parentNewAbsPos.y + (n.position?.y ?? 0)
        };
      } else {
        if (n.parentId) {
          const parent = rfNodes.find(pn => pn.id === n.parentId);
          if (parent) {
            const parentAbs = (parent as AbsolutePositionNode).positionAbsolute || parent.position || { x: 0, y: 0 };
            currentNewAbsPos = {
              x: parentAbs.x + (n.position?.x ?? 0),
              y: parentAbs.y + (n.position?.y ?? 0)
            };
          } else {
            const pos = (n as AbsolutePositionNode).positionAbsolute || n.position;
            if (pos) currentNewAbsPos = { ...pos };
          }
        } else {
          const pos = (n as AbsolutePositionNode).positionAbsolute || n.position;
          if (pos) currentNewAbsPos = { ...pos };
        }
      }

      if (currentNewAbsPos) {
        livePositionsRef.current[n.id] = currentNewAbsPos;
        currentIds.add(n.id);
        draggedNodesMap.set(n.id, n);
      }

      rfNodes.forEach(child => {
        if (child.parentId === n.id) {
          addNodeAndChildren(child, currentNewAbsPos);
        }
      });
    };

    nodes.forEach(n => {
      if (n) addNodeAndChildren(n);
    });

    if (nodes.length === 0 && node) {
      addNodeAndChildren(node);
    }

    setDraggingNodeIds(Array.from(currentIds));
    setDragUpdateCounter(c => c + 1);
  }, [rfNodes]);

  const handleNodeDragStop = useCallback(() => {
    setDraggingNodeIds([]);

    setDragUpdateCounter(c => c + 1);

    setTimeout(() => {
      livePositionsRef.current = {};
      setDragUpdateCounter(c => c + 1);
    }, 50);
  }, []);

  return {
    dragUpdateCounter,
    livePositionsRef,
    draggingNodeIds,
    handleNodeDrag,
    handleNodeDragStop
  };
}
