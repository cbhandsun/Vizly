// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ReactFlow, type NodeProps } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupNodeHandles } from '../GroupNodeHandles';

function Group({ isConnectable }: NodeProps) {
  return <div data-testid="group"><GroupNodeHandles className="group-handle" isConnectable={isConnectable} /></div>;
}
const nodeTypes = { group: Group };
beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => vi.unstubAllGlobals());

describe('group endpoint rendering contract', () => {
  it.each([true, false])('retains every endpoint role when connectable=%s', connectable => {
    render(<ReactFlow nodeTypes={nodeTypes} nodes={[{
      id: 'container', type: 'group', data: {}, position: { x: 0, y: 0 },
      width: 200, height: 100, connectable,
    }]} />);
    const group = screen.getByTestId('group');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const source = group.querySelector(`.source[data-handleid="${side}"]`);
      const target = group.querySelector(`.target[data-handleid="${side}"]`);
      expect(source).not.toBeNull();
      expect(target).not.toBeNull();
      expect(source?.classList.contains('connectablestart')).toBe(connectable);
      expect(target?.classList.contains('connectablestart')).toBe(false);
      expect(target?.getAttribute('style')).toContain('pointer-events: none');
      expect(target?.getAttribute('style')).toContain('opacity: 0');
    }
  });
});
