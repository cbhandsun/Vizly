// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_PASSWORD_MAX_LENGTH } from '../useAuthOperation';
import { SetPasswordModal } from '../SetPasswordModal';

const {
    updatePasswordMock,
    messageErrorMock,
    messageSuccessMock,
} = vi.hoisted(() => ({
    updatePasswordMock: vi.fn(),
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
    useAuth: () => ({ updatePassword: updatePasswordMock }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: messageErrorMock,
        success: messageSuccessMock,
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

describe('SetPasswordModal', () => {
    beforeEach(() => {
        updatePasswordMock.mockReset();
        messageErrorMock.mockReset();
        messageSuccessMock.mockReset();
        document.body.innerHTML = '<div id="app-root-layout"></div>';
    });

    const fillPasswordFields = (password = 'secure-password') => {
        fireEvent.change(screen.getByLabelText('auth.modal.register.passwordPlaceholder'), {
            target: { value: password },
        });
        fireEvent.change(screen.getByLabelText('auth.modal.register.confirmPlaceholder'), {
            target: { value: password },
        });
    };

    it('uses bounded new-password fields and rejects mismatched confirmation locally', async () => {
        render(<SetPasswordModal open onCancel={vi.fn()} />);

        const password = screen.getByLabelText('auth.modal.register.passwordPlaceholder');
        const confirmation = screen.getByLabelText('auth.modal.register.confirmPlaceholder');
        expect(password.getAttribute('autocomplete')).toBe('new-password');
        expect(confirmation.getAttribute('autocomplete')).toBe('new-password');
        expect(password.getAttribute('maxlength')).toBe(String(AUTH_PASSWORD_MAX_LENGTH));

        fireEvent.change(password, { target: { value: 'secure-password' } });
        fireEvent.change(confirmation, { target: { value: 'different-password' } });
        fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));

        expect(await screen.findByText('auth.modal.register.passwordMismatch')).toBeTruthy();
        expect(updatePasswordMock).not.toHaveBeenCalled();
    });

    it('recovers from a rejected provider request without exposing its contents', async () => {
        updatePasswordMock.mockRejectedValueOnce(new Error('Bearer secret-token user-content'));
        render(<SetPasswordModal open onCancel={vi.fn()} />);
        fillPasswordFields();

        fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));

        expect(await screen.findByText('auth.modal.errors.unavailable')).toBeTruthy();
        expect((screen.getByRole('button', {
            name: 'common.confirm',
        }) as HTMLButtonElement).disabled).toBe(false);
        expect(messageErrorMock).toHaveBeenCalledWith('auth.modal.errors.unavailable');
        expect(screen.queryByText(/secret-token/i)).toBeNull();
    });

    it('ignores a late success after the owner closes the modal', async () => {
        let resolveRequest: ((value: { error: null }) => void) | undefined;
        updatePasswordMock.mockReturnValueOnce(new Promise((resolve) => {
            resolveRequest = resolve;
        }));
        const onCancel = vi.fn();
        const view = render(<SetPasswordModal open onCancel={onCancel} />);
        fillPasswordFields();
        fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }));

        await waitFor(() => expect(updatePasswordMock).toHaveBeenCalledOnce());
        view.rerender(<SetPasswordModal open={false} onCancel={onCancel} />);
        await act(async () => {
            resolveRequest?.({ error: null });
            await Promise.resolve();
        });

        expect(messageSuccessMock).not.toHaveBeenCalled();
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('submits once while a request is already in flight', async () => {
        updatePasswordMock.mockReturnValueOnce(new Promise(() => undefined));
        render(<SetPasswordModal open onCancel={vi.fn()} />);
        fillPasswordFields();
        const submit = screen.getByRole('button', { name: 'common.confirm' });

        fireEvent.click(submit);
        fireEvent.click(submit);

        await waitFor(() => expect(updatePasswordMock).toHaveBeenCalledOnce());
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    });
});
