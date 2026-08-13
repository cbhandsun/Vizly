import React, { useId } from 'react';
import { Button, Popover } from 'antd';
import { PlusOutlined, RobotOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { requestMindMapAIConfig } from './mindMapAIConfigEvent';
import styles from './MindMapPropertyAISection.module.css';

interface MindMapPropertyAISectionProps {
    applyingTopic: string | null;
    error: string;
    expanding: boolean;
    hasChildren: boolean;
    needsConfiguration: boolean;
    status: string;
    suggestions: string[];
    summarizing: boolean;
    onApplySuggestion: (topic: string) => void;
    onDismiss: () => void;
    onExpand: () => void;
    onSummarize: () => void;
}

export const MindMapPropertyAISection: React.FC<MindMapPropertyAISectionProps> = ({
    applyingTopic,
    error,
    expanding,
    hasChildren,
    needsConfiguration,
    status,
    suggestions,
    summarizing,
    onApplySuggestion,
    onDismiss,
    onExpand,
    onSummarize,
}) => {
    const { t } = useTranslation();
    const titleId = useId();
    const suggestionsId = useId();
    const open = suggestions.length > 0 || Boolean(error);
    const isApplying = applyingTopic !== null;

    return (
        <section className={styles.section} aria-label={t('plugins.mindmap.propertyAI.sectionLabel')}>
            <Popover
                trigger="click"
                placement="left"
                open={open}
                onOpenChange={nextOpen => { if (!nextOpen) onDismiss(); }}
                title={(
                    <span id={titleId} className={styles.title}>
                        <RobotOutlined aria-hidden="true" />
                        {t('plugins.mindmap.propertyAI.suggestionsTitle')}
                    </span>
                )}
                content={(
                    <div
                        id={suggestionsId}
                        className={styles.popover}
                        role="dialog"
                        aria-labelledby={titleId}
                        aria-busy={isApplying}
                    >
                        {error && (
                            <div className={styles.error} role="alert">
                                <span>{error}</span>
                                {needsConfiguration && (
                                    <button
                                        type="button"
                                        className={styles.recovery}
                                        onClick={requestMindMapAIConfig}
                                    >
                                        {t('plugins.mindmap.propertyAI.openConfiguration')}
                                    </button>
                                )}
                            </div>
                        )}
                        {suggestions.length > 0 && (
                            <ul className={styles.list} aria-label={t('plugins.mindmap.propertyAI.suggestionsList')}>
                                {suggestions.map(suggestion => (
                                    <li key={suggestion}>
                                        <button
                                            type="button"
                                            className={styles.suggestion}
                                            onClick={() => onApplySuggestion(suggestion)}
                                            disabled={isApplying}
                                            aria-label={t('plugins.mindmap.propertyAI.applySuggestion', { topic: suggestion })}
                                        >
                                            <PlusOutlined aria-hidden="true" />
                                            <span>{suggestion}</span>
                                            {applyingTopic === suggestion && (
                                                <span className={styles.pending}>{t('plugins.mindmap.propertyAI.applying')}</span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            >
                <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<RobotOutlined aria-hidden="true" />}
                    onClick={onExpand}
                    loading={expanding}
                    className={styles.action}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-controls={suggestionsId}
                >
                    {t('plugins.mindmap.propertyAI.expand')}
                </Button>
            </Popover>

            {hasChildren && (
                <Button
                    size="small"
                    type="dashed"
                    icon={<RobotOutlined aria-hidden="true" />}
                    onClick={onSummarize}
                    loading={summarizing}
                    className={styles.action}
                >
                    {t('plugins.mindmap.propertyAI.summarize')}
                </Button>
            )}

            <span className={styles.status} role="status" aria-live="polite" aria-atomic="true">
                {status}
            </span>
        </section>
    );
};
