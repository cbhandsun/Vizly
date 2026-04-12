// packages/core/src/components/custom-edges/hooks/useEdgeLabelInteractions.ts
import { useState, useEffect } from 'react';
import type { EdgeProps } from '@xyflow/react';
import { useEdgeUpdate } from '../../diagrams/EdgeUpdateContext';

/**
 * Interface returned by useEdgeLabelInteractions
 */
export interface UseEdgeLabelInteractionsReturn {
  isEditing: boolean;
  editText: string;
  isDraggingLabel: boolean;
  setEditText: (text: string) => void;
  handleLabelDoubleClick: (e: React.MouseEvent) => void;
  handleLabelBlur: () => void;
  handleLabelMouseDown: (e: React.MouseEvent) => void;
  handleLabelContextMenu: (e: React.MouseEvent) => void;
  handleStyleChange: (edgeId: string, style: any) => void;
  handleResetPosition: () => void;
}

/**
 * Domain Controller: Handles all label interaction behaviors on an Edge, including
 * dragging, double-click inline editing, and style property modifications via context menu.
 */
export function useEdgeLabelInteractions(props: EdgeProps): UseEdgeLabelInteractionsReturn {
  const { id, label } = props;
  const edgeCallbacks = useEdgeUpdate();

  // ---------- Editing State ----------
  const [isEditing, setIsEditing] = useState(false);
  const initialLabel = label ?? (props.data as any)?.label;
  const [editText, setEditText] = useState('');

  const handleLabelDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditText(String(initialLabel ?? ''));
  };

  const handleLabelBlur = () => {
    setIsEditing(false);
    if (editText !== String(initialLabel ?? '')) {
      edgeCallbacks.onLabelChange(id, editText);
    }
  };

  // ---------- Label Drag State ----------
  const [isDraggingLabel, setIsDraggingLabel] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const labelOffset = (props.data as any)?.labelOffset || { x: 0, y: 0 };

  const handleLabelMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingLabel(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!isDraggingLabel || !dragStart) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      const newOffset = {
        x: labelOffset.x + dx,
        y: labelOffset.y + dy
      };

      edgeCallbacks.onLabelOffsetChange(id, newOffset);
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDraggingLabel(false);
      setDragStart(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLabel, dragStart, labelOffset, id, edgeCallbacks]);

  // ---------- Right-click Menu State ----------
  const handleLabelContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Dropdown automatically handles menu display; just prevent default outline behaviors
  };

  const handleStyleChange = (edgeId: string, style: any) => {
    edgeCallbacks.onLabelStyleChange(edgeId, style);
  };

  const handleResetPosition = () => {
    edgeCallbacks.onLabelOffsetChange(id, { x: 0, y: 0 });
  };

  return {
    isEditing,
    editText,
    isDraggingLabel,
    setEditText,
    handleLabelDoubleClick,
    handleLabelBlur,
    handleLabelMouseDown,
    handleLabelContextMenu,
    handleStyleChange,
    handleResetPosition
  };
}
