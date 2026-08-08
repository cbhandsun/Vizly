// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Edge } from '@xyflow/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

interface MockMenuItem {
  key?: string;
  label?: ReactNode;
  disabled?: boolean;
  type?: string;
}

interface MockMenuProps {
  items?: MockMenuItem[];
  onClick?: (info: { key: string }) => void;
}

vi.mock('antd', () => ({
  Menu: ({ items = [], onClick }: MockMenuProps) => (
    <ul role="menu">
      {items.filter(item => item.type !== 'divider' && item.key).map(item => (
        <li key={item.key} role="menuitem" aria-disabled={item.disabled}>
          <button disabled={item.disabled} onClick={() => item.key && onClick?.({ key: item.key })}>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  ),
}));

const translations: Record<string, string> = {
  'designer.contextMenu.makeEditable': 'Make editable',
  'designer.contextMenu.stopEditing': 'Stop editing',
  'designer.contextMenu.resetPath': 'Reset path',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
}));

import { DiagramContextMenu } from '../DiagramContextMenu';

const editableEdge: Edge = {
  id: 'edge-1',
  source: 'source',
  target: 'target',
  type: 'editable',
  data: { waypoints: [{ x: 10, y: 20 }] },
};

describe('DiagramContextMenu edge target state', () => {
  it('uses the complete edge collection for an unselected right-click target', () => {
    const onAction = vi.fn();
    render(
      <DiagramContextMenu
        top={0}
        left={0}
        type="edge"
        targetId={editableEdge.id}
        onClose={vi.fn()}
        onAction={onAction}
        selectedNodes={[]}
        selectedEdges={[]}
        edges={[editableEdge]}
        canUndo={false}
        canRedo={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Make editable' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset path' })).not.toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Stop editing' }));
    expect(onAction).toHaveBeenCalledWith('stopEditing', editableEdge.id);
  });

  it('falls back safely when the target edge cannot be resolved', () => {
    render(
      <DiagramContextMenu
        top={0}
        left={0}
        type="edge"
        targetId="missing"
        onClose={vi.fn()}
        onAction={vi.fn()}
        selectedNodes={[]}
        selectedEdges={[]}
        edges={[editableEdge]}
        canUndo={false}
        canRedo={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Make editable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset path' })).toHaveProperty('disabled', true);
  });
});
