// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { canvasToStandardData, standardDataToCanvas } from '@vizly/core/canvas-conversion';
import type { Node, Edge } from '@xyflow/react';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import { reconcileCloudRoom } from './cloudRoomReconciliation.js';

const document = (nodes: Node[], edges: Edge[]) => {
  const doc = new Y.Doc();
  for (const [name, values] of [['flowchart-nodes', nodes], ['flowchart-edges', edges]] as const) {
    for (const value of values) {
      if (!publishCollaborationElement(doc.getMap(name), value.id, value)) throw new Error('Invalid test canvas');
    }
  }
  return doc;
};

describe('installed Core cloud-save and collaboration integration', () => {
  it.each(['Own edited label longer than twenty characters', '中文协作标签'.repeat(50), ''])('accepts the same label edit after cloud export and hydration (%s)', async label => {
    const initial = await standardDataToCanvas(canvasToStandardData([{ id: 'node-a', type: 'custom',
      position: { x: 10, y: 20 }, data: { label: 'Original', description: '<b>Original</b>' } }], []));
    const liveNodes = initial.nodes.map(node => ({ ...node, data: { ...node.data, label, description: label || 'Separate description' } }));
    const exported = canvasToStandardData(liveNodes, initial.edges);
    const savedCanvas = await standardDataToCanvas(exported);
    const base = document(initial.nodes, initial.edges), live = document(liveNodes, initial.edges);
    const cloud = document(savedCanvas.nodes, savedCanvas.edges), result = new Y.Doc();
    try {
      Y.applyUpdate(result, reconcileCloudRoom(base, live, cloud));
      const node = readCollaborationElement(result.getMap('flowchart-nodes').get('node-a'));
      expect(node?.data).toMatchObject({ label, description: label || 'Separate description' });
      expect(readCollaborationElement(live.getMap('flowchart-nodes').get('node-a'))?.data).toMatchObject({ label });
    } finally { [base, live, cloud, result].forEach(doc => doc.destroy()); }
  });
});
