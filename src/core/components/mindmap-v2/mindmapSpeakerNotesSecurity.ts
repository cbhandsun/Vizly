import {
    cleanMindMapNote,
    cleanMindMapTopic,
} from './mindmapTreeSanitizer';

export const MAX_SPEAKER_CONTEXT_LENGTH = 1200;
export const SPEAKER_TONES = ['专业商务', '幽默风趣', '通俗易懂', '严谨理性'] as const;

export type SpeakerTone = typeof SPEAKER_TONES[number];

const TONES = new Set<string>(SPEAKER_TONES);

export function cleanSpeakerTone(value: unknown): SpeakerTone {
    return typeof value === 'string' && TONES.has(value)
        ? value as SpeakerTone
        : '专业商务';
}

export function cleanSpeakerTopic(value: unknown): string {
    return cleanMindMapTopic(value, '当前主题');
}

export function cleanSpeakerContext(value: unknown): string | undefined {
    return cleanMindMapNote(value)?.slice(0, MAX_SPEAKER_CONTEXT_LENGTH);
}

export function cleanSpeakerNotes(value: unknown): string {
    return cleanMindMapNote(value) ?? '';
}

export function mergeSpeakerNotesIntoNodeNote(currentNote: unknown, notes: unknown): string {
    const safeNotes = cleanSpeakerNotes(notes).trim();
    if (!safeNotes) return cleanMindMapNote(currentNote) ?? '';

    const safeCurrent = cleanMindMapNote(currentNote)?.trim();
    const merged = safeCurrent
        ? `${safeCurrent}\n\n---\n演讲提词：\n${safeNotes}`
        : safeNotes;

    return cleanMindMapNote(merged) ?? '';
}
