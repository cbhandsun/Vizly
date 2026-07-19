import { Position } from '../types/flow';
import type { EdgeConstraint, PortSelectionConfig } from '../types/routing';
import type { LineObstacle, Rectangle } from './pathfinding';
import { SpatialIndex } from './SpatialIndex';
import { evaluatePortCombination } from './costAwarePortEvaluation';
import {
    normalizeDynamicObstacles,
    normalizeEdgeConstraint,
    normalizeLineObstacles,
    normalizeNodeRect,
    normalizeObstacles,
    normalizePortSelectionConfig
} from './costAwarePortInput';
import type { NodeRect, PortCandidate } from './costAwarePortTypes';

export type { NodeRect, PortCandidate } from './costAwarePortTypes';

const DEFAULT_CONFIG: Required<Omit<PortSelectionConfig, 'portUsage' | 'sourceId' | 'targetId' | 'globalChannelIndex' | 'globalChannelCount' | 'globalChannelType' | 'portUsageData' | 'preferredSourcePort' | 'preferredTargetPort'>> & { portUsage: Record<string, number>, sourceId: string, targetId: string } = {
    bendPenalty: 50,
    obstaclePenalty: 100,
    crossingPenalty: 1200,
    layoutDirection: 'TB',

    // Default values for standard config
    bonusCostThreshold: -100,
    lowConfidenceThreshold: 0.2,
    highConfidenceThreshold: 0.8,
    preferGeometryOverBus: true,
    enableObstacleAwareness: true,
    portUsageWeight: 50,

    portUsage: {},
    sourceId: '',
    targetId: '',
    returnAllCandidates: false,
    enableDynamicPorts: true,
    portSlidePadding: 12
};

/**
 * Get the connection point on a node's edge based on position
 */
export function selectOptimalPorts(
    sourceNode: NodeRect,
    targetNode: NodeRect,
    obstacles: Rectangle[] | SpatialIndex,
    lineObstacles: LineObstacle[] = [],
    inputConfig: Partial<PortSelectionConfig> = {},
    dynamicObstacles: Rectangle[] = [], // [NEW]
    constraints?: EdgeConstraint
): { sourcePos: Position; targetPos: Position; confidence: number; estimatedCost: number; allCandidates?: PortCandidate[]; debugInfo?: unknown } {
    const safeSourceNode = normalizeNodeRect(sourceNode);
    const safeTargetNode = normalizeNodeRect(targetNode);
    const safeObstacles = normalizeObstacles(obstacles);
    const safeLineObstacles = normalizeLineObstacles(lineObstacles);
    const safeDynamicObstacles = normalizeDynamicObstacles(dynamicObstacles);
    const mergedConfig = normalizePortSelectionConfig(inputConfig, DEFAULT_CONFIG as PortSelectionConfig);
    const safeConstraints = normalizeEdgeConstraint(constraints);

    if (safeConstraints) {
        if (safeConstraints.routingType === 'orthogonal') {
            mergedConfig.bendPenalty = (mergedConfig.bendPenalty || 50) * 2; // Penalize bends heavily
        } else if (safeConstraints.routingType === 'direct') {
            mergedConfig.bendPenalty = 0; // No penalty for bends
        }

        if (safeConstraints.priority < 0) {
            // Background edges: looser obstacle avoidance
            mergedConfig.obstaclePenalty = (mergedConfig.obstaclePenalty || 100) * 0.5;
        }
    }
    const positions = [Position.Top, Position.Bottom, Position.Left, Position.Right];
    const candidates: PortCandidate[] = [];

    // [S5-P9] Constrained port optimization: if one side is fixed by the bus trunk axis,
    // only evaluate combinations where that side matches the fixed position.
    // This reduces 16 combinations to 4, ensuring hub-side ports are never overridden
    // by cost optimization while still applying crossing/obstacle avoidance to the peer side.
    const constrainedSrc = mergedConfig.constrainedSourcePos;
    const constrainedTgt = mergedConfig.constrainedTargetPos;
    const sourceCandidates = constrainedSrc ? [constrainedSrc] : positions;
    const targetCandidates = constrainedTgt ? [constrainedTgt] : positions;

    // Evaluate all valid combinations (4–16 depending on constraints)
    for (const sourcePos of sourceCandidates) {
        for (const targetPos of targetCandidates) {
            const candidate = evaluatePortCombination(
                safeSourceNode,
                safeTargetNode,
                sourcePos,
                targetPos,
                safeObstacles,
                safeLineObstacles,
                mergedConfig,
                safeDynamicObstacles
            );
            candidates.push(candidate);
        }
    }


    // Sort by cost (lowest first)
    candidates.sort((a, b) => a.estimatedCost - b.estimatedCost);

    // Best candidate
    const best = candidates[0];
    const secondBest = candidates[1];

    // Confidence: how much better is best compared to second best
    // Higher ratio = more confident in choice
    const confidence = secondBest
        ? Math.min(1, (secondBest.estimatedCost - best.estimatedCost) / (Math.abs(best.estimatedCost) + 1))
        : 1;




    return {
        sourcePos: best.sourcePos,
        targetPos: best.targetPos,
        confidence,
        estimatedCost: best.estimatedCost,
        allCandidates: mergedConfig.returnAllCandidates ? candidates : undefined,
        debugInfo: best.debugInfo
    };
}

/**
 * Quick port selection using geometric heuristics only
 * (No obstacle checking - faster for initial layout)
 */
export function selectQuickPorts(
    sourceNode: NodeRect,
    targetNode: NodeRect
): { sourcePos: Position; targetPos: Position } {
    const safeSourceNode = normalizeNodeRect(sourceNode);
    const safeTargetNode = normalizeNodeRect(targetNode);
    const dx = (safeTargetNode.x + safeTargetNode.width / 2) - (safeSourceNode.x + safeSourceNode.width / 2);
    const dy = (safeTargetNode.y + safeTargetNode.height / 2) - (safeSourceNode.y + safeSourceNode.height / 2);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Dominant axis determines primary port selection
    if (absDx > absDy * 1.5) {
        // Horizontal dominant
        if (dx > 0) {
            return { sourcePos: Position.Right, targetPos: Position.Left };
        } else {
            return { sourcePos: Position.Left, targetPos: Position.Right };
        }
    } else if (absDy > absDx * 1.5) {
        // Vertical dominant
        if (dy > 0) {
            return { sourcePos: Position.Bottom, targetPos: Position.Top };
        } else {
            return { sourcePos: Position.Top, targetPos: Position.Bottom };
        }
    } else {
        // Roughly diagonal - use L-shape
        if (dx > 0 && dy > 0) {
            return { sourcePos: Position.Bottom, targetPos: Position.Left };
        } else if (dx > 0 && dy < 0) {
            return { sourcePos: Position.Top, targetPos: Position.Left };
        } else if (dx < 0 && dy > 0) {
            return { sourcePos: Position.Bottom, targetPos: Position.Right };
        } else {
            return { sourcePos: Position.Top, targetPos: Position.Right };
        }
    }
}

export default selectOptimalPorts;
