// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { standardDataToCanvas } from '@vizly/core/canvas-conversion';
import { parseRemoteDiagramContent } from '@vizly/core/remote-content';
import { createCloudRoomCheckpoint } from './roomBootstrap.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import { reconcileRoomCheckpoint } from './roomCheckpointCoordination.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';
import type { RoomCheckpoint } from './roomCheckpoint.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firstRevision = '2026-10-08T20:00:00.123456Z';
const nextRevision = '2026-10-08T20:00:00.123457Z';
const documents: Y.Doc[] = [];
afterEach(() => { for (const doc of documents.splice(0)) doc.destroy(); });
const document = (state?: Uint8Array) => {
  const doc = new Y.Doc(); documents.push(doc);
  if (state) Y.applyUpdate(doc, state);
  return doc;
};
const readNode = (state: Uint8Array) => readCollaborationElement(document(state).getMap('flowchart-nodes').get('n1'));
const cloudCheckpoint = async (revision: string, width: number, height: number, styleWidth: number, styleHeight: number): Promise<RoomCheckpoint> => {
  const content = parseRemoteDiagramContent({ id, name: 'Synthetic', type: 'flowchart', version: '1.0.0', nodes: [
    { id: 'n1', description: 'Synthetic label', type: 'flowchart', domain: 'default',
      metadata: { canvasPosition: { x: 7, y: 9 }, width, height, style: { width: styleWidth, height: styleHeight } } },
  ], edges: [] }, { id, title: 'Synthetic' });
  return createCloudRoomCheckpoint(async () => ({ diagramId: id, content, revision }), standardDataToCanvas)({
    diagramId: id, userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', token: 'synthetic-unused',
  });
};
const liveState = (cloud: RoomCheckpoint, width: number, height: number, styleWidth: number, styleHeight: number) => {
  const node = readNode(cloud.state);
  if (!node) throw new Error('Synthetic converted node absent');
  const doc = document();
  if (!publishCollaborationElement(doc.getMap('flowchart-nodes'), 'n1', {
    ...node, width, height, style: { ...(node.style as Record<string, unknown>), width: styleWidth, height: styleHeight },
  })) throw new Error('Invalid synthetic live node');
  return Y.encodeStateAsUpdate(doc);
};

describe('cloud saves of collaborative geometry', () => {
  it('accepts the same saved canvas without confusing measured dimensions and rendering styles', async () => {
    const baseline = await cloudCheckpoint(firstRevision, 83, 81, 83, 81);
    const cloud = await cloudCheckpoint(nextRevision, 143, 75, 83, 111);
    const live = liveState(cloud, 143, 75, 83, 111);
    const before = Array.from(live);
    const accepted = reconcileRoomCheckpoint({ state: live, checkpoint: { revision: firstRevision, base: baseline.base } }, cloud);
    expect(accepted.revision).toBe(nextRevision);
    expect(readNode(accepted.state)).toEqual(readNode(live));
    expect(readNode(accepted.state)).toMatchObject({ width: 143, height: 75, style: { width: 83, height: 111 } });
    expect(Array.from(live)).toEqual(before);
  });
  it('retains fractional rendering sizes together with measured integer canvas sizes', async () => {
    const baseline = await cloudCheckpoint(firstRevision, 150, 60, 150.4, 60.2);
    expect(readNode(baseline.state)).toMatchObject({ width: 150, height: 60, style: { width: 150.4, height: 60.2 } });
  });
  it('still rejects genuinely different concurrent height edits and preserves the accepted input', async () => {
    const baseline = await cloudCheckpoint(firstRevision, 83, 81, 83, 81);
    const cloud = await cloudCheckpoint(nextRevision, 143, 66, 83, 111);
    const live = liveState(cloud, 143, 75, 83, 111);
    const before = Array.from(live);
    expect(() => reconcileRoomCheckpoint({ state: live, checkpoint: { revision: firstRevision, base: baseline.base } }, cloud))
      .toThrow(CloudRoomConflictError);
    expect(Array.from(live)).toEqual(before);
  });
});
