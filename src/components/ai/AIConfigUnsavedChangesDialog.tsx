import { createPortal } from 'react-dom';
import { useRef } from 'react';
import type { TFunction } from 'i18next';
import Button from 'antd/es/button';
import Typography from 'antd/es/typography';
import { ExclamationCircleFilled } from '@ant-design/icons';

import { getViewportOverlayContainer } from '@/core/components/ui/viewportOverlayPortal';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

interface AIConfigUnsavedChangesDialogProps {
    open: boolean;
    t: TFunction;
    onKeepEditing: () => void;
    onDiscard: () => void;
}

export const AIConfigUnsavedChangesDialog = ({
    open,
    t,
    onKeepEditing,
    onDiscard,
}: AIConfigUnsavedChangesDialogProps) => {
    const keepEditingButtonRef = useRef<HTMLButtonElement>(null);
    const { containerRef, handleKeyDown } = useModalFocusTrap<HTMLDivElement>({
        active: open,
        initialFocusRef: keepEditingButtonRef,
        onClose: onKeepEditing,
    });

    if (!open) return null;

    return createPortal(
        <div className="ai-config-delete-dialog-mask">
            <div
                ref={containerRef}
                className="ai-config-delete-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ai-config-unsaved-title"
                aria-describedby="ai-config-unsaved-description"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                <div className="ai-config-delete-dialog-heading ai-config-unsaved-dialog-heading">
                    <ExclamationCircleFilled aria-hidden="true" />
                    <Typography.Title id="ai-config-unsaved-title" level={5}>
                        {t('aiConfig.unsavedChangesTitle')}
                    </Typography.Title>
                </div>
                <Typography.Paragraph id="ai-config-unsaved-description">
                    {t('aiConfig.unsavedChangesDescription')}
                </Typography.Paragraph>
                <div className="ai-config-delete-dialog-actions">
                    <Button ref={keepEditingButtonRef} onClick={onKeepEditing}>
                        {t('aiConfig.keepEditing')}
                    </Button>
                    <Button danger onClick={onDiscard}>{t('aiConfig.discardChanges')}</Button>
                </div>
            </div>
        </div>,
        getViewportOverlayContainer(),
    );
};
