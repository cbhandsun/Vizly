import React from 'react';
import { PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

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
    restoreActionLabel: string;
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
    restoreActionLabel,
}) => {
    const controlState = getPageTabsCapacityControlState(pageLimitReached, disabled);

    return (
        <>
            {onRestoreDeletedPage && canRestoreDeletedPage && (
                <Tooltip title={restoreActionLabel}>
                    <button
                        type="button"
                        aria-label={restoreActionLabel}
                        onClick={onRestoreDeletedPage}
                        className="page-tabs__restore"
                        disabled={disabled}
                    >
                        <UndoOutlined aria-hidden style={{ fontSize: 14 }} />
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
