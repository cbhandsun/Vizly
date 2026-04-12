/**
 * Shared types that mimic @xyflow/react but are safe for Workers
 * (No DOM/React dependencies)
 */

export enum Position {
    Left = 'left',
    Top = 'top',
    Right = 'right',
    Bottom = 'bottom',
}

// Re-export basic types if needed, or consumers can use type-only imports from loc
