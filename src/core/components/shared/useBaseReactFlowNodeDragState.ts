import { useCallback, useState } from 'react';

import { resolveBaseReactFlowNodeDragFallbackIds } from './baseReactFlowDisplayFallback';
import type { BaseReactFlowProps } from './baseReactFlowTypes';

export const useBaseReactFlowNodeDragState = ({
  onNodeDragStart,
  onNodeDragStop,
}: Pick<BaseReactFlowProps, 'onNodeDragStart' | 'onNodeDragStop'>) => {
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [isNodeDragFallbackPending, setIsNodeDragFallbackPending] = useState(false);
  const [nodeDragFallbackIds, setNodeDragFallbackIds] = useState<readonly string[]>([]);
  const handleNodeDragStart = useCallback<NonNullable<BaseReactFlowProps['onNodeDragStart']>>(
    (event, node, draggedNodes) => {
      setIsNodeDragging(true);
      setIsNodeDragFallbackPending(true);
      setNodeDragFallbackIds(resolveBaseReactFlowNodeDragFallbackIds(node.id, draggedNodes));
      onNodeDragStart?.(event, node, draggedNodes);
    },
    [onNodeDragStart],
  );
  const handleNodeDragStop = useCallback<NonNullable<BaseReactFlowProps['onNodeDragStop']>>(
    (event, node, draggedNodes) => {
      setIsNodeDragging(false);
      onNodeDragStop?.(event, node, draggedNodes);
    },
    [onNodeDragStop],
  );
  const handleNodeDragFallbackResolved = useCallback(() => {
    setIsNodeDragFallbackPending(false);
    setNodeDragFallbackIds(current => current.length === 0 ? current : []);
  }, []);

  return {
    handleNodeDragFallbackResolved,
    handleNodeDragStart,
    handleNodeDragStop,
    isNodeDragFallbackPending,
    isNodeDragging,
    nodeDragFallbackIds,
  };
};
