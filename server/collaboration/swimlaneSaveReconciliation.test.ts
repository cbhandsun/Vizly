// @vitest-environment node
import { expect, it } from 'vitest';
import * as Y from 'yjs';
import { standardDataToCanvas } from '@vizly/core/canvas-conversion';
import captured from './fixtures/swimlaneSaveReconciliation.json' with { type: 'json' };
import { createCloudRoomCheckpoint } from './roomBootstrap.js';
import { reconcileRoomCheckpoint } from './roomCheckpointCoordination.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
import type { createCloudRoomSource } from './cloudRoomSource.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';
import { decodeRoomRecord, encodeRoomCheckpoint } from './roomCheckpoint.js';
import { areRoomCanvasesEqual } from './cloudRoomReconciliation.js';

const state = (snapshot: Record<string, Record<string, unknown>>): Uint8Array => {
  const doc = new Y.Doc();
  try {
    for (const [name, elements] of Object.entries(snapshot)) {
      for (const [id, element] of Object.entries(elements)) {
        const parsed = readCollaborationElement(element);
        if (!parsed || !publishCollaborationElement(doc.getMap(name), id, parsed)) throw Error('Invalid test graph');
      }
    }
    return Y.encodeStateAsUpdate(doc);
  } finally { doc.destroy(); }
};

it('admits a viewer after a saved AI edit and LR swimlane layout without conflicting with automatic ports', async () => {
  const source: ReturnType<typeof createCloudRoomSource> = async () => ({
    ...captured.cloud, diagramId: captured.cloud.content.id,
  });
  const cloud = await createCloudRoomCheckpoint(source, standardDataToCanvas)({
    token: 'unused-fixture', diagramId: captured.cloud.content.id, userId: 'unused-fixture',
  });
  const accepted = reconcileRoomCheckpoint({ state: state(captured.live), checkpoint: {
    revision: captured.baseRevision, base: state(captured.base),
  } }, cloud);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, accepted.state);
    expect(doc.getMap('flowchart-nodes').size).toBe(4);
    expect(doc.getMap('flowchart-edges').size).toBe(2);
    expect(readCollaborationElement(doc.getMap('flowchart-nodes').get('release-review'))?.data)
      .toMatchObject({ label: '审核（泳道路由最终复验通过）' });
    for (const value of doc.getMap('flowchart-edges').values()) {
      expect(readCollaborationElement(value)?.sourceHandle).toBeUndefined();
      expect(readCollaborationElement(value)?.targetHandle).toBeUndefined();
    }
  } finally { doc.destroy(); }
});

it('still rejects a conflicting authored port change instead of discarding it', async () => {
  const manual = structuredClone(captured.cloud);
  manual.content.edges[0].metadata.manualHandles = true;
  const source: ReturnType<typeof createCloudRoomSource> = async () => ({
    ...manual, diagramId: manual.content.id,
  });
  const cloud = await createCloudRoomCheckpoint(source, standardDataToCanvas)({
    token: 'unused-fixture', diagramId: manual.content.id, userId: 'unused-fixture',
  });
  expect(() => reconcileRoomCheckpoint({ state: state(captured.live), checkpoint: {
    revision: captured.baseRevision, base: state(captured.base),
  } }, cloud)).toThrow(CloudRoomConflictError);
});

it('keeps the persisted cloud baseline readable by the previous converter on rollback', async () => {
  const source: ReturnType<typeof createCloudRoomSource> = async () => ({
    ...captured.cloud, diagramId: captured.cloud.content.id,
  });
  const cloud = await createCloudRoomCheckpoint(source, standardDataToCanvas)({
    token: 'unused-fixture', diagramId: captured.cloud.content.id, userId: 'unused-fixture',
  });
  const accepted = reconcileRoomCheckpoint({ state: state(captured.live), checkpoint: {
    revision: captured.baseRevision, base: state(captured.base),
  } }, cloud);
  const persisted = decodeRoomRecord(encodeRoomCheckpoint(accepted));
  const previousState = state(captured.previousConverterCloud);
  expect(() => reconcileRoomCheckpoint(persisted, {
    revision: cloud.revision, base: previousState, state: previousState,
  })).not.toThrow();
});

it('recovers the earlier automatic-port projection without clearing the retained room', async () => {
  const source: ReturnType<typeof createCloudRoomSource> = async () => ({
    ...captured.cloud, diagramId: captured.cloud.content.id,
  });
  const cloud = await createCloudRoomCheckpoint(source, standardDataToCanvas)({
    token: 'unused-fixture', diagramId: captured.cloud.content.id, userId: 'unused-fixture',
  });
  const projected = reconcileRoomCheckpoint(null, cloud);
  const accepted = reconcileRoomCheckpoint({ state: projected.state, checkpoint: {
    revision: cloud.revision, base: projected.state,
  } }, cloud);
  const expected = new Y.Doc();
  const actual = new Y.Doc();
  try {
    Y.applyUpdate(expected, projected.state);
    Y.applyUpdate(actual, accepted.state);
    expect(areRoomCanvasesEqual(expected, actual)).toBe(true);
    expect(Buffer.from(accepted.base)).toEqual(Buffer.from(cloud.base));
  } finally { expected.destroy(); actual.destroy(); }
});

it('rejects a changed cloud label at the same revision even with automatic-port metadata', async () => {
  const source: ReturnType<typeof createCloudRoomSource> = async () => ({
    ...captured.cloud, diagramId: captured.cloud.content.id,
  });
  const cloud = await createCloudRoomCheckpoint(source, standardDataToCanvas)({
    token: 'unused-fixture', diagramId: captured.cloud.content.id, userId: 'unused-fixture',
  });
  const accepted = reconcileRoomCheckpoint(null, cloud);
  const tampered = new Y.Doc();
  try {
    Y.applyUpdate(tampered, cloud.base);
    const nodes = tampered.getMap('flowchart-nodes');
    const node = readCollaborationElement(nodes.get('release-review'));
    if (!node) throw Error('Missing fixture node');
    publishCollaborationElement(nodes, 'release-review', { ...node, description: 'Changed without revision' });
    const changed = Y.encodeStateAsUpdate(tampered);
    expect(() => reconcileRoomCheckpoint(decodeRoomRecord(encodeRoomCheckpoint(accepted)), {
      ...cloud, base: changed, state: changed,
    })).toThrow(CloudRoomConflictError);
  } finally { tampered.destroy(); }
});
