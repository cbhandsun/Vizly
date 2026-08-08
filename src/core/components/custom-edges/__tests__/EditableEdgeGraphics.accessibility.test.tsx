// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditableEdgeGraphics, type EditableEdgeGraphicsProps } from '../renderers/EditableEdgeGraphics';

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ id, path }: { id: string; path: string }) => <path data-testid={id} d={path} />,
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (
      typeof options?.index === 'number' ? `${key} ${String(options.index)}` : key
    ),
  }),
}));

const createProps = (): EditableEdgeGraphicsProps => ({
  id: 'edge-1',
  edgePath: 'M0 0 L100 0',
  selected: true,
  viewportZoom: 1,
  bendPoints: [{ x: 50, y: 0, isWaypoint: true, waypointIndex: 0 }],
  segments: [{
    start: { x: 0, y: 0 },
    end: { x: 100, y: 0 },
    midPoint: { x: 50, y: 0 },
    isHorizontal: true,
  }],
  labelPos: { x: 50, y: 0 },
  label: 'Order flow',
  draggingIndex: null,
  draggingSegment: null,
  hoveredSegment: null,
  setHoveredSegment: vi.fn(),
  isEditingLabel: false,
  setIsEditingLabel: vi.fn(),
  editingLabelValue: 'Order flow',
  setEditingLabelValue: vi.fn(),
  onBendPointDown: vi.fn(),
  onBendPointMove: vi.fn(),
  onBendPointUp: vi.fn(),
  onBendPointKeyDown: vi.fn(),
  onSegmentDown: vi.fn(),
  onSegmentMove: vi.fn(),
  onSegmentUp: vi.fn(),
  onSegmentKeyDown: vi.fn(),
  onEdgeClick: vi.fn(),
  onDeleteWaypoint: vi.fn(),
  onAddWaypointToSegment: vi.fn(),
  onLabelChangeSubmit: vi.fn(),
});

describe('EditableEdgeGraphics accessibility', () => {
  it('exposes path editing controls to keyboard and assistive technology', () => {
    const props = createProps();
    render(<svg><EditableEdgeGraphics {...props} /></svg>);

    const bendPoint = screen.getByRole('slider', { name: 'designer.edgeEditor.moveBendPoint 1' });
    const segment = screen.getByRole('slider', { name: 'designer.edgeEditor.moveSegment 1' });
    const addWaypoint = screen.getByRole('button', { name: 'designer.edgeEditor.addWaypoint 1' });
    const deleteWaypoint = screen.getByRole('button', { name: 'designer.edgeEditor.deleteWaypoint 1' });
    const editLabel = screen.getByRole('button', { name: 'designer.edgeEditor.editLabel' });

    fireEvent.keyDown(bendPoint, { key: 'ArrowRight' });
    fireEvent.keyDown(segment, { key: 'ArrowDown' });
    fireEvent.keyDown(addWaypoint, { key: 'Enter' });
    fireEvent.keyDown(deleteWaypoint, { key: ' ' });
    fireEvent.keyDown(editLabel, { key: 'Enter' });

    expect(props.onBendPointKeyDown).toHaveBeenCalledOnce();
    expect(props.onSegmentKeyDown).toHaveBeenCalledOnce();
    expect(props.onAddWaypointToSegment).toHaveBeenCalledOnce();
    expect(props.onDeleteWaypoint).toHaveBeenCalledOnce();
    expect(props.setIsEditingLabel).toHaveBeenCalledWith(true);
  });

  it('localizes and labels the edge label input', () => {
    const props = { ...createProps(), isEditingLabel: true };
    render(<svg><EditableEdgeGraphics {...props} /></svg>);

    expect(screen.getByRole('textbox', { name: 'designer.edgeEditor.labelInput' }).getAttribute('placeholder'))
      .toBe('designer.edgeEditor.labelPlaceholder');
  });

  it('progressively discloses secondary controls at overview zoom', () => {
    const props = { ...createProps(), viewportZoom: 0.32 };
    render(<svg><EditableEdgeGraphics {...props} /></svg>);

    const addWaypoint = screen.getByRole('button', { name: 'designer.edgeEditor.addWaypoint 1' });
    const deleteWaypoint = screen.getByRole('button', { name: 'designer.edgeEditor.deleteWaypoint 1' });

    expect(addWaypoint.getAttribute('class')).toContain('editable-edge-secondary-control');
    expect(addWaypoint.parentElement?.getAttribute('class')).toContain('editable-edge-control-cluster--compact');
    expect(deleteWaypoint.getAttribute('class')).toContain('editable-edge-secondary-control');
    expect(deleteWaypoint.parentElement?.getAttribute('class')).toContain('editable-edge-control-cluster--compact');
  });
});
