// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
    ButtonHTMLAttributes,
    FormEvent,
    InputHTMLAttributes,
    ReactElement,
    ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const signInWithPasswordMock = vi.fn();

vi.mock('@/context/useAuth', () => ({
    useAuth: () => ({
        signInWithEmail: vi.fn(),
        signInWithPassword: signInWithPasswordMock,
        signUp: vi.fn(),
    }),
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@ant-design/icons', () => ({
    KeyOutlined: () => null,
    LockOutlined: () => null,
    MailOutlined: () => null,
    UserOutlined: () => null,
}));

vi.mock('antd', async () => {
    const React = await import('react');

    const MockForm = ({
        children,
        onFinish,
    }: {
        children: ReactNode;
        onFinish: (values: Record<string, string>) => void;
    }) => React.createElement('form', {
        onSubmit: (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget).entries());
            onFinish(Object.fromEntries(
                Object.entries(values).map(([key, value]) => [key, String(value)]),
            ));
        },
    }, children);

    const MockFormItem = ({
        children,
        name,
    }: {
        children: ReactNode;
        name?: string;
    }) => React.isValidElement(children)
        ? React.cloneElement(children as ReactElement<{ name?: string }>, { name })
        : children;

    const MockInputBase = ({
        prefix: _prefix,
        placeholder,
        ...props
    }: InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode }) => React.createElement('input', {
        ...props,
        'aria-label': placeholder,
        placeholder,
    });
    const MockInput = Object.assign(MockInputBase, { Password: MockInputBase });

    const MockButton = ({
        block: _block,
        children,
        htmlType,
        icon: _icon,
        loading: _loading,
        ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & {
        block?: boolean;
        htmlType?: 'button' | 'submit' | 'reset';
        icon?: ReactNode;
        loading?: boolean;
    }) => React.createElement('button', {
        ...props,
        type: htmlType ?? 'button',
    }, children);

    const MockTabs = ({
        activeKey,
        items,
    }: {
        activeKey: string;
        items: Array<{ children: ReactNode; key: string }>;
    }) => React.createElement(
        React.Fragment,
        null,
        items.find(item => item.key === activeKey)?.children,
    );

    const MockModal = ({ children, open }: { children: ReactNode; open: boolean }) => open
        ? React.createElement('div', { role: 'dialog' }, children)
        : null;

    return {
        Button: MockButton,
        Form: Object.assign(MockForm, {
            Item: MockFormItem,
            useForm: () => [{ resetFields: vi.fn() }],
        }),
        Input: MockInput,
        Modal: MockModal,
        Tabs: MockTabs,
        Typography: {
            Text: ({ children }: { children: ReactNode }) => React.createElement('span', null, children),
        },
    };
});

import { AuthModal } from '../AuthModal';

describe('AuthModal authentication contract', () => {
    it('separates authenticated completion from ordinary cancellation', async () => {
        signInWithPasswordMock.mockResolvedValueOnce({ error: null });
        const onAuthenticated = vi.fn();
        const onCancel = vi.fn();

        render(
            <AuthModal
                open
                onCancel={onCancel}
                onAuthenticated={onAuthenticated}
            />,
        );

        fireEvent.change(screen.getByLabelText('auth.modal.emailPlaceholder'), {
            target: { value: 'member@example.com' },
        });
        fireEvent.change(screen.getByLabelText('auth.modal.password.placeholder'), {
            target: { value: 'safe-password' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'auth.modal.loginButton' }));

        await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
        expect(onCancel).toHaveBeenCalledOnce();
        expect(signInWithPasswordMock).toHaveBeenCalledWith(
            'member@example.com',
            'safe-password',
        );
    });
});
