import { useState, useRef, useCallback } from 'react';
import type { Node } from '@xyflow/react';
import { EdgeRoutingCoordinator } from '../../../../services/EdgeRoutingCoordinator';

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

  const handleNodeDrag = useCallback((_event: React.MouseEvent, node: Node, nodes: Node[]) => {
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

    // [H-10] Notify coordinator that dragging is active → 60ms debounce during drag
    EdgeRoutingCoordinator.getInstance().setDragging(true);

    setDraggingNodeIds(Array.from(currentIds));
    setDragUpdateCounter(c => c + 1);
  }, [rfNodes]);

  const handleNodeDragStop = useCallback(() => {
    const draggedIds = [...draggingNodeIds];
    setDraggingNodeIds([]);

    setDragUpdateCounter(c => c + 1);

    setTimeout(() => {
      livePositionsRef.current = {};
      // [H-10] Restore 16ms debounce and trigger final route pass on drag end
      EdgeRoutingCoordinator.getInstance().setDragging(false);
      if (draggedIds.length > 0) {
        EdgeRoutingCoordinator.getInstance().markNodesChanged(draggedIds);
        EdgeRoutingCoordinator.getInstance().notifyGraphChange(draggedIds);
      } else {
        EdgeRoutingCoordinator.getInstance().forceClearAllCaches();
      }
      setDragUpdateCounter(c => c + 1);
    }, 50);
  }, [draggingNodeIds]);

  return {
    dragUpdateCounter,
    livePositionsRef,
    draggingNodeIds,
    handleNodeDrag,
    handleNodeDragStop
  };
}
