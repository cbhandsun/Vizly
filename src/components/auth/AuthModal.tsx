
import React, { useLayoutEffect, useState } from 'react';
import { Alert, Modal, Form, Input, Button, Tabs, Typography } from 'antd';
import type { FormInstance, FormProps } from 'antd/es/form';
import { UserOutlined, MailOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import {
    AUTH_EMAIL_MAX_LENGTH,
    AUTH_PASSWORD_MAX_LENGTH,
    useAuthOperation,
} from './useAuthOperation';
import './AuthModal.css';


const { Text } = Typography;

interface AuthModalProps {
    open: boolean;
    onCancel: () => void;
    onAuthenticated?: () => void;
    onAfterClose?: () => void;
    zIndex?: number;
}

type TabKey = 'password' | 'magiclink' | 'register';

export const AUTH_MODAL_Z_INDEX = 1500;

const AUTH_SCROLL_TO_FIRST_ERROR: Exclude<FormProps['scrollToFirstError'], boolean | undefined> = {
    block: 'nearest',
    focus: true,
};

const clearFormValidation = (form: FormInstance) => {
    const invalidFields = form.getFieldsError().filter(
        field => field.errors.length > 0 || field.warnings.length > 0,
    );
    if (invalidFields.length === 0) return;

    form.setFields(invalidFields.map(field => ({
        name: field.name,
        errors: [],
        warnings: [],
    })));
};

export const AuthModal: React.FC<AuthModalProps> = ({
    open,
    onCancel,
    onAuthenticated,
    onAfterClose,
    zIndex = AUTH_MODAL_Z_INDEX,
}) => {
    const { t } = useTranslation();
    const { signInWithEmail, signInWithPassword, signUp } = useAuth();
    const [activeTab, setActiveTab] = useState<TabKey>('password');
    const [magicLinkSent, setMagicLinkSent] = useState(false);
    const [passwordFormInstance] = Form.useForm();
    const [magicLinkFormInstance] = Form.useForm();
    const [registerFormInstance] = Form.useForm();
    const operation = useAuthOperation(open);
    const { invalidate: invalidateOperation } = operation;

    const clearActiveFormValidation = () => {
        if (activeTab === 'password') {
            clearFormValidation(passwordFormInstance);
        } else if (activeTab === 'register') {
            clearFormValidation(registerFormInstance);
        } else if (!magicLinkSent) {
            clearFormValidation(magicLinkFormInstance);
        }
    };

    useLayoutEffect(() => {
        if (!open) invalidateOperation();
    }, [invalidateOperation, open]);

    const handleClose = () => {
        if (operation.busy) return;
        onCancel();
    };

    const resetTransientState = () => {
        passwordFormInstance.resetFields();
        magicLinkFormInstance.resetFields();
        registerFormInstance.resetFields();
        operation.invalidate();
        setMagicLinkSent(false);
        setActiveTab('password');
        onAfterClose?.();
    };

    // ===== Password Login =====
    const onPasswordLogin = async (values: { email: string; password: string }) => {
        await operation.run(
            () => signInWithPassword(values.email, values.password),
            {
                onError: (messageKey) => appMessage.error(t(messageKey)),
                onSuccess: () => {
                    appMessage.success(t('auth.modal.loginSuccess'));
                    onAuthenticated?.();
                    onCancel();
                },
            },
        );
    };

    // ===== Magic Link Login =====
    const onMagicLinkLogin = async (values: { email: string }) => {
        await operation.run(
            () => signInWithEmail(values.email),
            {
                onError: (messageKey) => appMessage.error(t(messageKey)),
                onSuccess: () => {
                    setMagicLinkSent(true);
                    appMessage.success(t('auth.modal.magicLinkSent'));
                },
            },
        );
    };

    // ===== Register =====
    const onRegister = async (values: { email: string; password: string; confirmPassword: string }) => {
        await operation.run(
            () => signUp(values.email, values.password),
            {
                onError: (messageKey) => appMessage.error(t(messageKey)),
                onSuccess: () => {
                    appMessage.success(t('auth.modal.register.success'));
                    onCancel();
                },
            },
        );
    };

    const operationError = operation.errorMessageKey ? (
        <div className="auth-modal__operation-error" tabIndex={-1}>
            <Alert
                type="error"
                showIcon
                title={t(operation.errorMessageKey)}
            />
        </div>
    ) : null;

    // Password Form
    const passwordForm = (
        <Form
            form={passwordFormInstance}
            name="auth_password"
            onFinish={onPasswordLogin}
            layout="vertical"
            autoComplete="on"
            scrollToFirstError={AUTH_SCROLL_TO_FIRST_ERROR}
        >
            {operationError}
            <Form.Item
                label={t('auth.modal.emailPlaceholder')}
                name="email"
                rules={[
                    { required: true, message: t('auth.modal.emailRequired') },
                    { type: 'email', message: t('auth.modal.emailInvalid') },
                    { max: AUTH_EMAIL_MAX_LENGTH, message: t('auth.modal.emailTooLong') },
                ]}
            >
                <Input
                    prefix={<MailOutlined className="auth-modal__field-icon" />}
                    placeholder={t('auth.modal.emailPlaceholder')}
                    size="large"
                    autoComplete="email"
                    maxLength={AUTH_EMAIL_MAX_LENGTH}
                />
            </Form.Item>
            <Form.Item
                label={t('auth.modal.password.placeholder')}
                name="password"
                rules={[{ required: true, message: t('auth.modal.password.required') }]}
            >
                <Input.Password
                    prefix={<LockOutlined className="auth-modal__field-icon" />}
                    placeholder={t('auth.modal.password.placeholder')}
                    size="large"
                    autoComplete="current-password"
                    maxLength={AUTH_PASSWORD_MAX_LENGTH}
                />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
                <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={operation.busy}
                    disabled={operation.busy}
                    icon={<UserOutlined />}
                >
                    {t('auth.modal.loginButton')}
                </Button>
            </Form.Item>
            <div className="auth-modal__switch-row">
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('auth.modal.noAccount')}
                    <Button
                        type="link"
                        size="small"
                        className="auth-modal__switch-action"
                        disabled={operation.busy}
                        onClick={() => {
                            operation.clearError();
                            setActiveTab('register');
                        }}
                    >
                        {t('auth.modal.registerNow')}
                    </Button>
                </Text>
            </div>
        </Form>
    );

    // Magic Link Form
    const magicLinkForm = magicLinkSent ? (
        <div className="auth-modal__success">
            <div className="auth-modal__success-icon" aria-hidden="true"><MailOutlined /></div>
            <h3>{t('auth.modal.checkEmailTitle')}</h3>
            <p className="auth-modal__success-description">{t('auth.modal.checkEmailDesc')}</p>
            <Button type="primary" onClick={handleClose} disabled={operation.busy}>
                {t('common.ok')}
            </Button>
        </div>
    ) : (
        <Form
            form={magicLinkFormInstance}
            name="auth_magiclink"
            onFinish={onMagicLinkLogin}
            layout="vertical"
            autoComplete="on"
            scrollToFirstError={AUTH_SCROLL_TO_FIRST_ERROR}
        >
            {operationError}
            <div className="auth-modal__hint">
                <Text type="secondary" className="auth-modal__hint-text">
                    {t('auth.modal.magicLinkHint')}
                </Text>
            </div>

            <Form.Item
                label={t('auth.modal.emailPlaceholder')}
                name="email"
                rules={[
                    { required: true, message: t('auth.modal.emailRequired') },
                    { type: 'email', message: t('auth.modal.emailInvalid') },
                    { max: AUTH_EMAIL_MAX_LENGTH, message: t('auth.modal.emailTooLong') },
                ]}
            >
                <Input
                    prefix={<MailOutlined className="auth-modal__field-icon" />}
                    placeholder={t('auth.modal.emailPlaceholder')}
                    size="large"
                    autoComplete="email"
                    maxLength={AUTH_EMAIL_MAX_LENGTH}
                />
            </Form.Item>

            <Form.Item>
                <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={operation.busy}
                    disabled={operation.busy}
                    icon={<KeyOutlined />}
                >
                    {t('auth.modal.sendMagicLink')}
                </Button>
            </Form.Item>
        </Form>
    );

    // Register Form
    const registerForm = (
        <Form
            form={registerFormInstance}
            name="auth_register"
            onFinish={onRegister}
            layout="vertical"
            autoComplete="on"
            scrollToFirstError={AUTH_SCROLL_TO_FIRST_ERROR}
        >
            {operationError}
            <Form.Item
                label={t('auth.modal.emailPlaceholder')}
                name="email"
                rules={[
                    { required: true, message: t('auth.modal.emailRequired') },
                    { type: 'email', message: t('auth.modal.emailInvalid') },
                    { max: AUTH_EMAIL_MAX_LENGTH, message: t('auth.modal.emailTooLong') },
                ]}
            >
                <Input
                    prefix={<MailOutlined className="auth-modal__field-icon" />}
                    placeholder={t('auth.modal.emailPlaceholder')}
                    size="large"
                    autoComplete="email"
                    maxLength={AUTH_EMAIL_MAX_LENGTH}
                />
            </Form.Item>
            <Form.Item
                label={t('auth.modal.register.passwordPlaceholder')}
                name="password"
                rules={[
                    { required: true, message: t('auth.modal.password.required') },
                    { min: 6, message: t('auth.modal.register.passwordMin') },
                    { max: AUTH_PASSWORD_MAX_LENGTH, message: t('auth.modal.passwordTooLong') },
                ]}
            >
                <Input.Password
                    prefix={<LockOutlined className="auth-modal__field-icon" />}
                    placeholder={t('auth.modal.register.passwordPlaceholder')}
                    size="large"
                    autoComplete="new-password"
                    maxLength={AUTH_PASSWORD_MAX_LENGTH}
                />
            </Form.Item>
            <Form.Item
                label={t('auth.modal.register.confirmPlaceholder')}
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                    { required: true, message: t('auth.modal.register.confirmRequired') },
                    ({ getFieldValue }) => ({
                        validator(_, value: string | undefined) {
                            if (!value || getFieldValue('password') === value) return Promise.resolve();
                            return Promise.reject(new Error(t('auth.modal.register.passwordMismatch')));
                        },
                    }),
                ]}
            >
                <Input.Password
                    prefix={<LockOutlined className="auth-modal__field-icon" />}
                    placeholder={t('auth.modal.register.confirmPlaceholder')}
                    size="large"
                    autoComplete="new-password"
                    maxLength={AUTH_PASSWORD_MAX_LENGTH}
                />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
                <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={operation.busy}
                    disabled={operation.busy}
                >
                    {t('auth.modal.register.button')}
                </Button>
            </Form.Item>
            <div className="auth-modal__switch-row">
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('auth.modal.hasAccount')}
                    <Button
                        type="link"
                        size="small"
                        className="auth-modal__switch-action"
                        disabled={operation.busy}
                        onClick={() => {
                            operation.clearError();
                            setActiveTab('password');
                        }}
                    >
                        {t('auth.modal.backToLogin')}
                    </Button>
                </Text>
            </div>
        </Form>
    );

    const tabItems = [
        { key: 'password', label: t('auth.modal.tabs.password'), children: passwordForm },
        { key: 'magiclink', label: t('auth.modal.tabs.magiclink'), children: magicLinkForm },
        { key: 'register', label: t('auth.modal.tabs.register'), children: registerForm },
    ];

    return (
        <Modal
            title={t('auth.login')}
            open={open}
            onCancel={handleClose}
            closable={operation.busy ? false : { 'aria-label': t('common.close') }}
            keyboard={!operation.busy}
            mask={{ closable: !operation.busy }}
            afterClose={resetTransientState}
            footer={null}
            destroyOnHidden
            width={420}
            zIndex={zIndex}
            rootClassName="auth-modal"
        >
            <Tabs
                activeKey={activeTab}
                onChange={(k) => {
                    if (operation.busy) return;
                    operation.clearError();
                    clearActiveFormValidation();
                    setActiveTab(k as TabKey);
                }}
                items={tabItems.map((item) => ({ ...item, disabled: operation.busy }))}
                centered
                style={{ marginTop: -8 }}
            />
        </Modal>
    );
};
