import { describe, expect, it } from 'vitest';

import en from '../../../locales/en.json';
import zh from '../../../locales/zh.json';

describe('configuration action translations', () => {
    it('localizes the cancel action in every supported locale', () => {
        expect(zh.config.actions.cancel).toBe('取消');
        expect(en.config.actions.cancel).toBe('Cancel');
    });
});
