export type TimelineTaskKind = 'event' | 'milestone' | 'phase' | 'summary';

export const coerceTimelineTaskKind = (value: unknown): TimelineTaskKind => (
    value === 'event' || value === 'milestone' || value === 'phase' || value === 'summary'
        ? value
        : 'phase'
);

export const isTimelinePointTaskType = (value: unknown): value is 'event' | 'milestone' => (
    value === 'event' || value === 'milestone'
);

export const timelineTaskSupportsProgress = (value: unknown): value is 'phase' => (
    value === 'phase'
);

export const timelineTaskCanContainChildren = (value: unknown): boolean => (
    value === 'phase' || value === 'summary'
);
