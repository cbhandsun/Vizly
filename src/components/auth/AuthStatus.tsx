
import React, { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Avatar, Dropdown, MenuProps, Tooltip } from 'antd';
import { UserOutlined, LoginOutlined, LogoutOutlined, CloudOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { SetPasswordModal } from './SetPasswordModal';
import './AuthStatus.css';
const CloudStorageManagerModal = React.lazy(() => import('../storage/CloudStorageManagerModal').then(m => ({ default: m.CloudStorageManagerModal })));
import { useTranslation } from 'react-i18next';

const AuthModal = React.lazy(() => import('./AuthModal').then(m => ({ default: m.AuthModal })));

interface AuthStatusProps {
    compact?: boolean;
    commercialTouchTarget?: boolean;
}

const COMMERCIAL_TOUCH_TARGET_STYLE: React.CSSProperties = {
    width: 'var(--commercial-touch-target, 44px)',
    minWidth: 'var(--commercial-touch-target, 44px)',
    height: 'var(--commercial-touch-target, 44px)',
    minHeight: 'var(--commercial-touch-target, 44px)',
};

export const AuthStatus: React.FC<AuthStatusProps> = ({
    compact = false,
    commercialTouchTarget = false,
}) => {
    const { t } = useTranslation();
    const { user, signOut } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
    const [isSetPasswordModalOpen, setIsSetPasswordModalOpen] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const accountMenuTriggerRef = useRef<HTMLButtonElement>(null);
    const shouldRestoreAccountMenuFocusRef = useRef(false);
    const accountMenuId = `auth-account-menu-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const handleAccountMenuOpenChange = (open: boolean) => {
        setIsAccountMenuOpen(open);
        if (open) {
            requestAnimationFrame(() => {
                document.querySelector<HTMLElement>(
                    `#${accountMenuId} [role="menuitem"]:not([aria-disabled="true"])`,
                )?.focus();
            });
            return;
        }

        if (shouldRestoreAccountMenuFocusRef.current) {
            shouldRestoreAccountMenuFocusRef.current = false;
            queueMicrotask(() => accountMenuTriggerRef.current?.focus());
        }
    };

    const handleAccountMenuTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Escape' && isAccountMenuOpen) {
            event.preventDefault();
            shouldRestoreAccountMenuFocusRef.current = true;
            handleAccountMenuOpenChange(false);
            return;
        }
        if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        handleAccountMenuOpenChange(true);
    };

    const handleAccountMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
        if (event.key === 'Escape') {
            shouldRestoreAccountMenuFocusRef.current = true;
        }
    };

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
                        style={commercialTouchTarget ? COMMERCIAL_TOUCH_TARGET_STYLE : undefined}
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
        <Dropdown
            menu={{
                id: accountMenuId,
                'aria-label': t('auth.accountMenu'),
                items: menuItems,
                onClick: handleMenuClick,
                onKeyDown: handleAccountMenuKeyDown,
            }}
            trigger={['click']}
            placement="bottomRight"
            open={isAccountMenuOpen}
            onOpenChange={handleAccountMenuOpenChange}
        >
            <button
                ref={accountMenuTriggerRef}
                type="button"
                className={`auth-account-menu-trigger${commercialTouchTarget ? ' auth-account-menu-trigger--commercial' : ''}`}
                aria-label={t('auth.accountMenu')}
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                aria-controls={accountMenuId}
                title={t('auth.accountMenu')}
                onKeyDown={handleAccountMenuTriggerKeyDown}
            >
                <Avatar
                    size="small"
                    style={{ backgroundColor: '#1890ff' }}
                    icon={<UserOutlined />}
                >
                    {user.email?.[0].toUpperCase()}
                </Avatar>
            </button>
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

export const AuthStatusCompact: React.FC<Pick<AuthStatusProps, 'commercialTouchTarget'>> = ({
    commercialTouchTarget = false,
}) => {
    return <AuthStatus compact commercialTouchTarget={commercialTouchTarget} />;
};
