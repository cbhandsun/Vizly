
import React, { useState } from 'react';
import { Button, Avatar, Dropdown, MenuProps, Tooltip } from 'antd';
import { UserOutlined, LoginOutlined, LogoutOutlined, CloudOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { SetPasswordModal } from './SetPasswordModal';
const CloudStorageManagerModal = React.lazy(() => import('../storage/CloudStorageManagerModal').then(m => ({ default: m.CloudStorageManagerModal })));
import { useTranslation } from 'react-i18next';

const AuthModal = React.lazy(() => import('./AuthModal').then(m => ({ default: m.AuthModal })));

export const AuthStatus: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
    const { t } = useTranslation();
    const { user, signOut } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
    const [isSetPasswordModalOpen, setIsSetPasswordModalOpen] = useState(false);

    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        if (key === 'logout') {
            signOut();
        } else if (key === 'switch_user') {
            signOut().then(() => setIsModalOpen(true));
        } else if (key === 'set_password') {
            setIsSetPasswordModalOpen(true);
        } else if (key === 'cloud_files') {
            setIsCloudModalOpen(true);
        }
    };

    const menuItems: MenuProps['items'] = [
        {
            key: 'email',
            label: user?.email,
            disabled: true,
            icon: <UserOutlined />,
        },
        {
            type: 'divider',
        },
        {
            key: 'cloud_files',
            label: t('auth.menu.myDiagrams'),
            icon: <CloudOutlined />,
        },
        {
            key: 'switch_user',
            label: t('auth.menu.switchUser'),
            icon: <UserOutlined />,
        },
        {
            key: 'set_password',
            label: t('auth.menu.setPassword'),
            icon: <LockOutlined />,
        },
        {
            key: 'logout',
            label: t('auth.menu.logout'),
            icon: <LogoutOutlined />,
            danger: true,
        },
    ];

    const trigger = !user ? (
        <>
            {compact ? (
                <Tooltip title={t('auth.login')} placement="bottom">
                    <Button
                        type="text"
                        aria-label={t('auth.login')}
                        icon={<LoginOutlined />}
                        onClick={() => setIsModalOpen(true)}
                    />
                </Tooltip>
            ) : (
                <Button
                    type="text"
                    icon={<LoginOutlined />}
                    onClick={() => setIsModalOpen(true)}
                >
                    {t('auth.login')}
                </Button>
            )}
        </>
    ) : (
        <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} placement="bottomRight">
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar
                    size="small"
                    style={{ backgroundColor: '#1890ff' }}
                    icon={<UserOutlined />}
                >
                    {user.email?.[0].toUpperCase()}
                </Avatar>
            </div>
        </Dropdown>
    );

    return (
        <>
            {trigger}
            {isModalOpen && (
                <React.Suspense fallback={null}>
                    <AuthModal
                        open={isModalOpen}
                        onCancel={() => setIsModalOpen(false)}
                    />
                </React.Suspense>
            )}
            <SetPasswordModal
                open={isSetPasswordModalOpen}
                onCancel={() => setIsSetPasswordModalOpen(false)}
            />
            {isCloudModalOpen && (
                <React.Suspense fallback={null}>
                    <CloudStorageManagerModal
                        open={isCloudModalOpen}
                        onCancel={() => setIsCloudModalOpen(false)}
                    />
                </React.Suspense>
            )}
        </>
    );
};

export const AuthStatusCompact: React.FC = () => {
    return <AuthStatus compact />;
};
