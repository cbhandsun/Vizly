import React, { useId } from 'react';
import { Input } from 'antd';

import { MINDMAP_MAX_TOPIC_LENGTH } from './mindmapTreeSanitizer';
import {
    type RecoverableMindMapPropertyTopicOptions,
    useRecoverableMindMapPropertyTopic,
} from './useRecoverableMindMapPropertyTopic';
import styles from './MindMapPropertyTopicField.module.css';

const { TextArea } = Input;

interface MindMapPropertyTopicFieldProps extends RecoverableMindMapPropertyTopicOptions {
    label: string;
    savingMessage: string;
}

export const MindMapPropertyTopicField: React.FC<MindMapPropertyTopicFieldProps> = ({
    failureMessage,
    initialValue,
    label,
    onCommit,
    requiredMessage,
    savingMessage,
    sourceKey,
}) => {
    const transaction = useRecoverableMindMapPropertyTopic({
        failureMessage,
        initialValue,
        onCommit,
        requiredMessage,
        sourceKey,
    });
    const statusId = useId();
    const errorId = useId();
    const describedBy = transaction.error
        ? errorId
        : transaction.saving ? statusId : undefined;

    return (
        <div>
            <TextArea
                aria-busy={transaction.saving}
                aria-describedby={describedBy}
                aria-invalid={Boolean(transaction.error)}
                aria-label={label}
                autoSize={{ minRows: 1, maxRows: 4 }}
                className={styles.input}
                disabled={transaction.saving}
                maxLength={MINDMAP_MAX_TOPIC_LENGTH}
                onBlur={transaction.commit}
                onChange={event => transaction.setDraft(event.target.value)}
                onPressEnter={event => {
                    event.preventDefault();
                    transaction.commit();
                }}
                value={transaction.draft}
            />
            <div className={styles.feedback}>
                {transaction.saving
                    ? <div id={statusId} className={styles.status} role="status" aria-live="polite">{savingMessage}</div>
                    : null}
                {transaction.error
                    ? <div id={errorId} className={styles.error} role="alert">{transaction.error}</div>
                    : null}
            </div>
        </div>
    );
};
