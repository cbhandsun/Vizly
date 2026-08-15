import React, { useCallback, useEffect, useState, useRef } from 'react';
import type { NodeObj } from 'mind-elixir';
import { useTranslation } from 'react-i18next';
import { getMindElixirInstance, getPresentationState, subscribePresentation } from './mindElixirStore';
import { generateSpeakerNotes } from './mindmapAIService';
import { isMindMapAIConfigurationError } from './mindMapAIErrorPresentation';
import { mergeSpeakerNotesIntoNodeNote } from './mindmapSpeakerNotesSecurity';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { logMindmapSpeakerNotesSaveFailure } from './mindmapPanelLogging';
import { Spin, Button, Select, Tooltip } from 'antd';
import { CloseOutlined, CopyOutlined, ReloadOutlined, SaveOutlined, MessageOutlined, SoundOutlined } from '@ant-design/icons';
import { appMessage } from '@/core/utils/antdStaticBridge';
import './MindMapSpeakerNotes.css';

const TONE_VALUES = ['专业商务', '幽默风趣', '通俗易懂', '严谨理性'] as const;

export const MindMapSpeakerNotes: React.FC = () => {
    const { t } = useTranslation();
    const [isPresenting, setIsPresenting] = useState(false);
    const [currentNode, setCurrentNode] = useState<NodeObj | null>(null);
    const [notes, setNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [tone, setTone] = useState('专业商务');
    const [error, setError] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [saving, setSaving] = useState(false);

    // 缓存上一次请求的节点ID和语气，避免重复请求
    const lastRequestKeyRef = useRef<string>('');
    const activeRequestIdRef = useRef(0);
    const activeSaveIdRef = useRef(0);
    const presentationNodeIdRef = useRef<string | null>(null);
    const dismissedRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const toneOptions = TONE_VALUES.map((value) => ({
        value,
        label: t(`plugins.mindmap.speakerNotes.tones.${value}`),
    }));

    const fetchNotes = useCallback(async (node: NodeObj, currentTone: string) => {
        const nodeId = node.id;
        const requestKey = `${nodeId}_${currentTone}`;
        const noteText = node.note || undefined;
        const childText = node.children && node.children.length > 0
            ? node.children.map(c => c.topic).join('，')
            : undefined;

        const requestId = activeRequestIdRef.current + 1;
        activeRequestIdRef.current = requestId;
        setLoading(true);
        setError(null);

        const requestIsCurrent = () => {
            const presentation = getPresentationState();
            return activeRequestIdRef.current === requestId
                && !dismissedRef.current
                && presentation.isPresenting
                && presentation.presentationNode?.id === nodeId;
        };

        try {
            const result = await generateSpeakerNotes(node.topic, noteText, childText, currentTone);
            if (!requestIsCurrent()) return;

            if ('error' in result) {
                setError(result.error || '请求失败，请重试');
                setNotes('');
            } else {
                setNotes(result.notes);
                lastRequestKeyRef.current = requestKey;
            }
        } catch {
            if (requestIsCurrent()) {
                setError('请求失败，请重试');
                setNotes('');
            }
        } finally {
            if (requestIsCurrent()) setLoading(false);
        }
    }, []);

    // 订阅演示状态
    useEffect(() => {
        const syncState = () => {
            const state = getPresentationState();
            const nextNodeId = state.presentationNode?.id ?? null;
            if (presentationNodeIdRef.current !== nextNodeId) {
                activeRequestIdRef.current += 1;
                activeSaveIdRef.current += 1;
                lastRequestKeyRef.current = '';
                setNotes('');
                setError(null);
                setLoading(false);
                setSaving(false);
            }
            presentationNodeIdRef.current = nextNodeId;
            setIsPresenting(state.isPresenting);
            setCurrentNode(state.presentationNode);
            if (!state.isPresenting || !state.presentationNode) {
                dismissedRef.current = false;
                setDismissed(false);
                activeRequestIdRef.current += 1;
                activeSaveIdRef.current += 1;
                lastRequestKeyRef.current = '';
                setNotes('');
                setError(null);
                setLoading(false);
                setSaving(false);
            }
        };
        syncState();
        return subscribePresentation(syncState);
    }, []);

    // 监听节点或语气变化
    useEffect(() => {
        if (!isPresenting || !currentNode || dismissedRef.current) {
            return;
        }

        const nodeId = currentNode.id;
        const requestKey = `${nodeId}_${tone}`;

        // 如果节点和语气都没变，不重新请求
        if (lastRequestKeyRef.current === requestKey) {
            return;
        }

        activeRequestIdRef.current += 1;
        setNotes('');
        setError(null);
        setLoading(true);

        // 清理上一次的 debounce 定时器
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // Debounce 400ms 请求 AI
        debounceTimerRef.current = setTimeout(() => {
            void fetchNotes(currentNode, tone);
        }, 400);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [currentNode, fetchNotes, tone, isPresenting]);

    const handleRetry = () => {
        if (!currentNode) return;
        lastRequestKeyRef.current = ''; // 清空缓存以强制重新生成
        void fetchNotes(currentNode, tone);
    };

    const handleDismiss = () => {
        dismissedRef.current = true;
        setDismissed(true);
        activeRequestIdRef.current += 1;
        activeSaveIdRef.current += 1;
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        setLoading(false);
        setSaving(false);
    };

    const handleCopyNotes = async () => {
        if (!notes.trim()) return;
        try {
            await navigator.clipboard.writeText(notes);
            appMessage.success(t('plugins.mindmap.speakerNotes.copySuccess'));
        } catch {
            appMessage.error(t('plugins.mindmap.speakerNotes.copyFailed'));
        }
    };

    const handleSaveNotes = async () => {
        if (!currentNode || !notes.trim() || saving) return;
        const mind = getMindElixirInstance();
        if (!mind) return;

        const nodeId = currentNode.id;
        const saveId = activeSaveIdRef.current + 1;
        activeSaveIdRef.current = saveId;
        setSaving(true);
        const saveIsCurrent = () => {
            const presentation = getPresentationState();
            return activeSaveIdRef.current === saveId
                && !dismissedRef.current
                && presentation.isPresenting
                && presentation.presentationNode?.id === nodeId;
        };

        try {
            const tpcEl = mind.findEle(nodeId);
            if (!tpcEl) throw new Error('Speaker notes target node is unavailable');
            const nextNote = mergeSpeakerNotesIntoNodeNote(currentNode.note, notes);
            const cleanPatch = cleanMindMapNodePatch({ note: nextNote });
            await mind.reshapeNode(tpcEl, { ...currentNode, ...cleanPatch });
            const changedNode = { ...currentNode, ...cleanPatch };
            mind.bus.fire('operation', {
                name: 'reshapeNode',
                obj: changedNode,
                origin: currentNode,
            });
            if (!saveIsCurrent()) return;
            setCurrentNode(changedNode);
            appMessage.success(t('plugins.mindmap.speakerNotes.saveSuccess'));
        } catch (err) {
            logMindmapSpeakerNotesSaveFailure(err);
            if (saveIsCurrent()) {
                appMessage.error(t('plugins.mindmap.speakerNotes.saveFailed'));
            }
        } finally {
            if (activeSaveIdRef.current === saveId) setSaving(false);
        }
    };

    if (!isPresenting || !currentNode || dismissed) return null;

    const isConfigurationError = isMindMapAIConfigurationError(error);
    const presentedError = isConfigurationError
        ? t('plugins.mindmap.speakerNotes.configurationRequired')
        : error;
    const isPending = !error && !notes.trim();

    if (isPending || error) {
        return (
            <aside
                style={compactContainerStyle}
                aria-label={t('plugins.mindmap.speakerNotes.panelLabel')}
                data-testid="mindmap-speaker-notes-compact"
            >
                <div style={compactHeaderStyle}>
                    <div style={titleWrapperStyle}>
                        <MessageOutlined style={{ color: '#818cf8', fontSize: 16 }} aria-hidden="true" />
                        <span style={titleStyle}>{t('plugins.mindmap.speakerNotes.title')}</span>
                    </div>
                    <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={handleDismiss}
                        aria-label={t('plugins.mindmap.speakerNotes.dismiss')}
                        style={iconButtonStyle}
                    />
                </div>
                {error ? (
                    <div style={compactErrorStyle} role="alert">
                        <span style={errorTextStyle}>{presentedError}</span>
                        <span style={compactHintStyle}>
                            {t(isConfigurationError
                                ? 'plugins.mindmap.speakerNotes.configurationHint'
                                : 'plugins.mindmap.speakerNotes.failureHint')}
                        </span>
                        {!isConfigurationError && (
                            <Button type="default" size="small" onClick={handleRetry}>
                                {t('plugins.mindmap.speakerNotes.retry')}
                            </Button>
                        )}
                    </div>
                ) : (
                    <div style={compactLoadingStyle} role="status" aria-live="polite">
                        <Spin size="medium" />
                        <span>{t('plugins.mindmap.speakerNotes.loading')}</span>
                    </div>
                )}
            </aside>
        );
    }

    return (
        <aside
            style={containerStyle}
            aria-label={t('plugins.mindmap.speakerNotes.panelLabel')}
            data-testid="mindmap-speaker-notes-panel"
        >
            {/* 磨砂玻璃头部 */}
            <div style={headerStyle}>
                <div style={titleWrapperStyle}>
                    <MessageOutlined style={{ color: '#818cf8', fontSize: 16 }} aria-hidden="true" />
                    <span style={titleStyle}>{t('plugins.mindmap.speakerNotes.title')}</span>
                </div>
                <div style={actionsStyle}>
                    <Select
                        size="small"
                        options={toneOptions}
                        value={tone}
                        onChange={(val) => setTone(val)}
                        aria-label={`${t('plugins.mindmap.speakerNotes.title')} · ${t(`plugins.mindmap.speakerNotes.tones.${tone}`)}`}
                        dropdownStyle={dropdownStyle}
                        style={selectStyle}
                    />
                    <Tooltip title={t('plugins.mindmap.speakerNotes.copy')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={handleCopyNotes}
                            disabled={!notes.trim() || loading}
                            aria-label={t('plugins.mindmap.speakerNotes.copy')}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                    <Tooltip title={t('plugins.mindmap.speakerNotes.save')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<SaveOutlined />}
                            onClick={handleSaveNotes}
                            disabled={!notes.trim() || loading || saving}
                            loading={saving}
                            aria-label={t('plugins.mindmap.speakerNotes.save')}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                    <Tooltip title={t('plugins.mindmap.speakerNotes.regenerate')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={handleRetry}
                            aria-label={t('plugins.mindmap.speakerNotes.regenerate')}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                    <Tooltip title={t('plugins.mindmap.speakerNotes.dismiss')}>
                        <Button
                            type="text"
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={handleDismiss}
                            aria-label={t('plugins.mindmap.speakerNotes.dismiss')}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 提词主体部分 */}
            <div style={contentStyle}>
                <div style={nodeInfoStyle}>
                    <span style={nodeLabelStyle}>{t('plugins.mindmap.speakerNotes.currentTopic')}</span>
                    <h3 style={nodeTopicStyle}>{currentNode.topic}</h3>
                </div>

                <div style={scrollAreaStyle}>
                    {loading ? (
                        <div style={loadingWrapperStyle}>
                            <Spin size="default" />
                            <span style={loadingTextStyle}>{t('plugins.mindmap.speakerNotes.loading')}</span>
                        </div>
                    ) : error ? (
                        <div style={errorWrapperStyle}>
                            <span style={errorTextStyle}>⚠️ {error}</span>
                            <Button
                                type="primary"
                                size="small"
                                onClick={handleRetry}
                                style={retryButtonStyle}
                            >
                                {t('plugins.mindmap.speakerNotes.retry')}
                            </Button>
                        </div>
                    ) : (
                        <div style={notesTextStyle}>
                            {notes}
                        </div>
                    )}
                </div>
            </div>

            {/* 底部小提示 */}
            <div style={footerStyle}>
                <SoundOutlined style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <span>{t('plugins.mindmap.speakerNotes.wordCount', { count: notes.length })}</span>
            </div>
        </aside>
    );
};

// ─── 磨砂玻璃风格 Inline Styles ──────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'max(12px, env(safe-area-inset-top))',
    right: 'max(12px, env(safe-area-inset-right))',
    bottom: 'max(96px, calc(76px + env(safe-area-inset-bottom)))', // 留出底部 HUD 的空间
    width: 'calc(100vw - 24px)',
    maxWidth: '340px',
    zIndex: 99999, // 必须极高，在全屏模式下覆盖 Canvas 元素
    background: 'rgba(15, 18, 36, 0.72)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'vizlySpeakerNotesSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const compactContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'max(12px, env(safe-area-inset-top))',
    right: 'max(12px, env(safe-area-inset-right))',
    width: 'calc(100vw - 24px)',
    maxWidth: '340px',
    zIndex: 99999,
    padding: '14px 16px',
    background: 'rgba(15, 18, 36, 0.9)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '16px',
    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.32)',
    color: '#fff',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const compactHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
};

const compactErrorStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '8px',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
};

const compactHintStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: '12px',
    lineHeight: 1.5,
};

const compactLoadingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '12px',
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: '12px',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
};

const titleWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const titleStyle: React.CSSProperties = {
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    letterSpacing: '0.5px',
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
};

const selectStyle: React.CSSProperties = {
    width: '110px',
};

const dropdownStyle: React.CSSProperties = {
    background: '#1f2937',
    border: '1px solid rgba(255, 255, 255, 0.1)',
};

const iconButtonStyle: React.CSSProperties = {
    minWidth: '40px',
    minHeight: '40px',
    color: 'rgba(255, 255, 255, 0.65)',
    background: 'transparent',
    border: 'none',
};

const contentStyle: React.CSSProperties = {
    flex: 1,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const nodeInfoStyle: React.CSSProperties = {
    marginBottom: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    padding: '12px 16px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
};

const nodeLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    display: 'block',
    marginBottom: '4px',
};

const nodeTopicStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
};

const scrollAreaStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    paddingRight: '4px',
};

const loadingWrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    height: '150px',
};

const loadingTextStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '12px',
};

const errorWrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '20px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
};

const errorTextStyle: React.CSSProperties = {
    color: '#f87171',
    fontSize: '12px',
    textAlign: 'center',
    lineHeight: '1.6',
};

const retryButtonStyle: React.CSSProperties = {
    background: '#ef4444',
    borderColor: '#ef4444',
};

const notesTextStyle: React.CSSProperties = {
    fontSize: '15px',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: '1.8',
    whiteSpace: 'pre-wrap',
    letterSpacing: '0.4px',
    animation: 'vizlySpeakerNotesFadeIn 0.28s ease',
};

const footerStyle: React.CSSProperties = {
    padding: '12px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
};
