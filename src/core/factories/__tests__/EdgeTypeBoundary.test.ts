import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { EdgeType as WorkerSafeEdgeType } from '../../types/edgeType';
import { EdgeType as FactoryEdgeType } from '../EdgeFactory';

const readSource = (relativeUrl: string): string =>
  readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');

describe('worker-safe EdgeType boundary', () => {
  it('preserves every historical EdgeFactory string identifier', () => {
    expect(Object.entries(WorkerSafeEdgeType)).toEqual([
      ['DEFAULT', 'default'],
      ['STRAIGHT', 'straight'],
      ['STEP', 'step'],
      ['SMOOTHSTEP', 'smoothstep'],
      ['BEZIER', 'bezier'],
      ['SMART_BEZIER', 'smart-bezier'],
      ['SMART_STRAIGHT', 'smart-straight'],
      ['SMART_STEP', 'smart-step'],
      ['ADVANCED_SMART_STEP', 'advanced-smart-step'],
      ['ADVANCED_SMART_BEZIER', 'advanced-smart-bezier'],
      ['ADVANCED_SMART_STRAIGHT', 'advanced-smart-straight'],
      ['ADVANCED_CUSTOM', 'advancedCustomEdge'],
      ['ELK', 'elk'],
    ]);
  });

  it('keeps the EdgeFactory compatibility export identical', () => {
    expect(FactoryEdgeType).toBe(WorkerSafeEdgeType);
  });

  it('keeps the display-routing import chain off UI factory runtimes', () => {
    const edgeTypeSource = readSource('../../types/edgeType.ts');
    const handlePickerSource = readSource('../../utils/HandlePicker.ts');
    const advancedRoutingSource = readSource('../../routing/utils/AdvancedRouting.ts');
    const handleUtilsSource = readSource('../../routing/utils/handleUtils.ts');

    expect(edgeTypeSource).not.toMatch(/^\s*import\s/m);
    expect(handlePickerSource).toContain("from '../types/edgeType'");
    expect(handlePickerSource).not.toContain("from '../factories/EdgeFactory'");
    expect(advancedRoutingSource).toContain("from '../../types/edgeType'");
    expect(advancedRoutingSource).not.toContain("from '../../factories/EdgeFactory'");
    expect(handleUtilsSource).toContain("import type { Position } from '@xyflow/react'");
    expect(handleUtilsSource).not.toMatch(/^\s*import\s+\{\s*Position\s*\}/m);
  });
});
