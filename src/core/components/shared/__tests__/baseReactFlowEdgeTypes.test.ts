import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowMergedEdgeTypes } from '../baseReactFlowEdgeTypes';

const makeComponent = (name: string) => {
  const component = (() => null) as ComponentType<any>;
  (component as any).displayName = name;
  return component;
};

describe('baseReactFlowEdgeTypes', () => {
  it('builds the default compatibility map for smart and built-in custom edges', () => {
    const advancedSmartStepEdge = makeComponent('AdvancedSmartStepEdge');
    const advancedSmartBezierEdge = makeComponent('AdvancedSmartBezierEdge');
    const advancedSmartStraightEdge = makeComponent('AdvancedSmartStraightEdge');
    const smartOrthogonalEdge = makeComponent('SmartOrthogonalEdge');
    const elkEdge = makeComponent('ElkEdge');
    const stablePathEdge = makeComponent('StablePathEdge');
    const canvasRefEdge = makeComponent('CanvasRefEdge');
    const editableEdge = makeComponent('EditableEdge');

    const merged = createBaseReactFlowMergedEdgeTypes({
      components: {
        advancedSmartStepEdge,
        advancedSmartBezierEdge,
        advancedSmartStraightEdge,
        smartOrthogonalEdge,
        elkEdge,
        stablePathEdge,
        canvasRefEdge,
        editableEdge,
      },
    });

    expect(merged.elk).toBe(elkEdge);
    expect(merged['advanced-smart']).toBe(advancedSmartStepEdge);
    expect(merged['advanced-smart-bezier']).toBe(advancedSmartBezierEdge);
    expect(merged['advanced-smart-straight']).toBe(advancedSmartStraightEdge);
    expect(merged.smart).toBe(advancedSmartStepEdge);
    expect(merged['smart-orthogonal']).toBe(smartOrthogonalEdge);
    expect(merged.stablePath).toBe(stablePathEdge);
    expect(merged['canvas-ref']).toBe(canvasRefEdge);
    expect(merged.editable).toBe(editableEdge);
  });

  it('lets caller-provided edge types override defaults', () => {
    const overrideEdge = makeComponent('OverrideEdge');
    const merged = createBaseReactFlowMergedEdgeTypes({
      edgeTypes: {
        smart: overrideEdge,
        custom: overrideEdge,
      },
      components: {
        advancedSmartStepEdge: makeComponent('AdvancedSmartStepEdge'),
        advancedSmartBezierEdge: makeComponent('AdvancedSmartBezierEdge'),
        advancedSmartStraightEdge: makeComponent('AdvancedSmartStraightEdge'),
        smartOrthogonalEdge: makeComponent('SmartOrthogonalEdge'),
        elkEdge: makeComponent('ElkEdge'),
        stablePathEdge: makeComponent('StablePathEdge'),
        canvasRefEdge: makeComponent('CanvasRefEdge'),
        editableEdge: makeComponent('EditableEdge'),
      },
    });

    expect(merged.smart).toBe(overrideEdge);
    expect(merged.custom).toBe(overrideEdge);
  });
});
