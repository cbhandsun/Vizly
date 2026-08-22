import React from 'react';
import { PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

import { getPageTabsCapacityControlState, runPageTabsCapacityAction } from './pageTabsLimitFeedback';

interface PageTabsCapacityControlsProps {
    addLabel: string;
    addTooltip: string;
    announceLimit: () => void;
    canRestoreDeletedPage: boolean;
    disabled: boolean;
    onAddPage: () => void;
    onRestoreDeletedPage?: () => void;
    pageLimitReached: boolean;
    restorableDeletedPageName: string | null;
    restoreButtonRef?: React.Ref<HTMLButtonElement>;
}

export const PageTabsCapacityControls: React.FC<PageTabsCapacityControlsProps> = ({
    addLabel,
    addTooltip,
    announceLimit,
    canRestoreDeletedPage,
    disabled,
    onAddPage,
    onRestoreDeletedPage,
    pageLimitReached,
    restorableDeletedPageName,
    restoreButtonRef,
}) => {
    const { t } = useTranslation();
    const controlState = getPageTabsCapacityControlState(pageLimitReached, disabled);
    const restoreActionLabel = restorableDeletedPageName
        ? t('designer.pages.restoreNamedAction', {
            name: restorableDeletedPageName,
            defaultValue: '恢复页面“{{name}}”',
        })
        : t('designer.pages.restoreAction', { defaultValue: '恢复删除的页面' });

    return (
        <>
            {onRestoreDeletedPage && canRestoreDeletedPage && (
                <Tooltip title={restoreActionLabel}>
                    <button
                        ref={restoreButtonRef}
                        type="button"
                        aria-label={restoreActionLabel}
                        onClick={onRestoreDeletedPage}
                        className="page-tabs__restore"
                        disabled={disabled}
                    >
                        <UndoOutlined aria-hidden style={{ fontSize: 14 }} />
                        <span className="page-tabs__restore-label">{restoreActionLabel}</span>
                    </button>
                </Tooltip>
            )}
            <Tooltip title={addTooltip}>
                <button
                    type="button"
                    aria-label={addLabel}
                    className="page-tabs__add"
                    aria-disabled={controlState.ariaDisabled}
                    disabled={controlState.disabled}
                    onClick={() => runPageTabsCapacityAction({
                        pageLimitReached,
                        disabled,
                        announceLimit,
                        performAction: onAddPage,
                    })}
                >
                    <PlusOutlined aria-hidden style={{ fontSize: 14 }} />
                </button>
            </Tooltip>
        </>
    );
};
