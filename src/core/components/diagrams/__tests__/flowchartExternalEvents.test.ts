import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createFlowchartReverseImportSuccessHandler,
  createFlowchartSnapshotEventHandler,
} from '../flowchartExternalEvents';

describe('flowchartExternalEvents', () => {
  it('creates a snapshot event handler that snapshots current nodes and edges', () => {
    const nodes: Node[] = [
      {
        id: 'node-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: 'Node 1' },
      },
    ];
    const edges: Edge[] = [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
      },
    ];
    const takeSnapshot = vi.fn();

    const handler = createFlowchartSnapshotEventHandler({
      getNodes: () => nodes,
      getEdges: () => edges,
      takeSnapshot,
    });

    handler();

    expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
  });

  it('creates a reverse import success handler that notifies first and then schedules fit', () => {
    const notifySuccess = vi.fn();
    const scheduleFitView = vi.fn();

    const handler = createFlowchartReverseImportSuccessHandler({
      notifySuccess,
      scheduleFitView,
    });

    handler({
      detail: {
        filename: 'imported.flow',
      },
    });

    expect(notifySuccess).toHaveBeenCalledWith('imported.flow');
    expect(scheduleFitView).toHaveBeenCalled();
    expect(notifySuccess.mock.invocationCallOrder[0]).toBeLessThan(scheduleFitView.mock.invocationCallOrder[0]);
  });
});
