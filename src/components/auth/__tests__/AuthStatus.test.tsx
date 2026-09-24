// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'auth.login': '登录',
            'auth.accountMenu': '账户菜单',
        }[key] ?? key),
    }),
}));

const authState = vi.hoisted(() => ({
    user: null as { email: string } | null,
    signOut: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('@/context/useAuth', () => ({
    useAuth: () => authState,
}));

vi.mock('../SetPasswordModal', () => ({
    SetPasswordModal: () => null,
}));

import { AuthStatus, AuthStatusCompact } from '../AuthStatus';

describe('AuthStatusCompact', () => {
    beforeEach(() => {
        authState.user = null;
        authState.signOut.mockClear();
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
    });

    it('uses the commercial touch target when embedded in the mobile toolbar', () => {
        render(<AuthStatusCompact commercialTouchTarget />);

        const trigger = screen.getByRole('button', { name: '登录' });
        expect(trigger.style.width).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.minWidth).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.height).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    });

    it('uses a native account menu button with explicit popup state', async () => {
        authState.user = { email: 'member@example.com' };
        render(<AuthStatus commercialTouchTarget />);

        const trigger = screen.getByRole('button', { name: '账户菜单' });
        expect(trigger.tagName).toBe('BUTTON');
        expect(trigger.getAttribute('type')).toBe('button');
        expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.getAttribute('aria-controls')).toBeTruthy();
        expect(trigger.classList.contains('auth-account-menu-trigger--commercial')).toBe(true);

        fireEvent.keyDown(trigger, { key: 'ArrowDown' });

        await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
        expect(await screen.findByRole('menu', { name: '账户菜单' })).toBeTruthy();
        await waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('menuitem'));
        expect(document.activeElement?.getAttribute('aria-disabled')).not.toBe('true');
    });

    it('closes the account menu with Escape and restores trigger focus', async () => {
        authState.user = { email: 'member@example.com' };
        render(<AuthStatus />);

        const trigger = screen.getByRole('button', { name: '账户菜单' });
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        const menu = await screen.findByRole('menu', { name: '账户菜单' });

        fireEvent.keyDown(menu, { key: 'Escape' });

        await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
        await waitFor(() => expect(document.activeElement).toBe(trigger));
    });
});
