/** Empty-state onboarding for a mind map that only contains its root node. */
import React, { useCallback, useEffect, useId, useState } from 'react';
import { BrainCircuit, WandSparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { getMindElixirInstance } from './mindElixirStore';
import { generateMindMapFromPrompt } from './mindmapAIService';
import { cleanMindMapData, refreshMindElixirWithSanitizedData } from './mindmapTreeSanitizer';
import { logMindmapEmptyGuideCheckFailure } from './mindmapPanelLogging';
import { bindMindMapEmptyState, readMindMapEmptyState } from './mindMapEmptyState';
import styles from './MindMapEmptyGuide.module.css';

const TIPS = [
    { key: 'Tab', labelKey: 'addChild' },
    { key: 'Enter', labelKey: 'addSibling' },
    { key: 'F2', labelKey: 'editNode' },
    { key: 'Ctrl+F', labelKey: 'search' },
    { key: 'Ctrl+Z', labelKey: 'undo' },
] as const;

const MindMapEmptyGuide: React.FC = () => {
    const { t } = useTranslation();
    const titleId = useId();
    const [isEmpty, setIsEmpty] = useState(false);
    const [visible, setVisible] = useState(true);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const mind = getMindElixirInstance();

    const checkEmpty = useCallback(() => {
        try {
            if (mind) setIsEmpty(readMindMapEmptyState(mind));
        } catch (caughtError) {
            logMindmapEmptyGuideCheckFailure(caughtError);
        }
    }, [mind]);

    const handleAIGenerate = async () => {
        if (!mind || !prompt.trim() || loading) return;
        setLoading(true);
        setError('');
        try {
            const result = await generateMindMapFromPrompt(prompt.trim());
            if ('error' in result) {
                setError(result.error || t('plugins.mindmap.emptyGuide.generateFailed'));
            } else {
                refreshMindElixirWithSanitizedData(mind, cleanMindMapData({ nodeData: result.nodeData }));
                mind.toCenter();
                setPrompt('');
                checkEmpty();
            }
        } catch (caughtError: unknown) {
            setError(caughtError instanceof Error
                ? caughtError.message
                : t('plugins.mindmap.emptyGuide.requestFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!mind) return;
        return bindMindMapEmptyState({
            mind,
            onChange: setIsEmpty,
            onFailure: logMindmapEmptyGuideCheckFailure,
        });
    }, [mind]);

    if (!isEmpty || !visible) return null;

    return (
        <section className={styles.guide} role="region" aria-labelledby={titleId}>
            <div className={styles.card}>
                <button
                    type="button"
                    className={styles.dismiss}
                    aria-label={t('plugins.mindmap.emptyGuide.dismissLabel')}
                    title={t('plugins.mindmap.emptyGuide.dismissLabel')}
                    onClick={() => setVisible(false)}
                >
                    <span>{t('plugins.mindmap.emptyGuide.dismiss')}</span>
                    <X size={15} aria-hidden="true" />
                </button>

                <BrainCircuit className={styles.heroIcon} size={28} aria-hidden="true" />
                <h2 id={titleId} className={styles.title}>
                    {t('plugins.mindmap.emptyGuide.title')}
                </h2>
                <p className={styles.description}>
                    {t('plugins.mindmap.emptyGuide.descriptionBefore')}{' '}
                    <kbd className={styles.inlineKey}>Tab</kbd>{' '}
                    {t('plugins.mindmap.emptyGuide.descriptionAfter')}
                </p>

                <div className={styles.aiControls}>
                    <input
                        type="text"
                        aria-label={t('plugins.mindmap.emptyGuide.promptLabel')}
                        placeholder={t('plugins.mindmap.emptyGuide.promptPlaceholder')}
                        value={prompt}
                        onChange={event => setPrompt(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && !loading) void handleAIGenerate();
                        }}
                        disabled={loading}
                        className={styles.prompt}
                    />
                    <button
                        type="button"
                        onClick={() => void handleAIGenerate()}
                        disabled={loading || !prompt.trim()}
                        className={styles.generate}
                    >
                        <WandSparkles size={15} aria-hidden="true" />
                        {loading
                            ? t('plugins.mindmap.emptyGuide.generating')
                            : t('plugins.mindmap.emptyGuide.generate')}
                    </button>
                    {error && (
                        <div className={styles.error} role="alert">
                            {error}
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.tips} aria-label={t('plugins.mindmap.emptyGuide.shortcutsLabel')}>
                {TIPS.map(({ key, labelKey }) => (
                    <div key={key} className={styles.tip}>
                        <kbd>{key}</kbd>
                        <span>{t(`plugins.mindmap.emptyGuide.shortcuts.${labelKey}`)}</span>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default MindMapEmptyGuide;
