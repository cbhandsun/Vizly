import { describe, expect, it } from 'vitest';

import {
    AI_MODEL_ID_MAX_LENGTH,
    AI_MODEL_LABEL_MAX_LENGTH,
    validateAIConfigModelDraft,
} from '../aiConfigModelDraft';

const existingModels = [{
    id: 'existing/model',
    name: 'Existing model',
    group: 'Existing',
    enabled: true,
}];

describe('validateAIConfigModelDraft', () => {
    it.each([null, undefined, {}, { id: '' }, { id: '   ' }, { id: 42 }])(
        'rejects missing or non-text model ids: %j',
        value => {
            expect(validateAIConfigModelDraft(value, existingModels)).toEqual({
                ok: false,
                issue: 'missing-model-id',
            });
        },
    );

    it('trims input and supplies safe display defaults', () => {
        expect(validateAIConfigModelDraft({
            id: '  vendor/model-v1  ',
            name: '  ',
            group: '  ',
        }, existingModels)).toEqual({
            ok: true,
            model: {
                id: 'vendor/model-v1',
                name: 'vendor/model-v1',
                group: 'Custom',
                enabled: true,
                isCustom: true,
            },
        });
    });

    it.each(['model id', '<script>', 'model\nnext', '模型'])('rejects unsafe model ids: %s', id => {
        expect(validateAIConfigModelDraft({ id, name: '', group: '' }, existingModels)).toEqual({
            ok: false,
            issue: 'invalid-model-id',
        });
    });

    it('rejects a duplicate id after trimming', () => {
        expect(validateAIConfigModelDraft({ id: ' existing/model ', name: '', group: '' }, existingModels)).toEqual({
            ok: false,
            issue: 'duplicate-model-id',
        });
    });

    it('accepts the model id length boundary and rejects an oversized id', () => {
        const boundary = 'm'.repeat(AI_MODEL_ID_MAX_LENGTH);
        expect(validateAIConfigModelDraft({ id: boundary, name: '', group: '' }, [])).toMatchObject({ ok: true });
        expect(validateAIConfigModelDraft({ id: `${boundary}x`, name: '', group: '' }, [])).toEqual({
            ok: false,
            issue: 'model-id-too-long',
        });
    });

    it.each([
        ['name', 'model-name-too-long'],
        ['group', 'model-group-too-long'],
    ] as const)('rejects oversized %s text', (field, issue) => {
        expect(validateAIConfigModelDraft({
            id: 'model',
            name: field === 'name' ? '名'.repeat(AI_MODEL_LABEL_MAX_LENGTH + 1) : '',
            group: field === 'group' ? '组'.repeat(AI_MODEL_LABEL_MAX_LENGTH + 1) : '',
        }, [])).toEqual({ ok: false, issue });
    });

    it('preserves valid multilingual display text', () => {
        expect(validateAIConfigModelDraft({ id: 'qwen/model', name: '通义千问', group: '中文模型' }, [])).toMatchObject({
            ok: true,
            model: { name: '通义千问', group: '中文模型' },
        });
    });
});
