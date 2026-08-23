import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  applyContainerDrop,
  applySnapDeltaToNodes,
  collectDraggedNodeIds,
  detachDraggedNodesFromParents,
  resolveDraggedNodeParenting,
} from '../diagramContainerDrop';

const node = (id: string, overrides: Partial<Node> = {}): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: {},
  ...overrides,
});

describe('diagramContainerDrop', () => {
  it('reparents an entire dragged selection and expands the target container', () => {
    const parent = node('parent', {
      type: 'titleGroup',
      position: { x: 100, y: 100 },
      style: { width: 200, height: 150 },
      data: { domainClass: 'operations' },
    });
    const first = node('first', {
      position: { x: 130, y: 140 },
      measured: { width: 50, height: 40 },
    });
    const second = node('second', {
      position: { x: 260, y: 200 },
      measured: { width: 50, height: 40 },
    });
    const graphNodes = [parent, first, second];

    const result = applyContainerDrop({
      nodes: graphNodes,
      graphNodes,
      draggedNodeIds: ['first', 'second'],
      parentCandidate: parent,
      snapDelta: { x: 3, y: -2 },
    });

    expect(result.find(item => item.id === 'first')).toMatchObject({
      parentId: 'parent',
      extent: 'parent',
      position: { x: 33, y: 38 },
      data: { domain: 'operations' },
    });
    expect(result.find(item => item.id === 'second')).toMatchObject({
      parentId: 'parent',
      extent: 'parent',
      position: { x: 163, y: 98 },
    });
    expect(result.find(item => item.id === 'parent')?.style).toMatchObject({
      width: 237,
      height: 162,
    });
  });

  it('retains smart-guide snapping while moving inside the same parent', () => {
    const parent = node('parent', {
      type: 'titleGroup',
      position: { x: 100, y: 100 },
      style: { width: 300, height: 200 },
    });
    const child = node('child', {
      parentId: parent.id,
      extent: 'parent',
      position: { x: 20, y: 30 },
    });

    const result = applyContainerDrop({
      nodes: [parent, child],
      graphNodes: [parent, child],
      draggedNodeIds: [child.id],
      parentCandidate: parent,
      snapDelta: { x: 3, y: -2 },
    });

    expect(result.find(item => item.id === child.id)?.position).toEqual({ x: 23, y: 28 });
  });

  it('preserves the graph and node references for an unchanged same-parent drop', () => {
    const parent = node('parent', {
      type: 'titleGroup',
      position: { x: 100, y: 100 },
      style: { width: 300, height: 200 },
      data: { domainClass: 'operations' },
    });
    const child = node('child', {
      parentId: parent.id,
      extent: 'parent',
      position: { x: 20, y: 30 },
      measured: { width: 50, height: 40 },
      data: { domain: 'operations' },
    });
    const nodes = [parent, child];

    const result = applyContainerDrop({
      nodes,
      graphNodes: nodes,
      draggedNodeIds: [child.id],
      parentCandidate: parent,
      snapDelta: null,
    });

    expect(result).toBe(nodes);
    expect(result[0]).toBe(parent);
    expect(result[1]).toBe(child);
  });

  it('detaches every parented dragged node while preserving absolute positions', () => {
    const parent = node('parent', { position: { x: 100, y: 100 } });
    const first = node('first', {
      parentId: parent.id,
      extent: 'parent',
      position: { x: 20, y: 30 },
    });
    const second = node('second', {
      parentId: parent.id,
      extent: 'parent',
      position: { x: 60, y: 70 },
    });
    const graphNodes = [parent, first, second];

    const result = detachDraggedNodesFromParents({
      nodes: graphNodes,
      graphNodes,
      draggedNodeIds: ['first', 'second'],
      snapDelta: { x: 3, y: -2 },
    });

    expect(result.find(item => item.id === 'first')).toMatchObject({ position: { x: 123, y: 128 } });
    expect(result.find(item => item.id === 'second')).toMatchObject({ position: { x: 163, y: 168 } });
    expect(result.find(item => item.id === 'first')).not.toHaveProperty('parentId');
    expect(result.find(item => item.id === 'second')).not.toHaveProperty('extent');
  });

  it('deduplicates dragged ids and applies a top-level snap delta to the full selection', () => {
    const first = node('first', { position: { x: 10, y: 20 } });
    const second = node('second', { position: { x: 30, y: 40 } });

    expect(collectDraggedNodeIds(first, [first, second])).toEqual(['first', 'second']);
    expect(applySnapDeltaToNodes([first, second], new Set(['first', 'second']), { x: 2, y: -3 }))
      .toEqual([
        expect.objectContaining({ id: 'first', position: { x: 12, y: 17 } }),
        expect.objectContaining({ id: 'second', position: { x: 32, y: 37 } }),
      ]);
  });

  it('does not create a cycle when a container is dropped onto its descendant', () => {
    const parent = node('parent', { type: 'titleGroup', position: { x: 0, y: 0 } });
    const childContainer = node('child-container', {
      type: 'subGroup',
      parentId: parent.id,
      position: { x: 20, y: 20 },
    });

    const result = applyContainerDrop({
      nodes: [parent, childContainer],
      graphNodes: [parent, childContainer],
      draggedNodeIds: [parent.id],
      parentCandidate: childContainer,
      snapDelta: null,
    });

    expect(result.find(item => item.id === parent.id)?.parentId).toBeUndefined();
  });

  it('resolves cross-container selections by each node final position', () => {
    const firstParent = node('first-parent', {
      type: 'titleGroup',
      position: { x: 0, y: 0 },
      measured: { width: 200, height: 200 },
    });
    const secondParent = node('second-parent', {
      type: 'titleGroup',
      position: { x: 300, y: 0 },
      measured: { width: 200, height: 200 },
    });
    const first = node('first', {
      parentId: firstParent.id,
      position: { x: 40, y: 40 },
      measured: { width: 40, height: 40 },
    });
    const second = node('second', {
      parentId: secondParent.id,
      position: { x: 50, y: 50 },
      measured: { width: 40, height: 40 },
    });
    const canvasNode = node('canvas', {
      position: { x: 600, y: 300 },
      measured: { width: 40, height: 40 },
    });

    const resolution = resolveDraggedNodeParenting(
      [firstParent, secondParent, first, second, canvasNode],
      [first.id, second.id, canvasNode.id],
    );

    expect(resolution.containerGroups).toEqual([
      expect.objectContaining({ parentCandidate: firstParent, draggedNodeIds: [first.id] }),
      expect.objectContaining({ parentCandidate: secondParent, draggedNodeIds: [second.id] }),
    ]);
    expect(resolution.canvasNodeIds).toEqual([canvasNode.id]);
  });
});
