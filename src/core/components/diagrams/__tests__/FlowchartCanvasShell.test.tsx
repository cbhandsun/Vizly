// @vitest-environment jsdom

import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const baseReactFlowProps = vi.fn();

vi.mock('../../shared/BaseReactFlow', () => ({
  default: (props: Record<string, unknown>) => {
    baseReactFlowProps(props);
    return <div data-testid="base-react-flow">{props.children as React.ReactNode}</div>;
  },
}));

import { FlowchartCanvasShell } from '../FlowchartCanvasShell';

describe('FlowchartCanvasShell', () => {
  beforeEach(() => {
    baseReactFlowProps.mockClear();
  });

  it('fits the whole graph initially without continuously pinning the viewport', () => {
    const noop = vi.fn();

    render(
      <FlowchartCanvasShell
        nodes={[]}
        displayEdges={[]}
        nodeTypes={{}}
        onInit={noop}
        onNodesChange={noop}
        onEdgesChange={noop}
        onConnect={noop}
        onConnectStart={noop}
        onConnectEnd={noop}
        autoRoutingEnabled
        enableSmartEdges
        showMinimap={false}
        showGrid
        gridVariant={'dots' as never}
        onNodeDrag={noop}
        onNodeDragStart={noop}
        onSelectionChange={noop}
        onPaneClick={noop}
        onPaneDoubleClick={noop}
        selectionMode={'partial' as never}
        onNodeContextMenu={noop}
        onEdgeContextMenu={noop}
        onPaneContextMenu={noop}
        isSpacePressed={false}
        isConnecting={false}
        connectPreview={null}
        connectionMode={'loose' as never}
        isDragging={false}
      />,
    );

    const props = baseReactFlowProps.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({
      fitView: true,
      fitMode: 'fitAll',
      fitPadding: 0.1,
      pinFit: false,
    });
  });
});
