// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTH_MODAL_Z_INDEX, AuthModal } from '../AuthModal';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const authModalStyles = readFileSync(resolve(process.cwd(), 'src/components/auth/AuthModal.css'), 'utf8');

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

vi.mock('@vizly/core/antd', () => ({
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
    it.each(['password', 'magiclink', 'register'] as const)('keeps %s tab labels centered inside the scrolling body', async (tab) => {
        const style = document.createElement('style');
        style.textContent = authModalStyles;

        try {
            render(<AuthModal open onCancel={vi.fn()} />);
            const dialog = screen.getByRole('dialog', { name: 'auth.login' });
            const targetTab = within(dialog).getByRole('tab', { name: `auth.modal.tabs.${tab}` });
            fireEvent.click(targetTab);
            const submitNames = {
                password: 'auth.modal.loginButton',
                magiclink: 'auth.modal.sendMagicLink',
                register: 'auth.modal.register.button',
            };
            const panel = within(dialog).getByRole('tabpanel');
            const submit = within(panel).getByLabelText(submitNames[tab], { selector: 'button' });
            expect(submit.getAttribute('type')).toBe('submit');
            // Accessible form queries precede CSS injection to avoid repeated
            // jsdom style resolution; all style assertions use the real CSS.
            document.head.appendChild(style);
            await waitFor(() => {
                expect(targetTab.getAttribute('aria-selected')).toBe('true');
                const activeTab = targetTab;
                const tabStyle = getComputedStyle(activeTab);
                expect(tabStyle.display).toBe('inline-flex');
                expect(tabStyle.alignItems).toBe('center');
                const tabs = activeTab.closest('.ant-tabs');
                if (!tabs) throw new Error('Authentication tabs are missing');
                expect(Number.parseFloat(getComputedStyle(tabs).marginTop) || 0).toBeGreaterThanOrEqual(0);
            });
            const inputWrappers = dialog.querySelectorAll('.ant-input-affix-wrapper-lg');
            expect(inputWrappers.length).toBeGreaterThan(0);
            for (const input of inputWrappers) {
                expect(getComputedStyle(input).alignItems).toBe('center');
            }
        } finally {
            style.remove();
        }
    });

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

    const expectActiveEmailField = async (email: HTMLElement) => {
        await waitFor(() => {
            expect(document.activeElement).toBe(email);
        });
    };

    it('focuses the email field after password login validation fails', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        const panel = within(screen.getByRole('tabpanel'));
        const email = panel.getByLabelText('auth.modal.emailPlaceholder');
        await act(async () => {
            fireEvent.click(panel.getByLabelText('auth.modal.loginButton', { selector: 'button' }));
        });
        expect(await panel.findByText('auth.modal.emailRequired')).toBeTruthy();
        await expectActiveEmailField(email);
    });

    it('focuses the email field after magic-link validation fails', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        fireEvent.click(screen.getByRole('tab', { name: 'auth.modal.tabs.magiclink' }));
        const panel = within(screen.getByRole('tabpanel'));
        const email = panel.getByLabelText('auth.modal.emailPlaceholder');
        await act(async () => {
            fireEvent.click(panel.getByLabelText('auth.modal.sendMagicLink', { selector: 'button' }));
        });
        expect(await panel.findByText('auth.modal.emailRequired')).toBeTruthy();
        await expectActiveEmailField(email);
    });

    it('focuses the email field after registration validation fails', async () => {
        render(<AuthModal open onCancel={vi.fn()} />);

        fireEvent.click(screen.getByRole('tab', { name: 'auth.modal.tabs.register' }));
        const panel = within(screen.getByRole('tabpanel'));
        const email = panel.getByLabelText('auth.modal.emailPlaceholder');
        await act(async () => {
            fireEvent.click(panel.getByLabelText('auth.modal.register.button', { selector: 'button' }));
        });
        expect(await panel.findByText('auth.modal.emailRequired')).toBeTruthy();
        await expectActiveEmailField(email);
    });

    it.each(['tabs', 'inline-actions'] as const)('clears stale validation when switching methods via %s without discarding entered values', async (method) => {
        render(<AuthModal open onCancel={vi.fn()} />);

        const initialPanel = within(screen.getByRole('tabpanel'));
        const email = initialPanel.getByLabelText('auth.modal.emailPlaceholder');
        fireEvent.change(email, { target: { value: 'member@example.com' } });
        fireEvent.click(initialPanel.getByLabelText('auth.modal.loginButton', { selector: 'button' }));

        await waitFor(() => {
            expect(initialPanel.getByText('auth.modal.password.required')).toBeTruthy();
        });
        if (method === 'tabs') {
            const tabs = within(screen.getByRole('tablist'));
            fireEvent.click(tabs.getByRole('tab', { name: 'auth.modal.tabs.register' }));
            fireEvent.click(tabs.getByRole('tab', { name: 'auth.modal.tabs.password' }));
        } else {
            fireEvent.click(initialPanel.getByRole('button', { name: 'auth.modal.registerNow' }));
            const registerPanel = within(screen.getByRole('tabpanel'));
            fireEvent.click(registerPanel.getByRole('button', { name: 'auth.modal.backToLogin' }));
        }

        const activePanel = within(screen.getByRole('tabpanel'));
        const password = activePanel.getByLabelText('auth.modal.password.placeholder');
        expect(password.getAttribute('aria-invalid')).not.toBe('true');
        expect(password.getAttribute('aria-describedby')).toBeNull();
        expect((activePanel.getByLabelText(
            'auth.modal.emailPlaceholder',
        ) as HTMLInputElement).value).toBe('member@example.com');
    });

    it.each(['register', 'magiclink'] as const)('unmounts inactive %s forms and preserves password login values', async (method) => {
        render(<AuthModal open onCancel={vi.fn()} />);
        const dialog = screen.getByRole('dialog');
        const modal = within(dialog);
        const emailLabel = 'auth.modal.emailPlaceholder';
        const passwordLabel = 'auth.modal.password.placeholder';
        fireEvent.change(modal.getByLabelText(emailLabel), {
            target: { value: 'retained@example.invalid' },
        });
        fireEvent.change(modal.getByLabelText(passwordLabel), {
            target: { value: 'retained-password' },
        });
        fireEvent.click(modal.getByRole('tab', { name: `auth.modal.tabs.${method}` }));
        await waitFor(() => {
            expect(dialog.querySelectorAll('form')).toHaveLength(1);
            expect(modal.queryByLabelText(passwordLabel)).toBeNull();
        });
        fireEvent.click(modal.getByRole('tab', { name: 'auth.modal.tabs.password' }));
        await waitFor(() => {
            expect(dialog.querySelectorAll('form')).toHaveLength(1);
            expect((modal.getByLabelText(emailLabel) as HTMLInputElement).value).toBe('retained@example.invalid');
            expect((modal.getByLabelText(passwordLabel) as HTMLInputElement).value).toBe('retained-password');
        });
        expect(signInWithPasswordMock).not.toHaveBeenCalled();
        expect(signInWithEmailMock).not.toHaveBeenCalled();
        expect(signUpMock).not.toHaveBeenCalled();
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
