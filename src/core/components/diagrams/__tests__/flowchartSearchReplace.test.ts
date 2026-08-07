import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  FLOWCHART_REPLACE_TEXT_MAX_LENGTH,
  buildFlowchartCanvasSearchResults,
  coerceFlowchartReplaceText,
  coerceFlowchartSearchText,
  planFlowchartCanvasTextReplacement,
  planFlowchartLabelReplacement,
} from '../flowchartSearchReplace';

describe('flowchartSearchReplace', () => {
  const nodes: Node[] = [
    {
      id: 'node-1',
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { label: 'Alpha alpha', meta: 1 },
    },
    {
      id: 'node-2',
      type: 'custom',
      position: { x: 10, y: 10 },
      data: { label: 'Beta', description: 'Alpha in description', meta: 2 },
    },
  ];
  const edges: Edge[] = [
    {
      id: 'edge-fee',
      source: 'node-1',
      target: 'node-2',
      label: '运输费用',
      data: { label: '运输费用', route: 'alpha' },
    },
    {
      id: 'edge-status',
      source: 'node-2',
      target: 'node-1',
      data: { label: '状态数据' },
    },
  ];

  it('replaces every literal label substring case-insensitively while preserving node data', () => {
    const result = planFlowchartLabelReplacement(nodes, ['node-1'], 'alpha', 'Gamma');

    expect(result.changedIds).toEqual(['node-1']);
    expect(result.nodes).toEqual([
      {
        ...nodes[0],
        data: { label: 'Gamma Gamma', meta: 1 },
      },
      nodes[1],
    ]);
  });

  it('treats regex metacharacters as literal search text and replacement dollars as plain text', () => {
    const source = [{ ...nodes[0], data: { label: 'Cost $(5) + $(5)' } }];
    const result = planFlowchartLabelReplacement(source, ['node-1'], '$(5)', '$&10');

    expect(result.nodes[0].data.label).toBe('Cost $&10 + $&10');
  });

  it('replaces visible rich-text descriptions and preserves a safe multiline presentation', () => {
    const result = planFlowchartLabelReplacement(nodes, ['node-2'], 'alpha', 'Gamma');

    expect(result.changedIds).toEqual(['node-2']);
    expect(result.nodes[1]).toEqual({
      ...nodes[1],
      data: { label: 'Beta', description: 'Gamma in description', meta: 2 },
    });
    expect(result.ignoredNonLabelMatchIds).toEqual([]);
  });

  it('updates imported rich descriptions without allowing replacement markup to execute', () => {
    const source = [{
      ...nodes[0],
      data: {
        label: '物流订单中心',
        description: '<b>物流订单中心</b><br/>• 拆分物流单',
      },
    }];
    const result = planFlowchartLabelReplacement(
      source,
      ['node-1'],
      '物流',
      '<img src=x onerror=alert(1)>运输',
    );

    expect(result.changedIds).toEqual(['node-1']);
    expect(result.nodes[0].data.label).toBe('<img src=x onerror=alert(1)>运输订单中心');
    expect(result.nodes[0].data.description).toBe(
      '&lt;img src=x onerror=alert(1)&gt;运输订单中心\n• 拆分&lt;img src=x onerror=alert(1)&gt;运输单',
    );
  });

  it('ignores matches that exist only in domain metadata or the node id', () => {
    const source = [{
      ...nodes[0],
      id: 'alpha-node',
      data: { label: 'Visible', domain: 'alpha-domain' },
    }];
    const result = planFlowchartLabelReplacement(source, ['alpha-node'], 'alpha', 'Gamma');

    expect(result.nodes).toEqual(source);
    expect(result.changedIds).toEqual([]);
    expect(result.ignoredNonLabelMatchIds).toEqual(['alpha-node']);
  });

  it('skips locked and non-draggable nodes', () => {
    const source = [
      { ...nodes[0], data: { ...nodes[0].data, locked: true } },
      { ...nodes[0], id: 'node-3', draggable: false },
    ];
    const result = planFlowchartLabelReplacement(source, ['node-1', 'node-3'], 'alpha', 'Gamma');

    expect(result.changedIds).toEqual([]);
    expect(result.skippedLockedIds).toEqual(['node-1', 'node-3']);
  });

  it('refuses replacements that would leave a blank label', () => {
    const source = [{ ...nodes[0], data: { label: 'Alpha' } }];
    const result = planFlowchartLabelReplacement(source, ['node-1'], 'Alpha', '   ');

    expect(result.nodes).toEqual(source);
    expect(result.skippedBlankIds).toEqual(['node-1']);
  });

  it('rejects empty and non-string queries without changing node references', () => {
    for (const query of ['', '   ', null, 42]) {
      const result = planFlowchartLabelReplacement(nodes, ['node-1'], query, 'Gamma');
      expect(result.queryValid).toBe(false);
      expect(result.changedIds).toEqual([]);
      expect(result.nodes).toEqual(nodes);
    }
  });

  it('sanitizes unsafe control characters and bounds oversized results', () => {
    expect(coerceFlowchartSearchText('A\u0000B')).toBe('AB');
    expect(coerceFlowchartReplaceText('A\u0007B')).toBe('AB');

    const source = [{ ...nodes[0], data: { label: 'Alpha' } }];
    const result = planFlowchartLabelReplacement(
      source,
      ['node-1'],
      'Alpha',
      'x'.repeat(FLOWCHART_REPLACE_TEXT_MAX_LENGTH + 100),
    );
    expect(String(result.nodes[0].data.label)).toHaveLength(FLOWCHART_REPLACE_TEXT_MAX_LENGTH);
  });

  it('returns an explicit no-op result when the replacement is unchanged', () => {
    const source = [{ ...nodes[0], data: { label: 'Alpha' } }];
    const result = planFlowchartLabelReplacement(source, ['node-1'], 'Alpha', 'Alpha');

    expect(result.changedIds).toEqual([]);
    expect(result.nodes[0]).toBe(source[0]);
  });

  it('discovers visible edge labels alongside node text without treating endpoint ids as text', () => {
    expect(buildFlowchartCanvasSearchResults(nodes, edges, '运输费用')).toEqual([
      { kind: 'edge', id: 'edge-fee' },
    ]);
    expect(buildFlowchartCanvasSearchResults(nodes, edges, '状态数据')).toEqual([
      { kind: 'edge', id: 'edge-status' },
    ]);
    expect(buildFlowchartCanvasSearchResults(nodes, edges, 'node-1')).toEqual([
      { kind: 'node', id: 'node-1' },
    ]);
  });

  it('replaces edge labels in both rendering fields while preserving unrelated data', () => {
    const result = planFlowchartCanvasTextReplacement(
      nodes,
      edges,
      [{ kind: 'edge', id: 'edge-fee' }],
      '运输',
      '配送',
    );

    expect(result.changedMatches).toEqual([{ kind: 'edge', id: 'edge-fee' }]);
    expect(result.nodes).toEqual(nodes);
    expect(result.edges[0]).toEqual({
      ...edges[0],
      label: '配送费用',
      data: { label: '配送费用', route: 'alpha' },
    });
    expect(result.edges[1]).toBe(edges[1]);
  });

  it('protects locked, blank, metadata-only, and oversized edge replacement boundaries', () => {
    const protectedEdges: Edge[] = [
      { ...edges[0], deletable: false },
      { ...edges[1], id: 'edge-blank', data: { label: 'Alpha' } },
      { ...edges[1], id: 'alpha-edge', data: { label: 'Visible' } },
      { ...edges[1], id: 'edge-long', data: { label: 'Alpha suffix' } },
    ];
    const matches = protectedEdges.map(edge => ({ kind: 'edge' as const, id: edge.id }));

    const locked = planFlowchartCanvasTextReplacement(nodes, protectedEdges, [matches[0]], '运输', '配送');
    expect(locked.skippedLockedMatches).toEqual([matches[0]]);

    const blank = planFlowchartCanvasTextReplacement(nodes, protectedEdges, [matches[1]], 'Alpha', '   ');
    expect(blank.skippedBlankMatches).toEqual([matches[1]]);

    const metadata = planFlowchartCanvasTextReplacement(nodes, protectedEdges, [matches[2]], 'alpha', 'Gamma');
    expect(metadata.ignoredMetadataMatches).toEqual([matches[2]]);

    const oversized = planFlowchartCanvasTextReplacement(
      nodes,
      protectedEdges,
      [matches[3]],
      'Alpha',
      'x'.repeat(FLOWCHART_REPLACE_TEXT_MAX_LENGTH + 100),
    );
    expect(oversized.truncatedMatches).toEqual([matches[3]]);
    expect(String(oversized.edges[3].label)).toHaveLength(FLOWCHART_REPLACE_TEXT_MAX_LENGTH);
  });
});
