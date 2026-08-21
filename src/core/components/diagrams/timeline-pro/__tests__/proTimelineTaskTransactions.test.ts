import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  collectProTimelineDeletionIds,
  createProTimelineTaskAddition,
  createProTimelineTaskDeletion,
  createProTimelineTaskReparenting,
  getProTimelineAvailableParentIds,
  getProTimelineDeletionFallbackId,
} from '../proTimelineTaskTransactions';

const node = (
  id: string,
  parentId?: string,
  selected = false,
): Node => ({
  id,
  type: 'timelineNode',
  position: { x: 0, y: 0 },
  selected,
  data: {
    date: '2026-08-21',
    endDate: '2026-08-22',
    label: id,
    parentId,
    type: 'phase',
  },
});

describe('pro timeline task transactions', () => {
  it('adds and selects a child atomically while expanding its parent', () => {
    const result = createProTimelineTaskAddition([node('parent', undefined, true)], {
      id: 'child',
      label: 'New child',
      parentId: 'parent',
      startDate: '2026-08-25',
      type: 'phase',
    });

    expect(result.changed).toBe(true);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({ selected: false, data: { isExpanded: true } });
    expect(result.nodes[1]).toMatchObject({
      id: 'child',
      selected: true,
      data: {
        date: '2026-08-21',
        endDate: '2026-08-22',
        label: 'New child',
        parentId: 'parent',
        type: 'phase',
      },
    });
  });

  it('keeps milestone dates atomic and rejects invalid or duplicate additions', () => {
    const existing = [node('existing')];
    const milestone = createProTimelineTaskAddition(existing, {
      id: 'milestone',
      label: 'Gate',
      parentId: null,
      startDate: '2026-08-29',
      type: 'milestone',
    });
    expect(milestone.nodes[1].data.endDate).toBe('2026-08-29');

    expect(createProTimelineTaskAddition(existing, {
      id: 'existing', label: 'Duplicate', parentId: null, startDate: '2026-08-29', type: 'event',
    }).changed).toBe(false);
    expect(createProTimelineTaskAddition(existing, {
      id: 'bad', label: 'Bad date', parentId: null, startDate: 'not-a-date', type: 'event',
    }).changed).toBe(false);
  });

  it('collects descendants without recursing forever through malformed hierarchy cycles', () => {
    const deletionIds = collectProTimelineDeletionIds([
      { id: 'root', parentId: 'child' },
      { id: 'child', parentId: 'root' },
      { id: 'outside' },
    ], 'root');
    expect([...deletionIds]).toEqual(['root', 'child']);
  });

  it('deletes descendants and connected edges, then selects a stable fallback', () => {
    const nodes = [node('before'), node('parent'), node('child', 'parent', true), node('grandchild', 'child'), node('after')];
    const edges: Edge[] = [
      { id: 'internal', source: 'child', target: 'grandchild' },
      { id: 'external', source: 'before', target: 'child' },
      { id: 'keep', source: 'before', target: 'after' },
    ];

    expect(getProTimelineDeletionFallbackId(nodes.map(item => ({ id: item.id, parentId: item.data.parentId as string | undefined })), 'child')).toBe('parent');
    const result = createProTimelineTaskDeletion(nodes, edges, 'child');

    expect(result).toMatchObject({
      changed: true,
      deletedEdgeCount: 2,
      deletedNodeCount: 2,
      fallbackTaskId: 'parent',
    });
    expect(result.nodes.map(item => [item.id, item.selected])).toEqual([
      ['before', false], ['parent', true], ['after', false],
    ]);
    expect(result.edges.map(edge => edge.id)).toEqual(['keep']);
  });

  it('leaves the graph unchanged when the deletion target is missing', () => {
    const nodes = [node('only', undefined, true)];
    const result = createProTimelineTaskDeletion(nodes, [], 'missing');
    expect(result.changed).toBe(false);
    expect(result.nodes).toEqual(nodes);
    expect(result.deletedNodeCount).toBe(0);
  });

  it('excludes the target and its descendants from available parents', () => {
    const nodes = [
      node('root'),
      node('target', 'root'),
      node('child', 'target'),
      node('grandchild', 'child'),
      node('other'),
    ];

    expect([...getProTimelineAvailableParentIds(nodes, 'target')])
      .toEqual(['root', 'other']);
    expect([...getProTimelineAvailableParentIds(nodes, '')]).toEqual([]);
    expect([...getProTimelineAvailableParentIds(nodes, 'missing')]).toEqual([]);
  });

  it('moves a task subtree atomically and expands the new parent', () => {
    const collapsedParent = node('other');
    collapsedParent.data.isExpanded = false;
    const nodes = [
      node('root'),
      node('target', 'root', true),
      node('child', 'target'),
      collapsedParent,
    ];

    const result = createProTimelineTaskReparenting(nodes, 'target', 'other');

    expect(result.changed).toBe(true);
    expect(result.nodes.find(item => item.id === 'target')?.data.parentId).toBe('other');
    expect(result.nodes.find(item => item.id === 'child')?.data.parentId).toBe('target');
    expect(result.nodes.find(item => item.id === 'other')?.data.isExpanded).toBe(true);
    expect(result.nodes.find(item => item.id === 'target')?.selected).toBe(true);
  });

  it('promotes a task to the top level without leaving a stale parent id', () => {
    const result = createProTimelineTaskReparenting(
      [node('root'), node('child', 'root')],
      'child',
      null,
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[1]?.data).not.toHaveProperty('parentId');
  });

  it.each([
    ['self-parent', 'target', 'target'],
    ['descendant-parent', 'target', 'child'],
    ['missing-parent', 'target', 'missing'],
    ['missing-target', 'missing', 'root'],
    ['invalid-target', '', 'root'],
    ['unchanged', 'target', 'root'],
  ] as const)('rejects %s hierarchy updates', (reason, targetId, parentId) => {
    const nodes = [node('root'), node('target', 'root'), node('child', 'target')];
    const result = createProTimelineTaskReparenting(nodes, targetId, parentId);

    expect(result).toMatchObject({ changed: false, reason });
    expect(result.nodes).toEqual(nodes);
  });
});
