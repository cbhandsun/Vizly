import { describe, expect, it } from 'vitest';
import {
  baseAnimation,
  baseBorderRadius,
  baseShadow,
  baseSpacing,
  baseTypography,
} from '../BaseConstants';
import {
  baseAnimation as constantsBaseAnimation,
  baseTypography as constantsBaseTypography,
} from '../constants/BaseConstants';

describe('BaseConstants', () => {
  it('exports frozen root constants', () => {
    expect(Object.isFrozen(baseTypography)).toBe(true);
    expect(Object.isFrozen(baseSpacing)).toBe(true);
    expect(Object.isFrozen(baseBorderRadius)).toBe(true);
    expect(Object.isFrozen(baseShadow)).toBe(true);
    expect(Object.isFrozen(baseAnimation)).toBe(true);
  });

  it('freezes nested typography and animation values', () => {
    expect(Object.isFrozen(baseTypography.fontFamily)).toBe(true);
    expect(Object.isFrozen(baseTypography.fontFamily.sans)).toBe(true);
    expect(Object.isFrozen(baseTypography.fontSize)).toBe(true);
    expect(Object.isFrozen(baseAnimation.duration)).toBe(true);
    expect(Object.isFrozen(baseAnimation.easing)).toBe(true);
  });

  it('keeps the constants subpath frozen as well', () => {
    expect(Object.isFrozen(constantsBaseTypography)).toBe(true);
    expect(Object.isFrozen(constantsBaseTypography.fontFamily.sans)).toBe(true);
    expect(Object.isFrozen(constantsBaseAnimation.duration)).toBe(true);
  });
});
