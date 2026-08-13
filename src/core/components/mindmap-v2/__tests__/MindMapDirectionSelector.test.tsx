// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import zh from '../../../../locales/zh.json';
import { MindMapDirectionSelector } from '../MindMapDirectionSelector';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
});

let testI18n: i18n;

beforeAll(async () => {
    testI18n = i18next.createInstance();
    await testI18n.use(initReactI18next).init({
        lng: 'zh',
        resources: { zh: { translation: zh } },
    });
});

const renderLocalized = (ui: React.ReactElement) => render(
    <I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>,
);

const DirectionSelectorHarness = () => {
    const [open, setOpen] = useState(false);
    return (
        <MindMapDirectionSelector
            currentDirection="LR"
            open={open}
            onChange={vi.fn()}
            onOpenChange={setOpen}
        />
    );
};

describe('MindMapDirectionSelector', () => {
    it('includes the current direction in the combobox name', () => {
        renderLocalized(
            <MindMapDirectionSelector
                currentDirection="L"
                open={false}
                onChange={vi.fn()}
                onOpenChange={vi.fn()}
            />,
        );

        expect(screen.getByRole('combobox', { name: '思维导图布局方向：向左展开' })).toBeTruthy();
    });

    it('opens from the keyboard and exposes user-facing option names', async () => {
        renderLocalized(<DirectionSelectorHarness />);
        const combo = screen.getByRole('combobox', { name: '思维导图布局方向：双向展开' });

        fireEvent.keyDown(combo, { key: 'Enter', keyCode: 13 });

        expect((await screen.findByRole('option', { name: '双向展开' })).getAttribute('aria-selected')).toBe('true');
        expect(screen.getByRole('option', { name: '向右展开' })).toBeTruthy();
        expect(screen.getByRole('option', { name: '向左展开' })).toBeTruthy();
        expect(screen.queryByRole('option', { name: 'LR' })).toBeNull();
    });
});
