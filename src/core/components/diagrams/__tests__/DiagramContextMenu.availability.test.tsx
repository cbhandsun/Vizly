// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'designer.contextMenu.paste': 'Paste',
      'designer.contextMenu.undo': 'Undo',
      'designer.contextMenu.redo': 'Redo',
      'designer.contextMenu.bringToFront': 'Bring to front',
      'designer.contextMenu.sendToBack': 'Send to back',
    })[key] ?? key,
  }),
}));

const renderPaneMenu = (options: { canUndo?: boolean; canRedo?: boolean } = {}) => {
  const onAction = vi.fn();
  render(
    <DiagramContextMenu
      top={0}
      left={0}
      type="pane"
      onClose={vi.fn()}
      onAction={onAction}
      selectedNodes={[]}
      selectedEdges={[]}
      canUndo={options.canUndo ?? false}
      canRedo={options.canRedo ?? false}
    />,
  );
  return onAction;
};

const node = (id: string): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: { label: id },
});

const renderNodeMenu = ({
  allNodes,
  targetId,
  selectedNodes,
}: {
  allNodes?: Node[];
  targetId: string;
  selectedNodes: Node[];
}) => render(
  <DiagramContextMenu
    top={0}
    left={0}
    type="node"
    targetId={targetId}
    onClose={vi.fn()}
    onAction={vi.fn()}
    selectedNodes={selectedNodes}
    selectedEdges={[]}
    nodes={allNodes}
    canUndo={false}
    canRedo={false}
  />,
);

describe('DiagramContextMenu action availability', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    Object.assign(navigator, { clipboard: undefined });
  });

  it('disables undo and redo when the active page has no matching history', () => {
    renderPaneMenu();

    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('dispatches only the history actions available in the active page scope', () => {
    const onAction = renderPaneMenu({ canUndo: true, canRedo: false });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledWith('undo', undefined);
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables paste for a readable system clipboard without persisted local data', () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.assign(navigator, { clipboard: { readText: vi.fn() } });
    const onAction = renderPaneMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(onAction).toHaveBeenCalledWith('paste', undefined);
  });

  it('enables paste from persisted data when system clipboard access is unavailable', () => {
    localStorage.setItem('flowchart-clipboard', '{"nodes":[]}');
    const onAction = renderPaneMenu();

    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(onAction).toHaveBeenCalledWith('paste', undefined);
  });

  it('keeps paste disabled when neither clipboard channel can be read', () => {
    renderPaneMenu();

    expect((screen.getByRole('button', { name: 'Paste' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables both layer actions when a single node cannot move', () => {
    const onlyNode = node('only');
    renderNodeMenu({ allNodes: [onlyNode], targetId: onlyNode.id, selectedNodes: [onlyNode] });

    expect((screen.getByRole('button', { name: 'Bring to front' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole('button', { name: 'Send to back' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('exposes only the layer direction that can change an extreme node', () => {
    const back = node('back');
    const front = node('front');
    const { unmount } = renderNodeMenu({
      allNodes: [back, front],
      targetId: front.id,
      selectedNodes: [front],
    });

    expect((screen.getByRole('button', { name: 'Bring to front' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect((screen.getByRole('button', { name: 'Send to back' }) as HTMLButtonElement).disabled)
      .toBe(false);

    unmount();
    renderNodeMenu({ allNodes: [back, front], targetId: back.id, selectedNodes: [back] });

    expect((screen.getByRole('button', { name: 'Bring to front' }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect((screen.getByRole('button', { name: 'Send to back' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('preserves action availability when a caller cannot provide full node order', () => {
    const selected = node('selected');
    renderNodeMenu({ targetId: selected.id, selectedNodes: [selected] });

    expect((screen.getByRole('button', { name: 'Bring to front' }) as HTMLButtonElement).disabled)
      .toBe(false);
    expect((screen.getByRole('button', { name: 'Send to back' }) as HTMLButtonElement).disabled)
      .toBe(false);
  });
});
