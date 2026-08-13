import React, { useRef } from 'react';
import { Popover, Tooltip } from 'antd';
import { GatewayOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { MindMapNodeShapePicker } from './MindMapNodeShapePicker';
import styles from './FloatingBar.module.css';

interface MindMapNodeShapeControlProps {
    currentShape?: unknown;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (shape: string | undefined) => Promise<void> | void;
}

export const MindMapNodeShapeControl: React.FC<MindMapNodeShapeControlProps> = ({
    currentShape,
    open,
    onOpenChange,
    onSelect,
}) => {
    const { t } = useTranslation();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const label = t('plugins.mindmap.floatingBar.nodeShape');

    const closeAndRestoreFocus = () => {
        onOpenChange(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

    const selectAndClose = async (shape: string | undefined) => {
        try {
            await onSelect(shape);
        } finally {
            closeAndRestoreFocus();
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={onOpenChange}
            trigger="click"
            placement="top"
            arrow={false}
            destroyOnHidden
            getPopupContainer={() => document.body}
            styles={{
                content: { padding: 0, background: 'transparent', boxShadow: 'none' },
            }}
            content={
                <MindMapNodeShapePicker
                    currentShape={currentShape}
                    onCancel={closeAndRestoreFocus}
                    onSelect={selectAndClose}
                />
            }
        >
            <Tooltip title={label}>
                <button
                    ref={triggerRef}
                    type="button"
                    className={styles.btn}
                    aria-label={label}
                    title={label}
                    onKeyDown={event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        onOpenChange(!open);
                    }}
                >
                    <GatewayOutlined className={styles.shapeTriggerIcon} aria-hidden="true" />
                </button>
            </Tooltip>
        </Popover>
    );
};
