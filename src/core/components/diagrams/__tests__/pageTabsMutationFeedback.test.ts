import { describe, expect, it } from 'vitest';

import { getPageTabsMutationFailure } from '../pageTabsMutationFeedback';

describe('getPageTabsMutationFailure', () => {
    it('returns explicit localized boundaries for every fallible page mutation', () => {
        expect(getPageTabsMutationFailure('create')).toEqual({
            key: 'designer.pages.createFailed',
            defaultValue: '无法新建页面，请重试',
        });
        expect(getPageTabsMutationFailure('duplicate').key).toBe('designer.pages.duplicateFailed');
        expect(getPageTabsMutationFailure('move').key).toBe('designer.pages.moveFailed');
        expect(getPageTabsMutationFailure('delete').key).toBe('designer.pages.deleteFailed');
    });
});
