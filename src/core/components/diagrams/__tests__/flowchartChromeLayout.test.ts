import { describe, expect, it } from 'vitest';

import { resolveFlowchartLeftClearance } from '../flowchartChromeLayout';

describe('resolveFlowchartLeftClearance', () => {
  it('reserves the icon rail and active drawer width', () => {
    expect(resolveFlowchartLeftClearance({
      isSidebarHidden: false,
      leftDrawerOpen: true,
      leftDrawerWidth: 320,
    })).toBe(384);
  });

  it('keeps only the icon rail clearance when the drawer is closed', () => {
    expect(resolveFlowchartLeftClearance({
      isSidebarHidden: false,
      leftDrawerOpen: false,
      leftDrawerWidth: 320,
    })).toBe(64);
  });

  it('returns zero for hidden chrome and bounds invalid drawer widths', () => {
    expect(resolveFlowchartLeftClearance({
      isSidebarHidden: true,
      leftDrawerOpen: true,
      leftDrawerWidth: 320,
    })).toBe(0);
    expect(resolveFlowchartLeftClearance({
      isSidebarHidden: false,
      leftDrawerOpen: true,
      leftDrawerWidth: Number.NaN,
    })).toBe(304);
    expect(resolveFlowchartLeftClearance({
      isSidebarHidden: false,
      leftDrawerOpen: true,
      leftDrawerWidth: 10_000,
    })).toBe(464);
  });
});
