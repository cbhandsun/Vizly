// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiagramContextMenu } from '../DiagramContextMenu';

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
  'designer.contextMenu.group': 'Group',
  'designer.contextMenu.ungroup': 'Ungroup',
  'designer.contextMenu.copy': 'Copy',
  'designer.contextMenu.duplicateSelection': 'Duplicate selection',
  'designer.contextMenu.lockSelection': 'Lock selection',
  'designer.contextMenu.bringSelectionToFront': 'Bring selection to front',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

const node = (id: string, overrides: Partial<Node> = {}): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
  ...overrides,
});

const renderMenu = (options: { type: 'node' | 'multi-node'; target: Node; selectedNodes: Node[] }) => {
  const onAction = vi.fn();
  render(
    <DiagramContextMenu
      top={0}
      left={0}
      type={options.type}
      targetId={options.target.id}
      onClose={vi.fn()}
      onAction={onAction}
      selectedNodes={options.selectedNodes}
      selectedEdges={[]}
      nodes={[options.target, ...options.selectedNodes.filter(item => item.id !== options.target.id)]}
    />,
  );
  return onAction;
};

describe('DiagramContextMenu grouping actions', () => {
  it('offers and dispatches grouping for a multi-node selection', () => {
    const first = node('first');
    const second = node('second');
    const onAction = renderMenu({ type: 'multi-node', target: first, selectedNodes: [first, second] });

    fireEvent.click(screen.getByRole('button', { name: 'Group' }));

    expect(onAction).toHaveBeenCalledWith('group', first.id);
  });

  it('offers and dispatches ungrouping for a group target', () => {
    const group = node('group', { type: 'titleGroup' });
    const onAction = renderMenu({ type: 'node', target: group, selectedNodes: [group] });

    fireEvent.click(screen.getByRole('button', { name: 'Ungroup' }));

    expect(onAction).toHaveBeenCalledWith('ungroup', group.id);
  });

  it('allows copying a locked container without enabling mutation actions', () => {
    const group = node('group', { type: 'titleGroup', data: { locked: true } });
    const onAction = renderMenu({ type: 'node', target: group, selectedNodes: [group] });

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(onAction).toHaveBeenCalledWith('copy', group.id);
    expect((screen.getByRole('button', { name: 'Ungroup' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['Duplicate selection', 'duplicate'],
    ['Lock selection', 'lock'],
    ['Bring selection to front', 'bringToFront'],
  ])('dispatches %s against the full multi-node selection', (label, action) => {
    const first = node('first');
    const second = node('second');
    const onAction = renderMenu({ type: 'multi-node', target: first, selectedNodes: [first, second] });

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(onAction).toHaveBeenCalledWith(action, undefined);
  });
});
