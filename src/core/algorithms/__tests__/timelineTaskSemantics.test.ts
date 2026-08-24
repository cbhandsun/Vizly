import { describe, expect, it } from 'vitest';

import {
    coerceTimelineTaskKind,
    isTimelinePointTaskType,
    timelineTaskCanContainChildren,
    timelineTaskSupportsProgress,
} from '../timelineTaskSemantics';

describe('timeline task semantics', () => {
    it.each(['event', 'milestone'] as const)('treats %s as an atomic point', (type) => {
        expect(isTimelinePointTaskType(type)).toBe(true);
        expect(timelineTaskSupportsProgress(type)).toBe(false);
        expect(timelineTaskCanContainChildren(type)).toBe(false);
    });

    it('keeps phases ranged, progress-bearing, and eligible to contain children', () => {
        expect(isTimelinePointTaskType('phase')).toBe(false);
        expect(timelineTaskSupportsProgress('phase')).toBe(true);
        expect(timelineTaskCanContainChildren('phase')).toBe(true);
        expect(timelineTaskCanContainChildren('summary')).toBe(true);
    });

    it.each([null, '', 'task', 42, { type: 'phase' }])('rejects unknown boundary value %j', (value) => {
        expect(coerceTimelineTaskKind(value)).toBe('phase');
        expect(isTimelinePointTaskType(value)).toBe(false);
        expect(timelineTaskSupportsProgress(value)).toBe(false);
        expect(timelineTaskCanContainChildren(value)).toBe(false);
    });

    it.each(['event', 'milestone', 'phase', 'summary'] as const)('preserves known type %s', (type) => {
        expect(coerceTimelineTaskKind(type)).toBe(type);
    });
});
