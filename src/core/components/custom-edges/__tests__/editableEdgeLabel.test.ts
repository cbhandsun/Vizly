import { describe, expect, it } from 'vitest';

import { resolveEditableEdgeLabel } from '../editableEdgeLabel';

describe('resolveEditableEdgeLabel', () => {
  it('prefers the validated data label and falls back to the React Flow edge label', () => {
    expect(resolveEditableEdgeLabel('Data label', 'Edge label')).toBe('Data label');
    expect(resolveEditableEdgeLabel(undefined, 'Edge label')).toBe('Edge label');
    expect(resolveEditableEdgeLabel(undefined, 42)).toBe('42');
  });

  it('rejects unsupported and non-finite label values', () => {
    expect(resolveEditableEdgeLabel({ unsafe: true }, null)).toBeUndefined();
    expect(resolveEditableEdgeLabel(undefined, false)).toBeUndefined();
    expect(resolveEditableEdgeLabel(Number.POSITIVE_INFINITY, undefined)).toBeUndefined();
  });
});
