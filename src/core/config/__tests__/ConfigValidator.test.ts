import { describe, expect, it } from 'vitest';
import { createDefaultRoutingConfig, type UnifiedRoutingConfig } from '../../types/routing';
import { ConfigValidator } from '../ConfigValidator';

function configWith(mutator: (config: UnifiedRoutingConfig) => void): UnifiedRoutingConfig {
  const config = structuredClone(createDefaultRoutingConfig()) as UnifiedRoutingConfig;
  mutator(config);
  return config;
}

describe('ConfigValidator', () => {
  it('accepts the default routing configuration', () => {
    const result = ConfigValidator.validate(createDefaultRoutingConfig());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(ConfigValidator.isValid(createDefaultRoutingConfig())).toBe(true);
    expect(() => ConfigValidator.assertValid(createDefaultRoutingConfig())).not.toThrow();
  });

  it('reports hard errors for invalid algorithm and threshold values', () => {
    const result = ConfigValidator.validate(configWith(config => {
      config.algorithm.gridSize = 4;
      config.algorithm.visibilityGraphThreshold = -1;
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('algorithm.gridSize must be >= 5 (too fine grid causes performance issues)');
    expect(result.errors).toContain('algorithm.visibilityGraphThreshold must be >= 0');
  });

  it('emits warnings for unusual but still valid algorithm and cost settings', () => {
    const result = ConfigValidator.validate(configWith(config => {
      config.algorithm.gridSize = 30;
      config.algorithm.visibilityGraphThreshold = 3;
      config.costs.lineCross = config.costs.lineOccupied;
      config.costs.obstacle = config.costs.lineCross;
      config.costs.bufferZoneClose = config.costs.bufferZoneFar;
      config.costs.mergePath = config.costs.normal;
      config.costs.directionChange = 1001;
    }));

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      'algorithm.gridSize > 25 may cause suboptimal routing',
      'algorithm.visibilityGraphThreshold < 5 may trigger VG too often, impacting performance',
      'costs.obstacle should be >> costs.lineCross to prevent routing through nodes',
      'costs.lineCross should be > costs.lineOccupied to penalize crossings more',
      'costs.bufferZoneClose should be > costs.bufferZoneFar for graduated buffer zones',
      'costs.mergePath should be < costs.normal to encourage path merging',
      'costs.directionChange > 1000 may cause overly straight paths that avoid obstacles poorly',
    ]));
  });

  it('validates bus and port selection constraints', () => {
    const result = ConfigValidator.validate(configWith(config => {
      config.bus.manyToOneSpacing = 0;
      config.bus.trunkMultiplier = 0;
      config.portSelection.lowConfidenceThreshold = 0.9;
      config.portSelection.highConfidenceThreshold = 0.8;
      config.portSelection.portUsageWeight = -1;
      config.portSelection.portSlidePadding = -1;
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'bus.manyToOneSpacing must be >= 1',
      'bus.trunkMultiplier must be >= 1',
      'portSelection.lowConfidenceThreshold must be < highConfidenceThreshold',
      'portSelection.portUsageWeight must be >= 0',
      'portSelection.portSlidePadding must be >= 0',
    ]));
  });

  it('validates post-processing bounds and waypoint weights', () => {
    const result = ConfigValidator.validate(configWith(config => {
      config.postProcessing.borderRadius = -1;
      config.postProcessing.minFirstSegment = -1;
      config.postProcessing.minLastSegment = -1;
      config.postProcessing.redundantBendThreshold = -1;
      config.postProcessing.finalRedundantBendThreshold = -1;
      config.postProcessing.nudgeSpacing = -1;
      config.postProcessing.nudgeSearchLimit = -1;
      config.postProcessing.waypointRefinementPasses = -1;
      config.postProcessing.maxWaypointRefineEdgesPerPass = -1;
      config.postProcessing.maxWaypointRerouteEdges = -1;
      config.postProcessing.waypointHardCrossingWeight = -1;
      config.postProcessing.waypointSoftNearMissPadding = -1;
    }));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'postProcessing.borderRadius must be >= 0',
      'postProcessing.minFirstSegment must be >= 0',
      'postProcessing.minLastSegment must be >= 0',
      'postProcessing.redundantBendThreshold must be >= 0',
      'postProcessing.finalRedundantBendThreshold must be >= 0',
      'postProcessing.nudgeSpacing must be >= 0',
      'postProcessing.nudgeSearchLimit must be >= 0',
      'postProcessing.waypointRefinementPasses must be >= 0',
      'postProcessing.maxWaypointRefineEdgesPerPass must be >= 0',
      'postProcessing.maxWaypointRerouteEdges must be >= 0',
      'postProcessing.waypointHardCrossingWeight must be a non-negative number',
      'postProcessing.waypointSoftNearMissPadding must be >= 0',
    ]));
  });

  it('throws a readable error when asserting invalid configurations', () => {
    const invalid = configWith(config => {
      config.costs.normal = 0;
      config.offsets.source = -1;
    });

    expect(ConfigValidator.isValid(invalid)).toBe(false);
    expect(() => ConfigValidator.assertValid(invalid)).toThrow(/Invalid routing configuration/);
    expect(() => ConfigValidator.assertValid(invalid)).toThrow(/costs\.normal must be > 0/);
    expect(() => ConfigValidator.assertValid(invalid)).toThrow(/offsets\.source must be >= 0/);
  });
});
