import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  alignDomainVerticalTerminalSubGroupChildren,
  type DomainVerticalTerminalAlignmentHandlers,
} from '../domainVerticalTerminalChildAlignment';

const node = (
  id: string,
  type = 'default',
  data: Record<string, unknown> = {},
): ReactFlowNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  measured: { width: 100, height: 60 },
  data,
});

const handlers = (): DomainVerticalTerminalAlignmentHandlers => ({
  alignHorizontal: vi.fn(),
  scatterHorizontally: vi.fn(),
  alignVerticalStack: vi.fn(),
  alignGridRows: vi.fn(),
});

describe('alignDomainVerticalTerminalSubGroupChildren', () => {
  it('uses horizontal alignment without generic scattering', () => {
    const callbacks = handlers();
    const subGroup = node('sub', 'subGroup', { children: ['a', 'hidden'] });
    const visible = node('a');
    const hidden = node('hidden', 'default', { hidden: true });

    alignDomainVerticalTerminalSubGroupChildren(
      [subGroup, visible, hidden],
      { layout: 'horizontal', horizontalGap: 20, handlers: callbacks },
    );

    expect(callbacks.alignHorizontal).toHaveBeenCalledWith([visible], subGroup);
    expect(callbacks.scatterHorizontally).not.toHaveBeenCalled();
  });

  it('scatters and aligns vertical stacks', () => {
    const callbacks = handlers();
    const children = [node('a'), node('b')];

    alignDomainVerticalTerminalSubGroupChildren([
      node('sub', 'subGroup', { children: ['a', 'b'] }),
      ...children,
    ], {
      layout: 'vertical',
      horizontalGap: 30.9,
      handlers: callbacks,
    });

    expect(callbacks.scatterHorizontally).toHaveBeenCalledWith(children, 30);
    expect(callbacks.alignVerticalStack).toHaveBeenCalledWith(children);
    expect(callbacks.alignGridRows).not.toHaveBeenCalled();
  });

  it.each(['grid', 'centered'] as const)(
    'uses grid-row alignment for %s',
    layout => {
      const callbacks = handlers();
      const child = node('a');

      alignDomainVerticalTerminalSubGroupChildren([
        node('sub', 'subGroup', { children: ['a'] }),
        child,
      ], {
        layout,
        horizontalGap: Number.NaN,
        handlers: callbacks,
      });

      expect(callbacks.scatterHorizontally).toHaveBeenCalledWith([child], 120);
      expect(callbacks.alignGridRows).toHaveBeenCalledWith([child]);
    },
  );

  it('is a strict no-op for dagre layouts', () => {
    const callbacks = handlers();
    const input = [
      node('sub', 'subGroup', { children: ['a'] }),
      node('a'),
    ];

    expect(alignDomainVerticalTerminalSubGroupChildren(input, {
      layout: 'dagre',
      horizontalGap: 20,
      handlers: callbacks,
    })).toBe(input);
    expect(Object.values(callbacks).every(callback => (
      vi.mocked(callback).mock.calls.length === 0
    ))).toBe(true);
  });

  it('ignores malformed, missing, and empty child declarations', () => {
    const callbacks = handlers();

    alignDomainVerticalTerminalSubGroupChildren([
      node('bad', 'subGroup', { children: 'a' }),
      node('empty', 'subGroup', { children: ['', null, 42, 'missing'] }),
      node('a'),
    ], {
      layout: 'vertical',
      horizontalGap: -40,
      handlers: callbacks,
    });

    expect(callbacks.scatterHorizontally).not.toHaveBeenCalled();
    expect(callbacks.alignVerticalStack).not.toHaveBeenCalled();
  });
});
