import { describe, expect, it } from 'vitest';
import {
  buildAlignedDirectPath,
  detectLocalDoglegRisks,
  simplifyOrthogonalPointChain,
} from '../localDoglegQuality';

describe('localDoglegQuality', () => {
  it('detects an aligned local dogleg that can be flattened', () => {
    const points = simplifyOrthogonalPointChain([
      { x: 249, y: 1850 },
      { x: 249, y: 1890 },
      { x: 297, y: 1890 },
      { x: 297, y: 1970 },
      { x: 249, y: 1970 },
      { x: 249, y: 2010 },
    ]);

    expect(detectLocalDoglegRisks(points)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'aligned-local-dogleg',
        type: 'V-H-V',
        depth: 48,
      }),
    ]));
    expect(buildAlignedDirectPath(points)).toEqual([
      { x: 249, y: 1850 },
      { x: 249, y: 2010 },
    ]);
  });

  it('does not flag a required cross-axis route between offset ports as aligned', () => {
    const risks = detectLocalDoglegRisks([
      { x: 589.625, y: 754 },
      { x: 589.625, y: 860 },
      { x: 436.375, y: 860 },
      { x: 436.375, y: 914 },
    ]);

    expect(risks.some(risk => risk.rule === 'aligned-local-dogleg')).toBe(false);
  });

  it('detects a short return notch on an otherwise straight lane', () => {
    const risks = detectLocalDoglegRisks([
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 28 },
      { x: 120, y: 28 },
      { x: 120, y: 0 },
      { x: 200, y: 0 },
    ]);

    expect(risks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'local-micro-dogleg',
        type: 'H-V-H',
        depth: 28,
      }),
    ]));
  });
});
