// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  applyStandardFlowTemplateSelection,
  resolveStandardFlowPreset,
} from '../standardFlowTemplateSelection';

describe('standardFlowTemplateSelection', () => {
  it('returns null instead of silently substituting a default preset', () => {
    expect(resolveStandardFlowPreset({ known: { id: 'known' } }, 'known')).toEqual({ id: 'known' });
    expect(resolveStandardFlowPreset({ known: { id: 'known' } }, 'missing')).toBeNull();
  });

  it('does not replace the canvas when conversion finishes after the selection is stale', async () => {
    let resolveConversion!: (value: { nodes: []; edges: [] }) => void;
    let current = true;
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const pending = applyStandardFlowTemplateSelection(
      { id: 'template-a' },
      { isCurrent: () => current },
      {
        convertData: () => new Promise((resolve) => { resolveConversion = resolve; }),
        setNodes,
        setEdges,
        scheduleFitView: vi.fn(),
        fitView: vi.fn(),
      },
    );

    current = false;
    resolveConversion({ nodes: [], edges: [] });

    await expect(pending).resolves.toBe(false);
    expect(setNodes).not.toHaveBeenCalled();
    expect(setEdges).not.toHaveBeenCalled();
  });

  it('applies current data but suppresses a delayed fit after a newer selection', async () => {
    let scheduledFit: (() => void) | undefined;
    let current = true;
    const setNodes = vi.fn();
    const setEdges = vi.fn();
    const fitView = vi.fn();

    await expect(applyStandardFlowTemplateSelection(
      { id: 'template-a' },
      { isCurrent: () => current },
      {
        convertData: vi.fn(async () => ({ nodes: [], edges: [] })),
        setNodes,
        setEdges,
        scheduleFitView: (callback) => { scheduledFit = callback; },
        fitView,
      },
    )).resolves.toBe(true);

    expect(setNodes).toHaveBeenCalledWith([]);
    expect(setEdges).toHaveBeenCalledWith([]);
    current = false;
    scheduledFit?.();
    expect(fitView).not.toHaveBeenCalled();
  });
});
