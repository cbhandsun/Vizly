import type { AIModel } from './aiConfigStorage';

export const AI_MODEL_ID_MAX_LENGTH = 160;
export const AI_MODEL_LABEL_MAX_LENGTH = 160;

const SAFE_MODEL_ID = /^[\w:./@-]+$/u;

export interface AIConfigModelDraft {
    id: string;
    name: string;
    group: string;
}

export type AIConfigModelDraftIssue =
    | 'missing-model-id'
    | 'invalid-model-id'
    | 'duplicate-model-id'
    | 'model-id-too-long'
    | 'model-name-too-long'
    | 'model-group-too-long';

export type AIConfigModelDraftValidation =
    | { ok: true; model: AIModel }
    | { ok: false; issue: AIConfigModelDraftIssue };

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const readTrimmedText = (record: Record<string, unknown>, key: string): string => (
    typeof record[key] === 'string' ? record[key].trim() : ''
);

export const validateAIConfigModelDraft = (
    value: unknown,
    existingModels: readonly AIModel[],
): AIConfigModelDraftValidation => {
    if (!isRecord(value)) return { ok: false, issue: 'missing-model-id' };

    const id = readTrimmedText(value, 'id');
    const name = readTrimmedText(value, 'name');
    const group = readTrimmedText(value, 'group');

    if (!id) return { ok: false, issue: 'missing-model-id' };
    if (id.length > AI_MODEL_ID_MAX_LENGTH) return { ok: false, issue: 'model-id-too-long' };
    if (!SAFE_MODEL_ID.test(id)) return { ok: false, issue: 'invalid-model-id' };
    if (existingModels.some(model => model.id === id)) return { ok: false, issue: 'duplicate-model-id' };
    if (name.length > AI_MODEL_LABEL_MAX_LENGTH) return { ok: false, issue: 'model-name-too-long' };
    if (group.length > AI_MODEL_LABEL_MAX_LENGTH) return { ok: false, issue: 'model-group-too-long' };

    return {
        ok: true,
        model: {
            id,
            name: name || id,
            group: group || 'Custom',
            enabled: true,
            isCustom: true,
        },
    };
};
