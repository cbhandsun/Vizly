import { UploadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import styles from './MindMapFileDropOverlay.module.css';

export interface MindMapFileDropOverlayProps {
    visible: boolean;
}

export function MindMapFileDropOverlay({ visible }: MindMapFileDropOverlayProps) {
    const { t } = useTranslation();
    if (!visible) return null;

    return (
        <div className={styles.backdrop}>
            <div
                className={styles.message}
                role="status"
                aria-atomic="true"
                aria-live="polite"
            >
                <UploadOutlined className={styles.icon} aria-hidden="true" />
                <span className={styles.copy}>
                    <strong>{t('plugins.mindmap.fileDrop.title')}</strong>
                    <span>{t('plugins.mindmap.fileDrop.description')}</span>
                </span>
            </div>
        </div>
    );
}
