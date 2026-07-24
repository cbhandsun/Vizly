import { describe, expect, it } from 'vitest';

import { resolveDomainVerticalPipelineControls } from '../domainVerticalPipelineControls';

describe('resolveDomainVerticalPipelineControls', () => {
  it('normalizes explicit phase options without mutating the source', () => {
    const source = {
      optionStopAfterPhase: ' PHASE 2 ',
      configuredStopAfterPhase: 'phase1',
      optionLockSubGroupHeights: true,
      optionFitDomainContent: false,
      configuredConstantGapMode: false,
    };
    const before = structuredClone(source);

    expect(resolveDomainVerticalPipelineControls(source)).toEqual({
      stopAfterPhase: 'phase2',
      lockSubGroupHeights: true,
      fitDomainContent: false,
      constantGapMode: false,
    });
    expect(source).toEqual(before);
  });

  it('uses configured phase only when the option is absent', () => {
    expect(resolveDomainVerticalPipelineControls({
      configuredStopAfterPhase: 'phase1',
    }).stopAfterPhase).toBe('phase1');
    expect(resolveDomainVerticalPipelineControls({
      optionStopAfterPhase: '',
      configuredStopAfterPhase: 'phase1',
    }).stopAfterPhase).toBe('none');
  });

  it.each([
    undefined,
    null,
    '',
    'phase3',
    42,
    {},
    Number.NaN,
  ])('rejects invalid phase input %p', value => {
    expect(resolveDomainVerticalPipelineControls({
      optionStopAfterPhase: value,
      configuredStopAfterPhase: 'invalid',
    }).stopAfterPhase).toBe('none');
  });

  it('accepts only actual booleans for boolean controls', () => {
    expect(resolveDomainVerticalPipelineControls({
      optionLockSubGroupHeights: 'true',
      optionFitDomainContent: 0,
      configuredConstantGapMode: 'false',
    })).toEqual({
      stopAfterPhase: 'none',
      lockSubGroupHeights: false,
      fitDomainContent: true,
      constantGapMode: true,
    });
  });
});
