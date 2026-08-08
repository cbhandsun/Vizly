import { describe, expect, it } from 'vitest';

import {
  COMPACT_EDITABLE_EDGE_ZOOM,
  isCompactEditableEdgeZoom,
} from '../editableEdgeControlDensity';

describe('editable edge control density', () => {
  it('uses compact disclosure below the editing threshold', () => {
    expect(isCompactEditableEdgeZoom(0.32)).toBe(true);
    expect(isCompactEditableEdgeZoom(COMPACT_EDITABLE_EDGE_ZOOM)).toBe(false);
    expect(isCompactEditableEdgeZoom(0.8)).toBe(false);
  });

  it('fails safely for empty and invalid zoom input', () => {
    expect(isCompactEditableEdgeZoom(undefined)).toBe(true);
    expect(isCompactEditableEdgeZoom(Number.NaN)).toBe(true);
    expect(isCompactEditableEdgeZoom(Number.POSITIVE_INFINITY)).toBe(true);
  });
});
