import React, { useId, useState } from 'react';
import { LinkOutlined } from '@ant-design/icons';
import { Input } from 'antd';

import { toSafeExternalUrl } from '../../utils/sanitizeHtml';
import styles from './MindMapPropertyLinkField.module.css';

interface MindMapPropertyLinkFieldProps {
    initialValue: string;
    invalidMessage: string;
    label: string;
    onCommit: (value: string | undefined) => void;
}

export const MindMapPropertyLinkField: React.FC<MindMapPropertyLinkFieldProps> = ({
    initialValue,
    invalidMessage,
    label,
    onCommit,
}) => {
    const [draft, setDraft] = useState(initialValue);
    const [error, setError] = useState('');
    const [syncedInitialValue, setSyncedInitialValue] = useState(initialValue);
    const errorId = useId();

    if (syncedInitialValue !== initialValue) {
        setSyncedInitialValue(initialValue);
        setDraft(initialValue);
        setError('');
    }

    const commit = () => {
        const trimmed = draft.trim();
        if (!trimmed) {
            setDraft('');
            setError('');
            if (initialValue) onCommit(undefined);
            return;
        }

        const safeUrl = toSafeExternalUrl(trimmed);
        if (!safeUrl) {
            setError(invalidMessage);
            return;
        }

        setDraft(safeUrl);
        setError('');
        if (safeUrl !== initialValue) onCommit(safeUrl);
    };

    return (
        <div>
            <Input
                prefix={<LinkOutlined aria-hidden="true" className={styles.mutedIcon} />}
                aria-label={label}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? errorId : undefined}
                placeholder="https://..."
                value={draft}
                size="small"
                onChange={event => {
                    setDraft(event.target.value);
                    setError('');
                }}
                onBlur={commit}
                onPressEnter={event => {
                    event.preventDefault();
                    commit();
                }}
            />
            {error && (
                <div id={errorId} className={styles.error} role="alert">
                    {error}
                </div>
            )}
        </div>
    );
};
