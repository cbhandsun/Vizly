// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import { MindMapFileDropOverlay } from '../MindMapFileDropOverlay';

let testI18n: i18n;

beforeAll(async () => {
    testI18n = i18next.createInstance();
    await testI18n.use(initReactI18next).init({
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        lng: 'en',
        resources: {
            en: { translation: en },
            zh: { translation: zh },
        },
    });
});

afterEach(cleanup);

const renderOverlay = async (language: 'en' | 'zh', visible = true) => {
    await act(async () => {
        await testI18n.changeLanguage(language);
    });
    return render(
        <I18nextProvider i18n={testI18n}>
            <MindMapFileDropOverlay visible={visible} />
        </I18nextProvider>,
    );
};

describe('MindMapFileDropOverlay', () => {
    it('announces a supported file drop in English without emoji copy', async () => {
        const { container } = await renderOverlay('en');

        expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
        expect(screen.getByText('Drop to import your mind map')).toBeTruthy();
        expect(screen.getByText(/Supports Markdown and OPML/)).toBeTruthy();
        expect(container.textContent).not.toContain('📥');
    });

    it('switches the full affordance copy to Chinese', async () => {
        await renderOverlay('zh');

        expect(screen.getByText('松开以导入思维导图')).toBeTruthy();
        expect(screen.getByText(/支持 Markdown 和 OPML/)).toBeTruthy();
    });

    it('does not leave an inactive status region in the accessibility tree', async () => {
        await renderOverlay('en', false);

        expect(screen.queryByRole('status')).toBeNull();
    });
});
