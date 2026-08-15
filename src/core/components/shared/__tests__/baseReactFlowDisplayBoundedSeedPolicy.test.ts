import { describe, expect, it } from "vitest";

import { shouldStopAfterBoundedTerminalLaneSeed } from "../baseReactFlowDisplayBoundedSeedPolicy";

describe("shouldStopAfterBoundedTerminalLaneSeed", () => {
  it("stops duplicate global work for large bounded seeds", () => {
    expect(shouldStopAfterBoundedTerminalLaneSeed({
      skipFullRouteFallback: true,
      edgeCount: 25,
      nodeCount: 1,
    })).toBe(true);
    expect(shouldStopAfterBoundedTerminalLaneSeed({
      skipFullRouteFallback: true,
      edgeCount: 1,
      nodeCount: 41,
    })).toBe(true);
  });

  it("keeps the complete bounded repair for small graphs and standalone calls", () => {
    expect(shouldStopAfterBoundedTerminalLaneSeed({
      skipFullRouteFallback: true,
      edgeCount: 24,
      nodeCount: 40,
    })).toBe(false);
    expect(shouldStopAfterBoundedTerminalLaneSeed({
      skipFullRouteFallback: false,
      edgeCount: 100,
      nodeCount: 100,
    })).toBe(false);
  });

  it("does not promote invalid counts into the large-graph path", () => {
    expect(shouldStopAfterBoundedTerminalLaneSeed({
      skipFullRouteFallback: true,
      edgeCount: Number.POSITIVE_INFINITY,
      nodeCount: -1,
    })).toBe(false);
  });
});
