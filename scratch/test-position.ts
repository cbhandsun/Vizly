export const Position = {
    Left: 'left',
    Right: 'right',
    Top: 'top',
    Bottom: 'bottom'
} as const;

export type Position = typeof Position[keyof typeof Position];
