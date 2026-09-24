import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import zh from '../../locales/zh.json';

describe('storage configuration copy', () => {
    it('describes the complete scope of settings discarded when leaving', async () => {
        const translation = createInstance();
        await translation.init({
            lng: 'en',
            fallbackLng: 'en',
            resources: {
                en: { translation: en },
                zh: { translation: zh },
            },
        });

        expect(translation.t('storageConfig.leaveConfirm.content', { lng: 'en' })).toBe(
            'Leaving will discard all unsaved connection settings and access credentials.',
        );
        expect(translation.t('storageConfig.leaveConfirm.content', { lng: 'zh' })).toBe(
            '离开后，所有未保存的连接设置和访问凭据修改都将丢失。',
        );
    });
});
