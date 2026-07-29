import { describe, expect, it } from 'vitest';

import { getDiagramCollectionIssues } from '../dataRegistryValidation';

describe('getDiagramCollectionIssues', () => {
  it('accepts intentionally empty diagrams without warning issues', () => {
    expect(getDiagramCollectionIssues({ nodes: [], edges: [] })).toEqual({
      missingNodes: false,
      missingEdges: false,
    });
  });

  it('detects missing or invalid collections', () => {
    expect(getDiagramCollectionIssues({})).toEqual({
      missingNodes: true,
      missingEdges: true,
    });
    expect(getDiagramCollectionIssues({ nodes: null, edges: 'invalid' })).toEqual({
      missingNodes: true,
      missingEdges: true,
    });
    expect(getDiagramCollectionIssues(null)).toEqual({
      missingNodes: true,
      missingEdges: true,
    });
  });
});
