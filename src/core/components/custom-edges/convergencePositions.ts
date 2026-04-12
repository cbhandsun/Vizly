// src/components/custom-edges/convergencePositions.ts
import { Position } from '@xyflow/react';

/**
 * Returns the default source and target positions for a given layout direction.
 * This mirrors the logic used in the original AdvancedSmartEdge fallback.
 */
export function getConvergencePositions(layoutDirection: 'LR' | 'RL' | 'TB' | 'BT') {
    let sourcePos: Position;
    let targetPos: Position;
    switch (layoutDirection) {
        case 'LR':
            sourcePos = Position.Right;
            targetPos = Position.Left;
            break;
        case 'RL':
            sourcePos = Position.Left;
            targetPos = Position.Right;
            break;
        case 'TB':
            sourcePos = Position.Bottom;
            targetPos = Position.Top;
            break;
        case 'BT':
            sourcePos = Position.Top;
            targetPos = Position.Bottom;
            break;
        default:
            sourcePos = Position.Right;
            targetPos = Position.Left;
    }
    return { source: sourcePos, target: targetPos };
}
