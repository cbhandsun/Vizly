import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';

import {
    aiConversationService,
    type Conversation,
    type Message,
} from '@/services/ai/AIConversationService';
import {
    buildAnalysisContext,
    buildDiagramContext,
    DIAGRAM_SYSTEM_PROMPT,
    enhanceWithSlashCommand,
    MINDMAP_SYSTEM_PROMPT,
} from '@/services/ai/diagramPrompts';
import {
    formatAIProviderRequestError,
    requestAIChatCompletion,
    resolveAIProviderEndpoint,
} from '@/services/ai/aiProviderClient';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { getAIConfig, persistAIConfig } from './aiConfigStorage';
import { createAIChatMessageId } from './aiChatConversationModel';
import {
    buildAIChatConversationUpdate,
    createAIChatPendingMessageState,
} from './aiChatConversationState';
import { persistAIChatAssistantSnapshot } from './aiChatConversationPersistence';
import {
    resolveAIChatActiveModelSelection,
    validateAIChatRequestSelection,
} from './aiChatRequestConfig';
import {
    buildAIChatRequestMessages,
    consumeAIChatStream,
} from './aiChatRequestFlow';
import { parseAIStreamDelta } from './aiStreamParsing';
import {
    logAIChatCancelFailure,
    logAIChatEndpointValidationFailure,
} from './aiLogging';
import type { AIChatPanelProps } from './types';

interface UseAIChatRequestLifecycleOptions {
    t: TFunction;
    userId?: string;
    inputValue: string;
    setInputValue: (value: string) => void;
    setShowCommands: (visible: boolean) => void;
    activeId: string | null;
    messages: Message[];
    setConversations: (conversations: Conversation[]) => void;
    pluginId?: string;
    diagramNodesRef: AIChatPanelProps['diagramNodesRef'];
    diagramEdgesRef: AIChatPanelProps['diagramEdgesRef'];
    canvasOps: AIChatPanelProps['canvasOps'];
    onOpenConfig: () => void;
    processCommands: (content: string) => Promise<unknown> | unknown;
}

const isAbortError = (error: unknown): boolean => (
    error instanceof DOMException && error.name === 'AbortError'
);

export function useAIChatRequestLifecycle({
    t,
    userId,
    inputValue,
    setInputValue,
    setShowCommands,
    activeId,
    messages,
    setConversations,
    pluginId,
    diagramNodesRef,
    diagramEdgesRef,
    canvasOps,
    onOpenConfig,
    processCommands,
}: UseAIChatRequestLifecycleOptions) {
    const [loading, setLoading] = useState(false);
    const activeRequestControllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => {
        activeRequestControllerRef.current?.abort(new DOMException('AI chat panel unmounted', 'AbortError'));
        activeRequestControllerRef.current = null;
    }, []);

    const handleStopGeneration = () => {
        activeRequestControllerRef.current?.abort(new DOMException('用户已停止生成', 'AbortError'));
    };

    const sendAIMessage = async () => {
        if (loading || !inputValue.trim()) return;

        let config = getAIConfig(userId);
        const modelSelection = resolveAIChatActiveModelSelection(config);
        const activeProvider = modelSelection.provider;
        const activeModel = modelSelection.model;

        if (modelSelection.autoSwitched && activeProvider && activeModel) {
            persistAIConfig(userId, modelSelection.nextConfig);
            config = modelSelection.nextConfig;
            appMessage.info(t('aiChat.autoSwitched', { name: `${activeProvider.name} - ${activeModel.name}` }));
        }

        const validation = validateAIChatRequestSelection(modelSelection, (provider) => {
            resolveAIProviderEndpoint(provider, '/chat/completions');
        });
        if (!validation.ok) {
            if (validation.reason === 'missing-model') {
                appMessage.warning('没有找到可用的模型，请先在设置中启用模型');
            } else if (validation.reason === 'missing-api-key' && activeProvider) {
                appMessage.warning(`请先在 AI 设置中配置 ${activeProvider.name} 的 API Key`);
            } else if (validation.reason === 'invalid-endpoint' && activeProvider) {
                logAIChatEndpointValidationFailure(activeProvider.name, new Error('invalid-endpoint'));
                appMessage.warning(`${activeProvider.name} 的 Base URL 必须使用 HTTPS，或本机 HTTP localhost/127.0.0.1。`);
            }
            onOpenConfig();
            return;
        }

        const pending = createAIChatPendingMessageState(messages, inputValue, createAIChatMessageId);
        const newUserMessage = pending.newUserMessage;
        const assistantMessageId = pending.newAssistantMessage.id;

        if (activeId) {
            const updates: Partial<Conversation> = { messages: pending.updatedMessages };
            if (messages.length <= 1) updates.title = aiConversationService.generateTitle(inputValue);
            aiConversationService.updateConversation(activeId, updates);
            setConversations(aiConversationService.getConversations());
        }

        setInputValue('');
        setShowCommands(false);
        setLoading(true);
        const requestController = new AbortController();
        activeRequestControllerRef.current = requestController;
        let accumulatedContent = '';
        let accumulatedReasoning = '';

        try {
            const systemPrompt = pluginId === 'mindmap'
                ? MINDMAP_SYSTEM_PROMPT
                : (config.systemPrompt || DIAGRAM_SYSTEM_PROMPT);
            const diagramNodes = diagramNodesRef?.current || [];
            const diagramEdges = diagramEdgesRef?.current || [];
            const requestMessages = buildAIChatRequestMessages({
                systemPrompt,
                pluginId,
                historyMessages: messages,
                userContent: enhanceWithSlashCommand(newUserMessage.content)
                    + buildDiagramContext(diagramNodes, diagramEdges)
                    + (newUserMessage.content.trim().startsWith('/analyze')
                        ? (canvasOps?.onAnalyze
                            ? `\n\n[实时图表巡检报告]\n${canvasOps.onAnalyze().summary}`
                            : buildAnalysisContext(diagramNodes, diagramEdges))
                        : ''),
            });
            const response = await requestAIChatCompletion(validation.provider, {
                model: validation.model.id,
                messages: requestMessages,
                stream: true,
            }, { signal: requestController.signal, timeoutMs: 120_000 });

            const reader = response.body?.getReader();
            let lastUpdateTimestamp = Date.now();
            if (reader) {
                const streamState = await consumeAIChatStream({
                    reader,
                    signal: requestController.signal,
                    parseDelta: parseAIStreamDelta,
                    onAbortReader: () => {
                        void reader.cancel().catch(logAIChatCancelFailure);
                    },
                    onDelta: (state) => {
                        accumulatedContent = state.content;
                        accumulatedReasoning = state.reasoningContent;
                        if (!activeId || Date.now() - lastUpdateTimestamp <= 60) return;

                        const current = [...aiConversationService.getConversations()];
                        const index = current.findIndex(conversation => conversation.id === activeId);
                        if (index !== -1) {
                            current[index].messages = buildAIChatConversationUpdate(
                                current[index],
                                assistantMessageId,
                                state,
                                { isStreaming: true },
                            ).messages || current[index].messages;
                            setConversations(current);
                        }
                        lastUpdateTimestamp = Date.now();
                    },
                });
                accumulatedContent = streamState.content;
                accumulatedReasoning = streamState.reasoningContent;
            }

            await processCommands(accumulatedContent);
            if (activeId) {
                setConversations(persistAIChatAssistantSnapshot(
                    aiConversationService,
                    activeId,
                    assistantMessageId,
                    { content: accumulatedContent, reasoningContent: accumulatedReasoning },
                ));
            }
        } catch (error) {
            if (isAbortError(error)) {
                if (activeId) {
                    setConversations(persistAIChatAssistantSnapshot(
                        aiConversationService,
                        activeId,
                        assistantMessageId,
                        { content: accumulatedContent, reasoningContent: accumulatedReasoning },
                        { fallbackContent: '已停止生成' },
                    ));
                }
                return;
            }

            const safeError = formatAIProviderRequestError(error);
            appMessage.error(t('aiChat.requestFailed', { error: safeError }));
            if (activeId) {
                setConversations(persistAIChatAssistantSnapshot(
                    aiConversationService,
                    activeId,
                    assistantMessageId,
                    { content: '', reasoningContent: '' },
                    { fallbackContent: t('aiChat.requestError', { error: safeError }) },
                ));
            }
        } finally {
            if (activeRequestControllerRef.current === requestController) {
                activeRequestControllerRef.current = null;
            }
            setLoading(false);
        }
    };

    return { loading, handleStopGeneration, sendAIMessage };
}
