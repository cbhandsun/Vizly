import { buildAIEditPrompt, createAIEditContext, type AIEditScope } from './aiCanvasEdit';
import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import { captureAuthSession, getAuthSessionRevision, onAuthSessionInvalidated } from '@/context/authSessionBoundary';
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
    AIProviderInvalidResponseError,
    resolveAIProviderEndpoint,
} from '@/services/ai/aiProviderClient';
import { requestAIChatCompletionRouted } from '@/services/ai/aiRequestRouter';
import { appMessage } from '@vizly/core/antd';
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
import type { AIValidatedCommand } from './aiCommandExtraction';
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
    setConversations: Dispatch<SetStateAction<Conversation[]>>;
    pluginId?: string;
    diagramId?: string;
    editScope?: AIEditScope;
    diagramNodesRef: AIChatPanelProps['diagramNodesRef'];
    diagramEdgesRef: AIChatPanelProps['diagramEdgesRef'];
    canvasOps: AIChatPanelProps['canvasOps'];
    onOpenConfig: () => void;
    processCommands: (content: string, signal?: AbortSignal) => Promise<unknown> | unknown;
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
    diagramId,
    editScope = 'generate',
    diagramNodesRef,
    diagramEdgesRef,
    canvasOps,
    onOpenConfig,
    processCommands,
}: UseAIChatRequestLifecycleOptions) {
    const revision = useSyncExternalStore(onAuthSessionInvalidated, getAuthSessionRevision, getAuthSessionRevision);
    const [requestState, setRequestState] = useState({ owner: userId, revision, activeId, diagramId, loading: false });
    const loading = requestState.owner === userId && requestState.revision === revision
        && requestState.activeId === activeId && requestState.diagramId === diagramId && requestState.loading;
    const setLoading = (value: boolean) => setRequestState({ owner: userId, revision, activeId, diagramId, loading: value });
    const activeRequestControllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => {
        activeRequestControllerRef.current?.abort(new DOMException('AI chat panel unmounted', 'AbortError'));
        activeRequestControllerRef.current = null;
    }, [userId, revision, activeId, diagramId]);

    const handleStopGeneration = () => {
        activeRequestControllerRef.current?.abort(new DOMException('用户已停止生成', 'AbortError'));
    };

    const sendAIMessage = async () => {
        const session = captureAuthSession(userId);
        if (loading || activeRequestControllerRef.current || !inputValue.trim() || !session.isCurrent()) return;

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

        const graph = { nodes: diagramNodesRef?.current || [], edges: diagramEdgesRef?.current || [] };
        let editContext;
        let editPrompt = '';
        try {
            editContext = createAIEditContext(graph, diagramId || '', editScope);
            if (editContext) editPrompt = buildAIEditPrompt(graph, editContext);
        } catch (error) {
            appMessage.warning(t(error instanceof Error ? error.message : 'aiChat.edit.invalid'));
            return;
        }
        const pending = createAIChatPendingMessageState(messages, inputValue, createAIChatMessageId);
        pending.newAssistantMessage.editContext = editContext;
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
        let structuredToolCalls: AIValidatedCommand[] = [];

        try {
            const basePrompt = pluginId === 'mindmap' ? MINDMAP_SYSTEM_PROMPT : DIAGRAM_SYSTEM_PROMPT;
            const customUserPrompt = config.systemPrompt?.trim();
            const systemPrompt = customUserPrompt
                ? `${basePrompt}\n\n## 用户个性化偏好与自定义指令 (Custom Instructions)\n${customUserPrompt}`
                : basePrompt;
            const diagramNodes = diagramNodesRef?.current || [];
            const diagramEdges = diagramEdgesRef?.current || [];
            const requestMessages = buildAIChatRequestMessages({
                systemPrompt,
                pluginId,
                historyMessages: messages,
                userContent: enhanceWithSlashCommand(newUserMessage.content)
                    + (editContext ? editPrompt : buildDiagramContext(diagramNodes, diagramEdges))
                    + (newUserMessage.content.trim().startsWith('/analyze')
                        ? (canvasOps?.onAnalyze
                            ? `\n\n[实时图表巡检报告]\n${canvasOps.onAnalyze().summary}`
                            : buildAnalysisContext(diagramNodes, diagramEdges))
                        : ''),
            });
            const response = await requestAIChatCompletionRouted(validation.provider, {
                model: validation.model.id,
                messages: requestMessages,
                stream: true,
            }, { signal: AbortSignal.any([requestController.signal, session.signal]), timeoutMs: 120_000, toolMode: editContext ? 'none' : 'diagram' });

            if (!session.isCurrent()) {
                await response.body?.cancel();
                return;
            }
            const reader = response.body?.getReader();
            let lastUpdateTimestamp = Date.now();
            if (reader) {
                const streamState = await consumeAIChatStream({
                    reader,
                    signal: AbortSignal.any([requestController.signal, session.signal]),
                    parseDelta: parseAIStreamDelta,
                    onAbortReader: () => {
                        void reader.cancel().catch(logAIChatCancelFailure);
                    },
                    onDelta: (state) => {
                        if (!session.isCurrent()) return;
                        accumulatedContent = state.content;
                        accumulatedReasoning = state.reasoningContent;
                        structuredToolCalls = state.toolCalls;
                        if (!activeId || Date.now() - lastUpdateTimestamp <= 60) return;

                        setConversations(current => !session.isCurrent() ? current : current.map(conversation => conversation.id === activeId
                            ? { ...conversation, ...buildAIChatConversationUpdate(
                                conversation, assistantMessageId, state, { isStreaming: true },
                            ) }
                            : conversation));
                        lastUpdateTimestamp = Date.now();
                    },
                });
                accumulatedContent = streamState.content;
                accumulatedReasoning = streamState.reasoningContent;
                structuredToolCalls = streamState.toolCalls;
            }

            if (!session.isCurrent()) return;
            requestController.signal.throwIfAborted();
            if (!accumulatedContent && !accumulatedReasoning && !structuredToolCalls.length) {
                throw new AIProviderInvalidResponseError('AI 服务未返回有效内容，请重试或检查模型的流式响应支持。');
            }
            const structuredCommandContent = structuredToolCalls
                .map(command => `[COMMAND: ${JSON.stringify(command)}]`)
                .join('\n');
            if (!editContext) await processCommands(
                structuredCommandContent
                    ? `${accumulatedContent}\n${structuredCommandContent}`
                    : accumulatedContent,
                AbortSignal.any([requestController.signal, session.signal]),
            );
            requestController.signal.throwIfAborted();
            if (session.isCurrent() && activeId) {
                setConversations(persistAIChatAssistantSnapshot(
                    aiConversationService,
                    activeId,
                    assistantMessageId,
                    { content: accumulatedContent, reasoningContent: accumulatedReasoning },
                ));
            }
        } catch (error) {
            if (!session.isCurrent()) return;
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
            if (session.isCurrent() && activeId) {
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
                if (session.isCurrent()) setLoading(false);
            }
        }
    };

    return { loading, handleStopGeneration, sendAIMessage };
}
