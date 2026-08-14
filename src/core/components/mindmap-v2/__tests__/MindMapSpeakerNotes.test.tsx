// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import { configureMindMapAIRuntime } from '../../../ports/mindMapAIRuntime';
import { setPresentationState } from '../mindElixirStore';
import { MindMapSpeakerNotes } from '../MindMapSpeakerNotes';

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

afterEach(() => {
    setPresentationState(false, null);
    cleanup();
});

const renderSpeakerNotes = async (language: 'en' | 'zh' = 'en') => {
    await act(async () => {
        await testI18n.changeLanguage(language);
    });
    setPresentationState(true, {
        id: 'root',
        topic: 'Launch plan',
        children: [],
    });
    render(
        <I18nextProvider i18n={testI18n}>
            <MindMapSpeakerNotes />
        </I18nextProvider>,
    );
};

describe('MindMapSpeakerNotes commercial presentation fallback', () => {
    it('turns missing AI configuration into a compact optional fallback that can be dismissed', async () => {
        configureMindMapAIRuntime({
            loadConfig: async () => ({ activeModelKey: '', providers: [] }),
            requestChatCompletionJson: async () => ({ choices: [] }),
            formatRequestError: async () => 'Request failed',
        });

        await renderSpeakerNotes('en');

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('AI speaker notes are not configured');
        expect(alert.textContent).not.toContain('Provider');
        expect(alert.textContent).toContain('Presentation navigation remains available');
        expect(screen.getByTestId('mindmap-speaker-notes-compact')).toBeTruthy();
        expect(screen.getByTestId('mindmap-speaker-notes-compact').style.width)
            .toBe('calc(100vw - 24px)');
        expect(screen.getByTestId('mindmap-speaker-notes-compact').style.maxWidth).toBe('340px');
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();

        fireEvent.click(screen.getByRole('button', {
            name: 'Dismiss speaker notes for this presentation',
        }));
        await waitFor(() => {
            expect(screen.queryByLabelText('AI speaker notes')).toBeNull();
        });
    });

    it('localizes the optional loading state without emoji-only labels', async () => {
        configureMindMapAIRuntime({
            loadConfig: () => new Promise(() => undefined),
            requestChatCompletionJson: async () => ({ choices: [] }),
            formatRequestError: async () => '请求失败',
        });

        await renderSpeakerNotes('zh');

        expect(screen.getByRole('status').textContent).toContain('正在准备可选的 AI 演讲提词');
        expect(screen.getByRole('button', { name: '关闭本次演示的提词器' })).toBeTruthy();
        expect(screen.queryByText('💼 专业商务')).toBeNull();
    });
});
