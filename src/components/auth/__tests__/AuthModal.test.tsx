// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_MODAL_Z_INDEX, AuthModal } from '../AuthModal';

const {
    signInWithEmailMock,
    signInWithPasswordMock,
    signUpMock,
    messageErrorMock,
    messageSuccessMock,
} = vi.hoisted(() => ({
    signInWithEmailMock: vi.fn(),
    signInWithPasswordMock: vi.fn(),
    signUpMock: vi.fn(),
    messageErrorMock: vi.fn(),
    messageSuccessMock: vi.fn(),
}));

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

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: messageErrorMock,
        success: messageSuccessMock,
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe('AuthModal', () => {
    it('exposes a stable accessible name for the authentication dialog', () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        expect(screen.getByRole('dialog', { name: 'auth.login' })).toBeTruthy();
    });

    it('focuses the email field when the authentication task opens', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        await waitFor(() => {
            expect(document.activeElement).toBe(
                within(screen.getByRole('tabpanel')).getByLabelText('auth.modal.emailPlaceholder'),
            );
        });
    });

    beforeEach(() => {
        signInWithEmailMock.mockReset();
        signInWithPasswordMock.mockReset();
        signUpMock.mockReset();
        messageErrorMock.mockReset();
        messageSuccessMock.mockReset();
    });

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

    it('focuses the first invalid field after each authentication form fails validation', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /auth\.modal\.loginButton$/ }));
        await waitFor(() => {
            expect(document.activeElement).toBe(
                within(screen.getByRole('tabpanel')).getByLabelText('auth.modal.emailPlaceholder'),
            );
        });

        fireEvent.click(screen.getByRole('tab', { name: 'auth.modal.tabs.magiclink' }));
        fireEvent.click(screen.getByRole('button', { name: /auth\.modal\.sendMagicLink$/ }));
        await waitFor(() => {
            expect(document.activeElement).toBe(
                within(screen.getByRole('tabpanel')).getByLabelText('auth.modal.emailPlaceholder'),
            );
        });

        fireEvent.click(screen.getByRole('tab', { name: 'auth.modal.tabs.register' }));
        fireEvent.click(screen.getByRole('button', { name: 'auth.modal.register.button' }));
        await waitFor(() => {
            expect(document.activeElement).toBe(
                within(screen.getByRole('tabpanel')).getByLabelText('auth.modal.emailPlaceholder'),
            );
        });
    });

    it('clears stale validation when switching methods without discarding entered values', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        const email = within(screen.getByRole('tabpanel')).getByLabelText('auth.modal.emailPlaceholder');
        fireEvent.change(email, { target: { value: 'member@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /auth\.modal\.loginButton$/ }));

        await waitFor(() => {
            expect(screen.getByText('auth.modal.password.required')).toBeTruthy();
        });
        fireEvent.click(screen.getByRole('tab', { name: 'auth.modal.tabs.register' }));
        fireEvent.click(screen.getByRole('tab', { name: 'auth.modal.tabs.password' }));

        const activePanel = within(screen.getByRole('tabpanel'));
        const password = activePanel.getByLabelText('auth.modal.password.placeholder');
        expect(password.getAttribute('aria-invalid')).not.toBe('true');
        expect(password.getAttribute('aria-describedby')).toBeNull();
        expect((activePanel.getByLabelText(
            'auth.modal.emailPlaceholder',
        ) as HTMLInputElement).value).toBe('member@example.com');
    });

    it('exposes a close action that calls the owner callback', () => {
        const onCancel = vi.fn();
        render(<AuthModal open onCancel={onCancel} />);

        fireEvent.click(screen.getByRole('button', { name: 'common.close' }));

        expect(onCancel).toHaveBeenCalledOnce();
    });

    it('recovers from provider rejection and keeps unknown details out of the UI', async () => {
        signInWithPasswordMock.mockRejectedValueOnce(new Error('Bearer secret-token user-content'));
        render(<AuthModal open onCancel={vi.fn()} />);

        fireEvent.change(screen.getByLabelText('auth.modal.emailPlaceholder'), {
            target: { value: 'member@example.com' },
        });
        fireEvent.change(screen.getByLabelText('auth.modal.password.placeholder'), {
            target: { value: 'safe-password' },
        });
        fireEvent.click(screen.getByRole('button', { name: /auth\.modal\.loginButton$/ }));

        expect(await screen.findByText('auth.modal.errors.unavailable')).toBeTruthy();
        expect((screen.getByRole('button', {
            name: /auth\.modal\.loginButton$/,
        }) as HTMLButtonElement).disabled).toBe(false);
        expect(messageErrorMock).toHaveBeenCalledWith('auth.modal.errors.unavailable');
        expect(screen.queryByText(/secret-token/i)).toBeNull();
    }, 15_000);

    it('blocks duplicate submission and ignores success after external closure', async () => {
        let resolveRequest: ((value: { error: null }) => void) | undefined;
        signInWithPasswordMock.mockReturnValueOnce(new Promise((resolve) => {
            resolveRequest = resolve;
        }));
        const onCancel = vi.fn();
        const view = render(<AuthModal open onCancel={onCancel} />);

        fireEvent.change(screen.getByLabelText('auth.modal.emailPlaceholder'), {
            target: { value: 'member@example.com' },
        });
        fireEvent.change(screen.getByLabelText('auth.modal.password.placeholder'), {
            target: { value: 'safe-password' },
        });
        const submit = screen.getByRole('button', { name: /auth\.modal\.loginButton$/ });
        fireEvent.click(submit);
        fireEvent.click(submit);

        await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalledOnce());
        expect(screen.queryByRole('button', { name: 'common.close' })).toBeNull();

        view.rerender(<AuthModal open={false} onCancel={onCancel} />);
        await act(async () => {
            resolveRequest?.({ error: null });
            await Promise.resolve();
        });

        expect(messageSuccessMock).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
    }, 15_000);
});
