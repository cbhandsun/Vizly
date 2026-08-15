/** Empty-state onboarding for a mind map that only contains its root node. */
import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { BrainCircuit, WandSparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
    getMindElixirInstance,
    subscribeAIPanel,
    subscribeMindElixir,
} from './mindElixirStore';
import { generateMindMapFromPrompt } from './mindmapAIService';
import {
    cleanMindMapData,
    cleanMindMapTopic,
    MINDMAP_MAX_TOPIC_LENGTH,
    refreshMindElixirWithSanitizedData,
} from './mindmapTreeSanitizer';
import { logMindmapEmptyGuideCheckFailure } from './mindmapPanelLogging';
import { bindMindMapEmptyState, readMindMapEmptyState } from './mindMapEmptyState';
import { createMindMapAIRequestLifecycle } from './mindMapAIPanelRequestLifecycle';
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
    const [aiPanelOpen, setAIPanelOpen] = useState(false);
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mind, setMind] = useState(() => getMindElixirInstance());
    const requestLifecycle = useMemo(() => createMindMapAIRequestLifecycle(), []);

    const invalidatePendingRequest = useCallback(() => {
        requestLifecycle.invalidate();
        setLoading(false);
        setError('');
    }, [requestLifecycle]);

    useEffect(() => subscribeMindElixir(nextMind => {
        invalidatePendingRequest();
        setMind(nextMind);
    }), [invalidatePendingRequest]);

    useEffect(() => {
        const unsubscribe = subscribeAIPanel(nextOpen => {
            if (nextOpen) invalidatePendingRequest();
            setAIPanelOpen(nextOpen);
        });
        return () => {
            unsubscribe();
            requestLifecycle.invalidate();
        };
    }, [invalidatePendingRequest, requestLifecycle]);

    const updateEmptyState = useCallback((nextEmpty: boolean) => {
        if (!nextEmpty) invalidatePendingRequest();
        setIsEmpty(nextEmpty);
    }, [invalidatePendingRequest]);

    const isCurrentRequestContext = useCallback((requestId: number) => {
        if (!mind || !requestLifecycle.isCurrent(requestId)) {
            return false;
        }
        try {
            return readMindMapEmptyState(mind);
        } catch (caughtError) {
            logMindmapEmptyGuideCheckFailure(caughtError);
            return false;
        }
    }, [mind, requestLifecycle]);

    const handleAIGenerate = async () => {
        const requestedPrompt = cleanMindMapTopic(prompt.trim(), '');
        if (!mind || !requestedPrompt || loading) return;
        const requestId = requestLifecycle.begin();
        setLoading(true);
        setError('');
        try {
            const result = await generateMindMapFromPrompt(requestedPrompt);
            if (!isCurrentRequestContext(requestId)) return;
            if ('error' in result) {
                setError(result.error || t('plugins.mindmap.emptyGuide.generateFailed'));
            } else {
                refreshMindElixirWithSanitizedData(mind, cleanMindMapData({ nodeData: result.nodeData }));
                mind.toCenter();
                setPrompt('');
            }
        } catch {
            if (isCurrentRequestContext(requestId)) {
                setError(t('plugins.mindmap.emptyGuide.requestFailed'));
            }
        } finally {
            if (requestLifecycle.isCurrent(requestId)) setLoading(false);
        }
    };

    const handleDismiss = useCallback(() => {
        invalidatePendingRequest();
        setVisible(false);
    }, [invalidatePendingRequest]);

    useEffect(() => {
        if (!mind) return;
        return bindMindMapEmptyState({
            mind,
            onChange: updateEmptyState,
            onFailure: logMindmapEmptyGuideCheckFailure,
        });
    }, [mind, updateEmptyState]);

    if (!isEmpty || !visible || aiPanelOpen) return null;

    return (
        <section className={styles.guide} role="region" aria-labelledby={titleId}>
            <div className={styles.card}>
                <button
                    type="button"
                    className={styles.dismiss}
                    aria-label={t('plugins.mindmap.emptyGuide.dismissLabel')}
                    title={t('plugins.mindmap.emptyGuide.dismissLabel')}
                    onClick={handleDismiss}
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
                        maxLength={MINDMAP_MAX_TOPIC_LENGTH}
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
