// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { standardDataToCanvas } from '@vizly/core/canvas-conversion';
import { parseRemoteDiagramContent } from '@vizly/core/remote-content';
import { createCloudRoomCheckpoint } from './roomBootstrap.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import { areRoomCanvasesEqual, reconcileCloudRoom } from './cloudRoomReconciliation.js';

describe('cloud save collaboration round trip', () => {
  it('accepts the same saved edits without conflicts from sizing, generated descriptions or local editing state', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const label = '<b>Long collaborative label after an actual edit</b>';
    const content = parseRemoteDiagramContent({ id, nodes: [{ id: 'new-node', type: 'custom', data: { label },
      domain: '业务域', domainClass: 'core', description: `<b>${label}</b>`, metadata: { canvasNodeType: 'flowchart', canvasPosition: { x: 10, y: 20 },
        width: 150, height: 60, style: { width: 150.4, height: 60 }, shape: 'rectangle', icon: 'square', sequence: '1' } }], edges: [] }, { id, title: 'Synthetic' });
    const load = createCloudRoomCheckpoint(async () => ({ diagramId: id, revision: '2026-10-09T00:00:00Z', content }), standardDataToCanvas);
    const checkpoint = await load({ diagramId: id, userId: id, token: 'synthetic' });
    const cloud = new Y.Doc(); const live = new Y.Doc(); const base = new Y.Doc();
    try {
      Y.applyUpdate(cloud, checkpoint.state);
      publishCollaborationElement(live.getMap('flowchart-nodes'), 'new-node', { id: 'new-node', type: 'flowchart', position: { x: 10, y: 20 },
        selected: true, measured: { width: 150, height: 60 }, width: 150, height: 60, style: { width: 150.4, height: 60 },
        data: { label, domain: '业务域', domainClass: 'core', shape: 'rectangle', icon: 'square', sequence: '1', isEditing: false } });
      expect(readCollaborationElement(cloud.getMap('flowchart-nodes').get('new-node'))).toEqual(readCollaborationElement(live.getMap('flowchart-nodes').get('new-node')));
      expect(areRoomCanvasesEqual(live, cloud)).toBe(true);
      expect(() => reconcileCloudRoom(base, live, cloud)).not.toThrow();
    } finally { cloud.destroy(); live.destroy(); base.destroy(); }
  });
});
