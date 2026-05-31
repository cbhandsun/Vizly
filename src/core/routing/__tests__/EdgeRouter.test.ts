import { describe, expect, it } from 'vitest';
import { edgeRouter } from '../EdgeRouter';
import type { EdgeRoutingWeights, NodeGeometry, RoutingConfig } from '../types/routing';

describe('EdgeRouter', () => {
  const weights: Partial<EdgeRoutingWeights> = {
    length: 1,
    turn: 500,
    crossing: 1000,
    edgeCrossing: 80,
    wrongSign: 2000,
    lShapeBonus: 1500,
    usagePenalty: 40,
  };

  it('keeps side ports for vertical-layout reverse edges with enough horizontal room', () => {
    const source: NodeGeometry = {
      id: 'calc-theory-ratio',
      position: { x: 120, y: 1062 },
      dimensions: { width: 246, height: 96 },
    };
    const target: NodeGeometry = {
      id: 'sort-demand',
      position: { x: 639, y: 38 },
      dimensions: { width: 204, height: 96 },
    };
    const config: RoutingConfig = {
      mode: 'advanced-smart',
      globalPath: 'step',
      layoutDirection: 'TB',
      directionalHandlePolicy: 'force',
      preAssignedPortPolicy: 'prefer',
      preAssignedPorts: {
        'calc-theory-ratio': { source: 'bottom' },
        'sort-demand': { target: 'top' },
      },
    };

    const result = edgeRouter.route(source, target, config, undefined, weights);

    expect(result).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      autoSource: true,
      autoTarget: true,
    });
  });
});
