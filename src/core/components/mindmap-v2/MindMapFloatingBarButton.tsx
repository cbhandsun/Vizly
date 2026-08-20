import React from 'react';
import { Tooltip } from 'antd';
import styles from './FloatingBar.module.css';

interface MindMapFloatingBarButtonProps {
    ariaExpanded?: boolean;
    danger?: boolean;
    icon: React.ReactNode;
    onClick: () => void;
    tip: string;
}

export const MindMapFloatingBarButton: React.FC<MindMapFloatingBarButtonProps> = ({
    ariaExpanded,
    danger = false,
    icon,
    onClick,
    tip,
}) => (
    <Tooltip title={tip} placement="top" mouseEnterDelay={0.4}>
        <button
            type="button"
            className={`${styles.btn} ${danger ? styles.btnDanger : ''}`}
            aria-label={tip}
            aria-expanded={ariaExpanded}
            title={tip}
            onClick={onClick}
        >
            <span aria-hidden="true">{icon}</span>
        </button>
    </Tooltip>
);

export const MindMapFloatingBarDivider = () => <div className={styles.divider} />;
