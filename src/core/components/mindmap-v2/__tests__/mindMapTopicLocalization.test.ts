import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import i18n from '@/i18n';

import {
    cleanAndValidateTree,
    cleanMindMapTopic,
    resolveMindMapUntitledTopic,
} from '../mindmapTreeSanitizer';

describe('mind map untitled-topic localization', () => {
    let originalLanguage: string;

    beforeAll(() => {
        originalLanguage = i18n.resolvedLanguage || i18n.language || 'en';
    });

    afterAll(async () => {
        await i18n.changeLanguage(originalLanguage);
    });

    it('uses the active locale for empty and invalid topics', async () => {
        await i18n.changeLanguage('en');
        expect(resolveMindMapUntitledTopic()).toBe('Untitled node');
        expect(cleanMindMapTopic(null)).toBe('Untitled node');

        await i18n.changeLanguage('zh');
        expect(resolveMindMapUntitledTopic()).toBe('未命名节点');
        expect(cleanMindMapTopic({})).toBe('未命名节点');
    });

    it('migrates the generated legacy placeholder without rewriting real topics', async () => {
        await i18n.changeLanguage('en');

        expect(cleanAndValidateTree({
            id: 'legacy',
            topic: '(无标题)',
            children: [],
        }).topic).toBe('Untitled node');

        expect(cleanAndValidateTree({
            id: 'authored',
            topic: '用户写的主题',
            children: [],
        }).topic).toBe('用户写的主题');
    });
});
