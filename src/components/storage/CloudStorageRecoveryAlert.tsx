import React from 'react';
import { Alert, Button } from 'antd';

interface CloudStorageRecoveryAlertProps {
    title: string;
    description: string;
    retryLabel: string;
    loading: boolean;
    onRetry: () => void;
}

export const CloudStorageRecoveryAlert: React.FC<CloudStorageRecoveryAlertProps> = ({
    title,
    description,
    retryLabel,
    loading,
    onRetry,
}) => (
    <Alert
        className="cloud-storage-manager-recovery-alert"
        type="error"
        showIcon
        title={title}
        description={description}
        action={(
            <Button onClick={onRetry} disabled={loading}>
                {retryLabel}
            </Button>
        )}
    />
);
