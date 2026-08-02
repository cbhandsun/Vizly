
import React, { useState } from 'react';
import { Modal, Form, Input, Button, Tabs, Typography } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';
import './AuthModal.css';


const { Text } = Typography;

interface AuthModalProps {
    open: boolean;
    onCancel: () => void;
    onAuthenticated?: () => void;
    zIndex?: number;
}

type TabKey = 'password' | 'magiclink' | 'register';

export const AUTH_MODAL_Z_INDEX = 1500;

export const AuthModal: React.FC<AuthModalProps> = ({
    open,
    onCancel,
    onAuthenticated,
    zIndex = AUTH_MODAL_Z_INDEX,
}) => {
    const { t } = useTranslation();
    const { signInWithEmail, signInWithPassword, signUp } = useAuth();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('password');
    const [magicLinkSent, setMagicLinkSent] = useState(false);

    const handleClose = () => {
        onCancel();
    };

    const resetTransientState = () => {
        setMagicLinkSent(false);
        setActiveTab('password');
    };

    // ===== Password Login =====
    const onPasswordLogin = async (values: { email: string; password: string }) => {
        setLoading(true);
        const { error } = await signInWithPassword(values.email, values.password);
        setLoading(false);

        if (error) {
            if (error.message === 'Invalid login credentials') {
                appMessage.error(t('auth.modal.invalidCredentials'));
            } else {
                appMessage.error(error.message);
            }
        } else {
            appMessage.success(t('auth.modal.loginSuccess'));
            onAuthenticated?.();
            handleClose();
        }
    };

    // ===== Magic Link Login =====
    const onMagicLinkLogin = async (values: { email: string }) => {
        setLoading(true);
        const { error } = await signInWithEmail(values.email);
        setLoading(false);

        if (error) {
            appMessage.error(error.message);
        } else {
            setMagicLinkSent(true);
            appMessage.success(t('auth.modal.magicLinkSent'));
        }
    };

    // ===== Register =====
    const onRegister = async (values: { email: string; password: string; confirmPassword: string }) => {
        if (values.password !== values.confirmPassword) {
            appMessage.error(t('auth.modal.register.passwordMismatch'));
            return;
        }
        setLoading(true);
        const { error } = await signUp(values.email, values.password);
        setLoading(false);

        if (error) {
            appMessage.error(error.message);
        } else {
            appMessage.success(t('auth.modal.register.success'));
            handleClose();
        }
    };

    // Password Form
    const passwordForm = (
        <Form name="auth_password" onFinish={onPasswordLogin} layout="vertical" autoComplete="off">
            <Form.Item
                label={t('auth.modal.emailPlaceholder')}
                name="email"
                rules={[
                    { required: true, message: t('auth.modal.emailRequired') },
                    { type: 'email', message: t('auth.modal.emailInvalid') }
                ]}
            >
                <Input
                    prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('auth.modal.emailPlaceholder')}
                    size="large"
                />
            </Form.Item>
            <Form.Item
                label={t('auth.modal.password.placeholder')}
                name="password"
                rules={[{ required: true, message: t('auth.modal.password.required') }]}
            >
                <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('auth.modal.password.placeholder')}
                    size="large"
                />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
                <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={loading}
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
                        onClick={() => setActiveTab('register')}
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
            <p style={{ color: '#666', marginBottom: 16 }}>{t('auth.modal.checkEmailDesc')}</p>
            <Button type="primary" onClick={handleClose}>
                {t('common.ok')}
            </Button>
        </div>
    ) : (
        <Form name="auth_magiclink" onFinish={onMagicLinkLogin} layout="vertical" autoComplete="off">
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f6f8fa', borderRadius: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('auth.modal.magicLinkHint')}
                </Text>
            </div>

            <Form.Item
                label={t('auth.modal.emailPlaceholder')}
                name="email"
                rules={[
                    { required: true, message: t('auth.modal.emailRequired') },
                    { type: 'email', message: t('auth.modal.emailInvalid') }
                ]}
            >
                <Input
                    prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('auth.modal.emailPlaceholder')}
                    size="large"
                />
            </Form.Item>

            <Form.Item>
                <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={loading}
                    icon={<KeyOutlined />}
                >
                    {t('auth.modal.sendMagicLink')}
                </Button>
            </Form.Item>
        </Form>
    );

    // Register Form
    const registerForm = (
        <Form name="auth_register" onFinish={onRegister} layout="vertical" autoComplete="off">
            <Form.Item
                label={t('auth.modal.emailPlaceholder')}
                name="email"
                rules={[
                    { required: true, message: t('auth.modal.emailRequired') },
                    { type: 'email', message: t('auth.modal.emailInvalid') }
                ]}
            >
                <Input
                    prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('auth.modal.emailPlaceholder')}
                    size="large"
                />
            </Form.Item>
            <Form.Item
                label={t('auth.modal.register.passwordPlaceholder')}
                name="password"
                rules={[
                    { required: true, message: t('auth.modal.password.required') },
                    { min: 6, message: t('auth.modal.register.passwordMin') }
                ]}
            >
                <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('auth.modal.register.passwordPlaceholder')}
                    size="large"
                />
            </Form.Item>
            <Form.Item
                label={t('auth.modal.register.confirmPlaceholder')}
                name="confirmPassword"
                rules={[{ required: true, message: t('auth.modal.register.confirmRequired') }]}
            >
                <Input.Password
                    prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                    placeholder={t('auth.modal.register.confirmPlaceholder')}
                    size="large"
                />
            </Form.Item>
            <Form.Item style={{ marginBottom: 12 }}>
                <Button
                    type="primary"
                    htmlType="submit"
                    block
                    size="large"
                    loading={loading}
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
                        onClick={() => setActiveTab('password')}
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
            title={null}
            open={open}
            onCancel={handleClose}
            afterClose={resetTransientState}
            footer={null}
            destroyOnHidden
            width={420}
            zIndex={zIndex}
            rootClassName="auth-modal"
        >
            <Tabs
                activeKey={activeTab}
                onChange={(k) => setActiveTab(k as TabKey)}
                items={tabItems}
                centered
                style={{ marginTop: -8 }}
            />
        </Modal>
    );
};
