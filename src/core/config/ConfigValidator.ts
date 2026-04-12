/**
 * Configuration Validator
 * 
 * Validates routing configuration to ensure correctness and provides warnings
 * for potentially problematic settings.
 */

import type { UnifiedRoutingConfig } from '../types/routing';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export class ConfigValidator {
    /**
     * Validate configuration
     * 
     * @param config Configuration to validate
     * @returns Validation result
     */
    static validate(config: UnifiedRoutingConfig): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate algorithm configuration
        this.validateAlgorithm(config, errors, warnings);

        // Validate cost configuration
        this.validateCosts(config, errors, warnings);

        // Validate bus configuration
        this.validateBus(config, errors, warnings);

        // Validate port selection configuration
        this.validatePortSelection(config, errors, warnings);

        // Validate post-processing configuration
        this.validatePostProcessing(config, errors, warnings);

        // Validate offsets
        this.validateOffsets(config, errors, warnings);

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    private static validateAlgorithm(
        config: UnifiedRoutingConfig,
        errors: string[],
        warnings: string[]
    ): void {
        const { algorithm } = config;

        // Grid size validation
        if (algorithm.gridSize < 5) {
            errors.push('algorithm.gridSize must be >= 5 (too fine grid causes performance issues)');
        } else if (algorithm.gridSize > 50) {
            errors.push('algorithm.gridSize must be <= 50 (too coarse grid causes poor routing)');
        } else if (algorithm.gridSize < 10) {
            warnings.push('algorithm.gridSize < 10 may cause performance issues on large graphs');
        } else if (algorithm.gridSize > 25) {
            warnings.push('algorithm.gridSize > 25 may cause suboptimal routing');
        }

        // Visibility graph threshold
        if (algorithm.visibilityGraphThreshold < 0) {
            errors.push('algorithm.visibilityGraphThreshold must be >= 0');
        } else if (algorithm.visibilityGraphThreshold < 5 && algorithm.useVisibilityGraph) {
            warnings.push('algorithm.visibilityGraphThreshold < 5 may trigger VG too often, impacting performance');
        }
    }

    private static validateCosts(
        config: UnifiedRoutingConfig,
        errors: string[],
        warnings: string[]
    ): void {
        const { costs } = config;

        // Cost hierarchy validation
        if (costs.obstacle <= costs.lineCross) {
            warnings.push('costs.obstacle should be >> costs.lineCross to prevent routing through nodes');
        }

        if (costs.lineCross <= costs.lineOccupied) {
            warnings.push('costs.lineCross should be > costs.lineOccupied to penalize crossings more');
        }

        if (costs.bufferZoneClose <= costs.bufferZoneFar) {
            warnings.push('costs.bufferZoneClose should be > costs.bufferZoneFar for graduated buffer zones');
        }

        if (costs.normal <= 0) {
            errors.push('costs.normal must be > 0');
        }

        if (costs.mergePath >= costs.normal) {
            warnings.push('costs.mergePath should be < costs.normal to encourage path merging');
        }

        // Extreme values
        if (costs.directionChange > 1000) {
            warnings.push('costs.directionChange > 1000 may cause overly straight paths that avoid obstacles poorly');
        }
    }

    private static validateBus(
        config: UnifiedRoutingConfig,
        errors: string[],
        warnings: string[]
    ): void {
        const { bus } = config;

        // Spacing validation
        if (bus.spacing < 5) {
            warnings.push('bus.spacing < 5 may cause visual overlap between branches');
        } else if (bus.spacing > 50) {
            warnings.push('bus.spacing > 50 may cause excessive spreading');
        }

        if (bus.manyToOneSpacing < 1) {
            errors.push('bus.manyToOneSpacing must be >= 1');
        } else if (bus.manyToOneSpacing > bus.spacing) {
            warnings.push('bus.manyToOneSpacing > bus.spacing is unusual (typically should be smaller)');
        }

        // Trunk parameters
        if (bus.trunkBase < 20) {
            warnings.push('bus.trunkBase < 20 may cause very short trunk segments');
        }

        if (bus.trunkMultiplier < 1) {
            errors.push('bus.trunkMultiplier must be >= 1');
        } else if (bus.trunkMultiplier > 20) {
            warnings.push('bus.trunkMultiplier > 20 may cause excessively long trunk segments');
        }
    }

    private static validatePortSelection(
        config: UnifiedRoutingConfig,
        errors: string[],
        warnings: string[]
    ): void {
        const { portSelection } = config;

        // Threshold validation
        if (portSelection.lowConfidenceThreshold < 0 || portSelection.lowConfidenceThreshold > 1) {
            errors.push('portSelection.lowConfidenceThreshold must be between 0 and 1');
        }

        if (portSelection.highConfidenceThreshold < 0 || portSelection.highConfidenceThreshold > 1) {
            errors.push('portSelection.highConfidenceThreshold must be between 0 and 1');
        }

        if (portSelection.lowConfidenceThreshold >= portSelection.highConfidenceThreshold) {
            errors.push('portSelection.lowConfidenceThreshold must be < highConfidenceThreshold');
        }

        // Port usage weight
        if (portSelection.portUsageWeight < 0) {
            errors.push('portSelection.portUsageWeight must be >= 0');
        } else if (portSelection.portUsageWeight > 200) {
            warnings.push('portSelection.portUsageWeight > 200 may overly penalize port reuse');
        }

        // Port slide padding
        if (portSelection.portSlidePadding < 0) {
            errors.push('portSelection.portSlidePadding must be >= 0');
        } else if (portSelection.portSlidePadding > 30) {
            warnings.push('portSelection.portSlidePadding > 30 may cause excessive sliding');
        }
    }

    private static validatePostProcessing(
        config: UnifiedRoutingConfig,
        errors: string[],
        warnings: string[]
    ): void {
        const { postProcessing } = config;

        // Border radius
        if (postProcessing.borderRadius < 0) {
            errors.push('postProcessing.borderRadius must be >= 0');
        } else if (postProcessing.borderRadius > 50) {
            warnings.push('postProcessing.borderRadius > 50 may cause excessive rounding');
        }

        // Min first segment
        if (postProcessing.minFirstSegment < 0) {
            errors.push('postProcessing.minFirstSegment must be >= 0');
        } else if (postProcessing.minFirstSegment > 100) {
            warnings.push('postProcessing.minFirstSegment > 100 may cause unnecessarily long starting segments');
        }

        // Min last segment
        if (postProcessing.minLastSegment < 0) {
            errors.push('postProcessing.minLastSegment must be >= 0');
        } else if (postProcessing.minLastSegment > 100) {
            warnings.push('postProcessing.minLastSegment > 100 may cause unnecessarily long ending segments');
        }

        // [FIX] Cross-check: stub lengths should be >= borderRadius to prevent filleted corner truncation
        if (postProcessing.minFirstSegment > 0 && postProcessing.minFirstSegment < postProcessing.borderRadius) {
            warnings.push(`postProcessing.minFirstSegment (${postProcessing.minFirstSegment}) < borderRadius (${postProcessing.borderRadius}) may cause truncated corners at source port`);
        }
        if (postProcessing.minLastSegment > 0 && postProcessing.minLastSegment < postProcessing.borderRadius) {
            warnings.push(`postProcessing.minLastSegment (${postProcessing.minLastSegment}) < borderRadius (${postProcessing.borderRadius}) may cause truncated corners at target port`);
        }

        if (postProcessing.redundantBendThreshold < 0) {
            errors.push('postProcessing.redundantBendThreshold must be >= 0');
        } else if (postProcessing.redundantBendThreshold > 200) {
            warnings.push('postProcessing.redundantBendThreshold > 200 may reduce bend cleanup');
        }

        if (postProcessing.finalRedundantBendThreshold < 0) {
            errors.push('postProcessing.finalRedundantBendThreshold must be >= 0');
        } else if (postProcessing.finalRedundantBendThreshold > 100) {
            warnings.push('postProcessing.finalRedundantBendThreshold > 100 may reduce final cleanup');
        }

        if (postProcessing.nudgeSpacing < 0) {
            errors.push('postProcessing.nudgeSpacing must be >= 0');
        } else if (postProcessing.nudgeSpacing > 50) {
            warnings.push('postProcessing.nudgeSpacing > 50 may over-separate parallel paths');
        }

        if (postProcessing.nudgeSearchLimit < 0) {
            errors.push('postProcessing.nudgeSearchLimit must be >= 0');
        } else if (postProcessing.nudgeSearchLimit > 500) {
            warnings.push('postProcessing.nudgeSearchLimit > 500 may cause large nudges');
        }
    }

    private static validateOffsets(
        config: UnifiedRoutingConfig,
        errors: string[],
        warnings: string[]
    ): void {
        const { offsets } = config;

        if (offsets.source < 0) {
            errors.push('offsets.source must be >= 0');
        }

        if (offsets.target < 0) {
            errors.push('offsets.target must be >= 0');
        }

        if (offsets.source > 100 || offsets.target > 100) {
            warnings.push('offsets > 100 may cause excessive spacing from nodes');
        }
    }

    /**
     * Quick validation (errors only, no warnings)
     * 
     * @param config Configuration to validate
     * @returns True if valid (no errors)
     */
    static isValid(config: UnifiedRoutingConfig): boolean {
        const result = this.validate(config);
        return result.valid;
    }

    /**
     * Assert configuration is valid (throws if invalid)
     * 
     * @param config Configuration to validate
     * @throws Error if configuration is invalid
     */
    static assertValid(config: UnifiedRoutingConfig): void {
        const result = this.validate(config);
        if (!result.valid) {
            throw new Error(
                `Invalid routing configuration:\n${result.errors.join('\n')}`
            );
        }
    }
}
