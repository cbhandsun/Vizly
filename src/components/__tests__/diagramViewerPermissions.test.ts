import { describe, expect, it } from 'vitest';

import { canMutateDiagramDocument } from '../diagramViewerPermissions';

describe('diagram viewer editing permissions', () => {
  it.each([
    { isReadonly: false, isPresentationMode: false, expected: true },
    { isReadonly: true, isPresentationMode: false, expected: false },
    { isReadonly: false, isPresentationMode: true, expected: false },
    { isReadonly: true, isPresentationMode: true, expected: false },
  ])('resolves document mutation access for %o', ({ expected, ...state }) => {
    expect(canMutateDiagramDocument(state)).toBe(expected);
  });
});
