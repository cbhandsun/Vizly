// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';
import {
    registerMindElixirInstance,
    unregisterMindElixirInstance,
} from '../mindElixirStore';
import {
    addHistoryRecord,
    clearHistory,
    getHistoryList,
    setCurrentDiagramId,
    setHistoryOpen,
} from '../mindmapHistoryStore';
import MindMapHistoryPanel from '../MindMapHistoryPanel';
import { getMindMapHistoryConfirmCancelId } from '../useMindMapHistoryConfirmationFocus';

const bridge = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
}));

vi.mock('../../../utils/antdStaticBridge', () => ({
    appMessage: bridge,
}));

let testI18n: i18n;

class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

beforeAll(async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
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
    setHistoryOpen(false);
    clearHistory();
    unregisterMindElixirInstance();
    cleanup();
});

describe('MindMapHistoryPanel commercial restore flow', () => {
    it('creates bounded DOM ids from untrusted confirmation keys', () => {
        expect(getMindMapHistoryConfirmCancelId('snapshot:<unsafe>'))
            .toBe('mindmap-history-confirm-cancel-snapshot--unsafe-');
        expect(getMindMapHistoryConfirmCancelId('')).toBe('mindmap-history-confirm-cancel-action');
        expect(getMindMapHistoryConfirmCancelId('x'.repeat(100))).toHaveLength(
            'mindmap-history-confirm-cancel-'.length + 64,
        );
    });

    it('portals above editor chrome and requires confirmation before restoring', async () => {
        await act(async () => {
            await testI18n.changeLanguage('en');
        });
        setCurrentDiagramId('history-panel-test');
        clearHistory();
        addHistoryRecord('Mind map loaded', {
            id: 'root',
            topic: 'Earlier',
            children: [],
        } as NodeObj);
        const snapshotTime = getHistoryList()[0]?.time;
        expect(snapshotTime).toBeTruthy();

        const refresh = vi.fn();
        const mind: MindElixirInstance = Object.assign(Object.create(null), {
            getData: vi.fn(() => ({
                nodeData: { id: 'root', topic: 'Current', children: [] } as NodeObj,
                direction: 2,
            })),
            refresh,
            toCenter: vi.fn(),
            bus: { fire: vi.fn() },
        });
        registerMindElixirInstance(mind);

        const host = document.createElement('div');
        document.body.appendChild(host);
        render(
            <I18nextProvider i18n={testI18n}>
                <MindMapHistoryPanel />
            </I18nextProvider>,
            { container: host },
        );

        act(() => setHistoryOpen(true));
        const panel = screen.getByRole('complementary', { name: 'Mind map version history' });
        expect(panel.parentElement).toBe(document.body);

        fireEvent.click(screen.getByRole('button', {
            name: `Restore the ${snapshotTime} version: Mind map loaded`,
        }));
        const restoreTrigger = screen.getByRole('button', {
            name: `Restore the ${snapshotTime} version: Mind map loaded`,
        });
        expect(refresh).not.toHaveBeenCalled();
        expect(await screen.findByText(
            'Your current canvas will be saved as a recovery snapshot before this version is applied.',
        )).toBeTruthy();
        expect(document.querySelector('.ant-popover-placement-bottomRight')).toBeTruthy();

        const cancel = document.getElementById(
            getMindMapHistoryConfirmCancelId(getHistoryList()[0]?.id ?? ''),
        );
        expect(cancel).toBeInstanceOf(HTMLButtonElement);
        await waitFor(() => expect(document.activeElement).toBe(cancel));
        fireEvent.click(cancel as HTMLButtonElement);
        await waitFor(() => expect(document.activeElement).toBe(restoreTrigger));

        fireEvent.click(restoreTrigger);

        fireEvent.click(screen.getByRole('button', { name: 'Restore version' }));
        await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
        expect(getHistoryList().some(record => (
            record.description === 'Recovery snapshot before version restore'
        ))).toBe(true);

        const clearTrigger = screen.getByRole('button', { name: 'Clear version history' });
        fireEvent.click(clearTrigger);
        const clearCancel = document.getElementById(getMindMapHistoryConfirmCancelId('clear'));
        expect(clearCancel).toBeInstanceOf(HTMLButtonElement);
        await waitFor(() => expect(document.activeElement).toBe(clearCancel));
        fireEvent.click(clearCancel as HTMLButtonElement);
        await waitFor(() => expect(document.activeElement).toBe(clearTrigger));
        expect(getHistoryList().length).toBeGreaterThan(0);
    });
});
