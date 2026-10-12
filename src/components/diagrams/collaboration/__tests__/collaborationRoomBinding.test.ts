// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveCollaborationRoomBinding } from '../collaborationRoomBinding';
describe('collaboration room binds to the selected document', () => {
    it.each([null, undefined, 'vizly-room-diagram-a'])('accepts the canonical room or omission: %s', requested => {
        expect(resolveCollaborationRoomBinding('diagram-a', requested)).toEqual({ roomName: 'vizly-room-diagram-a', valid: true });
    });
    it.each(['vizly-room-diagram-b', '', ' vizly-room-diagram-a ', 'vizly-room-diagram-a?token=x', '../diagram-a', {}, 12])('rejects mismatched or malformed room %s', requested => {
        expect(resolveCollaborationRoomBinding('diagram-a', requested).valid).toBe(false);
    });
    it.each(['', 'a'.repeat(118), 'a/b', ' a ', null, {}, 'a\n'])('rejects invalid diagram identity %s', diagram => {
        expect(resolveCollaborationRoomBinding(diagram, null)).toEqual({ roomName: '', valid: false });
    });
    it('preserves the maximum identity without truncation or collisions', () => {
        const diagram = 'a'.repeat(117);
        const result = resolveCollaborationRoomBinding(diagram, null);
        expect(result.valid).toBe(true); expect(result.roomName.length).toBe(128);
        expect(resolveCollaborationRoomBinding(diagram + 'b', result.roomName).valid).toBe(false);
    });
});
