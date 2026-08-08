// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';

interface MockMenuItem {
  key?: string;
  label?: ReactNode;
  type?: string;
  children?: MockMenuItem[];
}

interface MockMenuProps {
  items?: MockMenuItem[];
}

const readTranslation = (key: string): string => {
  let current: unknown = en;
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : key;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: readTranslation }),
}));

vi.mock('antd', () => {
  const renderItems = (items: MockMenuItem[]): ReactNode => items
    .filter(item => item.type !== 'divider' && item.key)
    .map(item => (
      <li key={item.key} role="menuitem">
        {item.label}
        {item.children ? <ul role="menu">{renderItems(item.children)}</ul> : null}
      </li>
    ));

  return {
    Menu: ({ items = [] }: MockMenuProps) => <ul role="menu">{renderItems(items)}</ul>,
  };
});

import { DiagramContextMenu } from '../DiagramContextMenu';

const node = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });

describe('DiagramContextMenu localization', () => {
  it.each([
    ['pane', []],
    ['node', [node('first')]],
    ['multi-node', [node('first'), node('second'), node('third')]],
  ] as const)('renders the %s workflow entirely in English', (type, selectedNodes) => {
    const { unmount } = render(
      <DiagramContextMenu
        top={0}
        left={0}
        type={type}
        targetId={selectedNodes[0]?.id}
        onClose={vi.fn()}
        onAction={vi.fn()}
        selectedNodes={[...selectedNodes]}
        selectedEdges={[]}
        nodes={[...selectedNodes]}
      />,
    );

    const menus = screen.getAllByRole('menu');
    const renderedText = menus.map(menu => menu.textContent).join(' ');
    expect(renderedText).not.toMatch(/[\u3400-\u9fff]/u);
    expect(renderedText).not.toContain('designer.contextMenu.');

    unmount();
  });
});
