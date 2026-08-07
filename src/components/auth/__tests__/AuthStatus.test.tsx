// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'auth.login': '登录',
        }[key] ?? key),
    }),
}));

vi.mock('@/context/useAuth', () => ({
    useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock('../SetPasswordModal', () => ({
    SetPasswordModal: () => null,
}));

import { AuthStatusCompact } from '../AuthStatus';

describe('AuthStatusCompact', () => {
    beforeEach(() => {
        vi.stubGlobal('ResizeObserver', class {
            observe() {}
            unobserve() {}
            disconnect() {}
        });
    });

    it('uses the commercial touch target when embedded in the mobile toolbar', () => {
        render(<AuthStatusCompact commercialTouchTarget />);

        const trigger = screen.getByRole('button', { name: '登录' });
        expect(trigger.style.width).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.minWidth).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.height).toBe('var(--commercial-touch-target, 44px)');
        expect(trigger.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
    });
});
