// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../locales/en.json';

const harness = vi.hoisted(() => ({
    generateSpeakerNotes: vi.fn(),
    messageError: vi.fn(),
    messageSuccess: vi.fn(),
    findEle: vi.fn(() => ({ nodeType: 1 })),
    reshapeNode: vi.fn(),
    fireOperation: vi.fn(),
}));

vi.mock('../mindmapAIService', () => ({
    generateSpeakerNotes: harness.generateSpeakerNotes,
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: harness.messageError,
        success: harness.messageSuccess,
    },
}));

vi.mock('../mindElixirStore', async importOriginal => {
    const actual = await importOriginal<typeof import('../mindElixirStore')>();
    return {
        ...actual,
        getMindElixirInstance: () => ({
            findEle: harness.findEle,
            reshapeNode: harness.reshapeNode,
            bus: { fire: harness.fireOperation },
        }),
    };
});

import { setPresentationState } from '../mindElixirStore';
import { MindMapSpeakerNotes } from '../MindMapSpeakerNotes';

let testI18n: i18n;

beforeAll(async () => {
    testI18n = i18next.createInstance();
    await testI18n.use(initReactI18next).init({
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
        lng: 'en',
        resources: { en: { translation: en } },
    });
});

beforeEach(() => {
    harness.generateSpeakerNotes.mockReset();
    harness.messageError.mockReset();
    harness.messageSuccess.mockReset();
    harness.findEle.mockClear();
    harness.reshapeNode.mockReset();
    harness.fireOperation.mockReset();
});

afterEach(() => {
    setPresentationState(false, null);
    cleanup();
});

const renderForNode = (id: string, topic: string) => {
    setPresentationState(true, { id, topic, children: [] });
    render(
        <I18nextProvider i18n={testI18n}>
            <MindMapSpeakerNotes />
        </I18nextProvider>,
    );
};

describe('MindMapSpeakerNotes request lifecycle', () => {
    it('keeps the newest same-node regeneration result when an older request finishes later', async () => {
        let resolveOlder: ((value: { notes: string }) => void) | undefined;
        let resolveNewest: ((value: { notes: string }) => void) | undefined;
        harness.generateSpeakerNotes
            .mockResolvedValueOnce({ notes: 'Initial notes' })
            .mockImplementationOnce(() => new Promise(resolve => {
                resolveOlder = resolve;
            }))
            .mockImplementationOnce(() => new Promise(resolve => {
                resolveNewest = resolve;
            }));

        renderForNode('node-a', 'Topic A');
        expect(await screen.findByText('Initial notes')).toBeTruthy();

        const regenerate = screen.getByRole('button', { name: 'Regenerate notes' });
        fireEvent.click(regenerate);
        fireEvent.click(regenerate);
        await waitFor(() => expect(harness.generateSpeakerNotes).toHaveBeenCalledTimes(3));

        await act(async () => {
            resolveNewest?.({ notes: 'Newest notes' });
            await Promise.resolve();
        });
        expect(await screen.findByText('Newest notes')).toBeTruthy();

        await act(async () => {
            resolveOlder?.({ notes: 'Older notes' });
            await Promise.resolve();
        });
        expect(screen.queryByText('Older notes')).toBeNull();
        expect(screen.getByText('Newest notes')).toBeTruthy();
    });

    it('does not restore the previous node or show stale success after a save finishes', async () => {
        let resolveSave: (() => void) | undefined;
        harness.generateSpeakerNotes.mockImplementation(async (topic: string) => ({
            notes: `Notes for ${topic}`,
        }));
        harness.reshapeNode.mockImplementationOnce(() => new Promise<void>(resolve => {
            resolveSave = resolve;
        }));

        renderForNode('node-a', 'Topic A');
        expect(await screen.findByText('Notes for Topic A')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Save to node notes' }));
        act(() => {
            setPresentationState(true, { id: 'node-b', topic: 'Topic B', children: [] });
        });

        await act(async () => {
            resolveSave?.();
            await Promise.resolve();
        });

        expect(await screen.findByText('Notes for Topic B')).toBeTruthy();
        expect(screen.queryByText('Topic A')).toBeNull();
        expect(harness.messageSuccess).not.toHaveBeenCalled();
        expect(harness.fireOperation).toHaveBeenCalledTimes(1);
    });
});
