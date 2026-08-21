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
    const [state, setState] = useState(() => ({
        committedValue: initialValue || undefined,
        draft: initialValue,
        error: '',
        sourceValue: initialValue,
    }));
    const errorId = useId();

    if (state.sourceValue !== initialValue) {
        setState({
            committedValue: initialValue || undefined,
            draft: initialValue,
            error: '',
            sourceValue: initialValue,
        });
    }

    const commit = () => {
        const trimmed = state.draft.trim();
        if (!trimmed) {
            setState(current => ({
                ...current,
                committedValue: undefined,
                draft: '',
                error: '',
            }));
            if (state.committedValue !== undefined) onCommit(undefined);
            return;
        }

        const safeUrl = toSafeExternalUrl(trimmed);
        if (!safeUrl) {
            setState(current => ({ ...current, error: invalidMessage }));
            return;
        }

        setState(current => ({
            ...current,
            committedValue: safeUrl,
            draft: safeUrl,
            error: '',
        }));
        if (state.committedValue !== safeUrl) onCommit(safeUrl);
    };

    return (
        <div>
            <Input
                prefix={<LinkOutlined aria-hidden="true" className={styles.mutedIcon} />}
                aria-label={label}
                aria-invalid={Boolean(state.error)}
                aria-describedby={state.error ? errorId : undefined}
                placeholder="https://..."
                value={state.draft}
                size="small"
                onChange={event => {
                    setState(current => ({
                        ...current,
                        draft: event.target.value,
                        error: '',
                    }));
                }}
                onBlur={commit}
                onPressEnter={event => {
                    event.preventDefault();
                    commit();
                }}
            />
            {state.error && (
                <div id={errorId} className={styles.error} role="alert">
                    {state.error}
                </div>
            )}
        </div>
    );
};
