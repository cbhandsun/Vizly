import React from 'react';
import { Alert, Button } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface ShareDialogLoginAlertProps {
    onAction: () => void;
}

export const ShareDialogLoginAlert = React.forwardRef<
    HTMLButtonElement,
    ShareDialogLoginAlertProps
>(({ onAction }, ref) => {
    const { t } = useTranslation();
    const actionLabel = t('share.loginAction', '立即登录');

    return (
        <Alert
            className="share-dialog-login-alert"
            type="warning"
            showIcon
            title={t('share.loginRequired')}
            description={t('share.loginRequiredHint', '登录后将返回当前分享流程，不会丢失图表。')}
            action={(
                <Button
                    ref={ref}
                    className="share-dialog-login-action"
                    type="primary"
                    icon={<LoginOutlined />}
                    aria-label={actionLabel}
                    onClick={onAction}
                >
                    {actionLabel}
                </Button>
            )}
        />
    );
});

ShareDialogLoginAlert.displayName = 'ShareDialogLoginAlert';
