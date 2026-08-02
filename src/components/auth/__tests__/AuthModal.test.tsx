// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AUTH_MODAL_Z_INDEX, AuthModal } from '../AuthModal';

const signInWithEmailMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signUpMock = vi.fn();

vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
});

vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
    useAuth: () => ({
        signInWithEmail: signInWithEmailMock,
        signInWithPassword: signInWithPasswordMock,
        signUp: signUpMock,
    }),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('AuthModal', () => {
    it('portals outside the zoomed app layout and stays above application chrome', () => {
        const layout = document.createElement('div');
        layout.id = 'app-root-layout';
        document.body.appendChild(layout);

        render(<AuthModal open onCancel={vi.fn()} />);

        const dialog = screen.getByRole('dialog');
        const modalRoot = dialog.closest('.ant-modal-root');
        expect(document.body.contains(modalRoot)).toBe(true);
        expect(layout.querySelector('.ant-modal-root')).toBeNull();
        expect(AUTH_MODAL_Z_INDEX).toBeGreaterThan(1100);

        layout.remove();
    });

    it('provides visible labels and keyboard-operable account switching', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        expect(screen.getByLabelText('auth.modal.emailPlaceholder')).toBeTruthy();
        expect(screen.getByLabelText('auth.modal.password.placeholder')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'auth.modal.registerNow' }));

        await waitFor(() => {
            expect(screen.getByLabelText('auth.modal.register.confirmPlaceholder')).toBeTruthy();
        });
        expect(screen.getByRole('button', { name: 'auth.modal.backToLogin' })).toBeTruthy();
    });

    it('exposes a close action that calls the owner callback', () => {
        const onCancel = vi.fn();
        render(<AuthModal open onCancel={onCancel} />);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(onCancel).toHaveBeenCalledOnce();
    });
});
