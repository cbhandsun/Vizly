import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  FLOWCHART_REPLACE_TEXT_MAX_LENGTH,
  coerceFlowchartReplaceText,
  coerceFlowchartSearchText,
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

  it('ignores metadata-only matches because replacement edits labels only', () => {
    const result = planFlowchartLabelReplacement(nodes, ['node-2'], 'alpha', 'Gamma');

    expect(result.nodes).toEqual(nodes);
    expect(result.changedIds).toEqual([]);
    expect(result.ignoredNonLabelMatchIds).toEqual(['node-2']);
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
});
