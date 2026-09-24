import { describe, expect, it } from 'vitest';
import { parseCollaboratorEmail } from '../shareInvitationBoundary';

describe('parseCollaboratorEmail', () => {
    it('normalizes a valid collaborator email', () => {
        expect(parseCollaboratorEmail('  Teammate@Example.COM  ')).toEqual({
            ok: true,
            email: 'teammate@example.com',
        });
    });

    it.each([
        [undefined, 'required'],
        [null, 'required'],
        ['', 'required'],
        ['   ', 'required'],
        ['not-an-email', 'invalid'],
        ['person@example', 'invalid'],
        ['person\n@example.com', 'invalid'],
        [`${'a'.repeat(245)}@example.com`, 'too-long'],
    ])('rejects unsafe or invalid input %j', (value, reason) => {
        expect(parseCollaboratorEmail(value)).toEqual({ ok: false, reason });
    });
});
