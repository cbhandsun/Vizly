// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../layout/LayoutOptimizer', () => ({
  LayoutOptimizer: {
    getInstance: () => ({
      calculateNodeWidthWithOverrides: () => 180,
      calculateNodeHeightWithOverrides: () => 80,
    }),
  },
}));

import {
  loadDomainCompoundElkStrategy,
  loadDomainElkStrategy,
} from '../useLayoutStrategy';

describe('layout strategy worker reuse', () => {
  it('reuses layered strategy instances across repeated layout switches', async () => {
    const [firstFlat, secondFlat, firstCompound, secondCompound] = await Promise.all([
      loadDomainElkStrategy(),
      loadDomainElkStrategy(),
      loadDomainCompoundElkStrategy(),
      loadDomainCompoundElkStrategy(),
    ]);

    expect(secondFlat).toBe(firstFlat);
    expect(secondCompound).toBe(firstCompound);
    expect(firstCompound).not.toBe(firstFlat);
  });
});
