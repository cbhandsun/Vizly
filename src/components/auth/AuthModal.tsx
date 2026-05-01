
import React, { useState } from 'react';
import { Modal, Form, Input, Button, message, Tabs, Typography } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';


const { Text } = Typography;

interface AuthModalProps {
    open: boolean;
    onCancel: () => void;
}

type TabKey = 'password' | 'magiclink' | 'register';

export const AuthModal: React.FC<AuthModalProps> = ({ open, onCancel }) => {
    const { t } = useTranslation();
    const { signInWithEmail, signInWithPassword, signUp } = useAuth();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabKey>('password');
    const [magicLinkSent, setMagicLinkSent] = useState(false);

    const handleClose = () => {
        onCancel();
        // Reset state after closing
        setTimeout(() => {
            setMagicLinkSent(false);
            setActiveTab('password');
        }, 300);
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
            <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('auth.modal.noAccount')}
                    <a onClick={() => setActiveTab('register')} style={{ marginLeft: 4 }}>
                        {t('auth.modal.registerNow')}
                    </a>
                </Text>
            </div>
        </Form>
    );

    // Magic Link Form
    const magicLinkForm = magicLinkSent ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📧</div>
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
            <div style={{ textAlign: 'center' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('auth.modal.hasAccount')}
                    <a onClick={() => setActiveTab('password')} style={{ marginLeft: 4 }}>
                        {t('auth.modal.backToLogin')}
                    </a>
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
            footer={null}
            destroyOnHidden
            width={420}
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
