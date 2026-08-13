// @vitest-environment jsdom

import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next, { type i18n } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import zh from '../../../../locales/zh.json';
import { MindMapThemeSelector } from '../MindMapThemeSelector';

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

const ThemeSelectorHarness = ({ onThemeChange = vi.fn() }: { onThemeChange?: (themeKey: string) => void }) => {
    const [open, setOpen] = useState(false);
    return (
        <MindMapThemeSelector
            activeThemeKey="ocean"
            open={open}
            onOpenChange={setOpen}
            onThemeChange={onThemeChange}
        />
    );
};

describe('MindMapThemeSelector', () => {
    it('opens from the keyboard and exposes the selected theme as a radio menu item', async () => {
        renderLocalized(<ThemeSelectorHarness />);

        const trigger = screen.getByRole('button', { name: '切换主题，当前主题：海洋' });
        fireEvent.keyDown(trigger, { key: 'Enter' });

        const selectedTheme = await screen.findByRole('menuitemradio', { name: '海洋' });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('menu', { name: '选择思维导图主题' }).id);
        expect(selectedTheme.getAttribute('aria-checked')).toBe('true');
        await waitFor(() => expect(document.activeElement).toBe(selectedTheme));
    });

    it('supports roving focus, applies a theme, and restores trigger focus', async () => {
        const onThemeChange = vi.fn();
        renderLocalized(<ThemeSelectorHarness onThemeChange={onThemeChange} />);
        const trigger = screen.getByRole('button', { name: '切换主题，当前主题：海洋' });

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const ocean = await screen.findByRole('menuitemradio', { name: '海洋' });
        await waitFor(() => expect(document.activeElement).toBe(ocean));
        fireEvent.keyDown(ocean, { key: 'ArrowDown' });
        const emerald = screen.getByRole('menuitemradio', { name: '翡翠 Vizly Emerald' });
        expect(document.activeElement).toBe(emerald);
        fireEvent.click(emerald);

        expect(onThemeChange).toHaveBeenCalledWith('emerald');
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('closes on Escape without changing the theme', async () => {
        const onThemeChange = vi.fn();
        renderLocalized(<ThemeSelectorHarness onThemeChange={onThemeChange} />);
        const trigger = screen.getByRole('button', { name: '切换主题，当前主题：海洋' });

        fireEvent.keyDown(trigger, { key: ' ' });
        const ocean = await screen.findByRole('menuitemradio', { name: '海洋' });
        fireEvent.keyDown(ocean, { key: 'Escape' });

        expect(onThemeChange).not.toHaveBeenCalled();
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
});
