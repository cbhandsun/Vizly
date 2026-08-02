export type CollaboratorEmailFailureReason = 'required' | 'invalid' | 'too-long';

export type CollaboratorEmailParseResult =
    | { ok: true; email: string }
    | { ok: false; reason: CollaboratorEmailFailureReason };

const MAX_COLLABORATOR_EMAIL_LENGTH = 254;
const COLLABORATOR_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseCollaboratorEmail = (value: unknown): CollaboratorEmailParseResult => {
    if (typeof value !== 'string') return { ok: false, reason: 'required' };

    const normalized = value.trim().toLowerCase();
    if (!normalized) return { ok: false, reason: 'required' };
    if (normalized.length > MAX_COLLABORATOR_EMAIL_LENGTH) {
        return { ok: false, reason: 'too-long' };
    }
    if (!COLLABORATOR_EMAIL_PATTERN.test(normalized)) {
        return { ok: false, reason: 'invalid' };
    }

    return { ok: true, email: normalized };
};
