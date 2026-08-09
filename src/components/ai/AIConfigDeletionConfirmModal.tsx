import { createPortal } from 'react-dom';
import { useRef } from 'react';
import type { TFunction } from 'i18next';
import Button from 'antd/es/button';
import Typography from 'antd/es/typography';
import { ExclamationCircleFilled } from '@ant-design/icons';

import { getViewportOverlayContainer } from '@/core/components/ui/viewportOverlayPortal';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';
import type { PendingAIConfigDeletion } from './useAIConfigDeletion';

interface AIConfigDeletionConfirmModalProps {
    pendingDeletion: PendingAIConfigDeletion | null;
    t: TFunction;
    onCancel: () => void;
    onConfirm: () => void;
}

export const AIConfigDeletionConfirmModal = ({
    pendingDeletion,
    t,
    onCancel,
    onConfirm,
}: AIConfigDeletionConfirmModalProps) => {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const { containerRef, handleKeyDown } = useModalFocusTrap<HTMLDivElement>({
        active: pendingDeletion !== null,
        initialFocusRef: cancelButtonRef,
        onClose: onCancel,
    });

    if (!pendingDeletion) return null;

    const isProvider = pendingDeletion.kind === 'provider';
    const title = t(isProvider ? 'aiConfig.deleteProviderTitle' : 'aiConfig.deleteModelTitle');
    const description = isProvider
        ? t('aiConfig.deleteProviderDescription', {
            name: pendingDeletion.providerName,
            count: pendingDeletion.modelCount,
        })
        : t(pendingDeletion.isActive
            ? 'aiConfig.deleteActiveModelDescription'
            : 'aiConfig.deleteModelDescription', {
            name: pendingDeletion.modelName,
        });

    return createPortal(
        <div className="ai-config-delete-dialog-mask">
            <div
                ref={containerRef}
                className="ai-config-delete-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ai-config-delete-title"
                aria-describedby="ai-config-delete-description"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                <div className="ai-config-delete-dialog-heading">
                    <ExclamationCircleFilled aria-hidden="true" />
                    <Typography.Title id="ai-config-delete-title" level={5}>{title}</Typography.Title>
                </div>
                <Typography.Paragraph id="ai-config-delete-description">
                    {description}
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" className="ai-config-delete-dialog-note">
                    {t('aiConfig.deleteDraftNote')}
                </Typography.Paragraph>
                <div className="ai-config-delete-dialog-actions">
                    <Button ref={cancelButtonRef} onClick={onCancel}>{t('common.cancel')}</Button>
                    <Button type="primary" danger onClick={onConfirm}>{t('common.delete')}</Button>
                </div>
            </div>
        </div>,
        getViewportOverlayContainer(),
    );
};
