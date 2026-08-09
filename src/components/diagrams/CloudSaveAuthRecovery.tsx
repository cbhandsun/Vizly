import React, { lazy, Suspense } from 'react';

const AuthModal = lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

interface CloudSaveAuthRecoveryProps {
    enabled: boolean;
    open: boolean;
    onCancel: () => void;
    onAuthenticated: () => void;
    onAfterClose: () => void;
}

export const CloudSaveAuthRecovery: React.FC<CloudSaveAuthRecoveryProps> = ({
    enabled,
    open,
    onCancel,
    onAuthenticated,
    onAfterClose,
}) => {
    if (!enabled) return null;

    return (
        <Suspense fallback={null}>
            <AuthModal
                open={open}
                onCancel={onCancel}
                onAuthenticated={onAuthenticated}
                onAfterClose={onAfterClose}
            />
        </Suspense>
    );
};
