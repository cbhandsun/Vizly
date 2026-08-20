import { useEffect, useMemo, useRef, useState } from 'react';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';

import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { isMindMapAIConfigurationError } from './mindMapAIErrorPresentation';
import { createMindMapAIRequestLifecycle } from './mindMapAIPanelRequestLifecycle';
import { expandNodeWithAI, getAncestorPath, summarizeNodeWithAI } from './mindmapAIService';
import { logMindmapPropertyAiAddChildFailure, logMindmapPropertyAiRequestFailure } from './mindmapPanelLogging';
import { presentMindMapPropertyAIError } from './mindMapPropertyAIError';
import { cleanMindMapTopic } from './mindmapTreeSanitizer';

type Operation = 'apply' | 'expand' | 'summarize';
type Translate = (key: string, values?: { count?: number; topic?: string }) => string;
type RequestToken = { id: number; mind: MindElixirInstance; nodeId: string };
type RequestLifecycle = ReturnType<typeof createMindMapAIRequestLifecycle>;
type AIState = {
    operation: Operation | null;
    suggestions: string[];
    error: string;
    status: string;
    applyingTopic: string | null;
    needsConfiguration: boolean;
    context: RequestLifecycle | null;
};

const EMPTY_STATE: AIState = {
    operation: null,
    suggestions: [],
    error: '',
    status: '',
    applyingTopic: null,
    needsConfiguration: false,
    context: null,
};

const aiKey = (suffix: string): string => `plugins.mindmap.propertyAI.${suffix}`;

export const normalizeMindMapPropertyAISuggestions = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const unique = new Set<string>();
    for (const candidate of value) {
        const topic = cleanMindMapTopic(candidate, '');
        if (topic) unique.add(topic);
        if (unique.size === 7) break;
    }
    return [...unique];
};

export const useMindMapPropertyAI = ({
    mind,
    node,
    translate,
}: { mind: MindElixirInstance | null; node: NodeObj; translate: Translate }) => {
    const requestContext = useMemo(() => ({
        lifecycle: createMindMapAIRequestLifecycle(),
        mind,
        nodeId: node.id,
    }), [mind, node.id]);
    const { lifecycle } = requestContext;
    const operationRef = useRef<Operation | null>(null);
    const [state, setState] = useState<AIState>(EMPTY_STATE);
    const patchState = (patch: Partial<AIState>): void => {
        setState(current => ({ ...current, ...patch }));
    };

    useEffect(() => () => {
        lifecycle.invalidate();
        operationRef.current = null;
    }, [lifecycle]);

    const begin = (operation: Operation, topic: string | null = null): RequestToken | null => {
        if (!mind || operationRef.current) return null;
        operationRef.current = operation;
        const token = { id: lifecycle.begin(), mind, nodeId: node.id };
        setState(current => ({
            ...EMPTY_STATE,
            operation,
            applyingTopic: topic,
            suggestions: operation === 'apply' ? current.suggestions : [],
            context: lifecycle,
        }));
        return token;
    };

    const finish = (token: RequestToken): void => {
        if (!lifecycle.isCurrent(token.id)) return;
        operationRef.current = null;
        patchState({ operation: null, applyingTopic: null });
    };

    const fail = (
        action: 'expand' | 'summarize',
        failure: unknown,
        fallbackKey: string,
    ): void => {
        logMindmapPropertyAiRequestFailure(action, failure);
        const message = typeof failure === 'string' ? failure : '';
        patchState({
            error: presentMindMapPropertyAIError(message, translate, fallbackKey),
            needsConfiguration: isMindMapAIConfigurationError(message),
        });
    };

    const expand = async (): Promise<void> => {
        const token = begin('expand');
        if (!token) return;
        try {
            const data = token.mind.getData();
            const result = await expandNodeWithAI({
                node,
                ancestorPath: getAncestorPath(data.nodeData, token.nodeId),
                count: 5,
                mapTitle: data.nodeData.topic,
            });
            if (!lifecycle.isCurrent(token.id)) return;
            if (result.error) return fail('expand', result.error, aiKey('expandFailed'));
            const suggestions = normalizeMindMapPropertyAISuggestions(result.topics);
            patchState({
                suggestions,
                status: translate(aiKey('generated'), { count: suggestions.length }),
            });
        } catch (failure: unknown) {
            if (lifecycle.isCurrent(token.id)) fail('expand', failure, aiKey('expandFailed'));
        } finally {
            finish(token);
        }
    };

    const summarize = async (): Promise<void> => {
        if (!node.children?.length) return;
        const token = begin('summarize');
        if (!token) return;
        try {
            const result = await summarizeNodeWithAI(
                node.topic,
                node.children.map(child => cleanMindMapTopic(child.topic, '')),
            );
            if (!lifecycle.isCurrent(token.id)) return;
            if ('error' in result) return fail('summarize', result.error, aiKey('summarizeFailed'));
            const topic = cleanMindMapTopic(result.topic, node.topic);
            const topicElement = token.mind.findEle(token.nodeId);
            if (topic !== node.topic && topicElement) {
                token.mind.setNodeTopic(topicElement, topic);
                patchState({ status: translate(aiKey('summaryUpdated')) });
            } else {
                patchState({ status: translate(aiKey('summaryUnchanged')) });
            }
        } catch (failure: unknown) {
            if (lifecycle.isCurrent(token.id)) fail('summarize', failure, aiKey('summarizeFailed'));
        } finally {
            finish(token);
        }
    };

    const applySuggestion = async (candidate: string): Promise<void> => {
        const topic = cleanMindMapTopic(candidate, '');
        if (!topic || !state.suggestions.includes(topic)) return;
        const token = begin('apply', topic);
        if (!token) return;
        try {
            const topicElement = token.mind.findEle(token.nodeId);
            if (!topicElement) {
                patchState({ error: translate(aiKey('applyUnavailable')) });
                return;
            }
            token.mind.selectNode(topicElement);
            await token.mind.addChild(
                topicElement,
                cleanMindMapChildNode({ label: topic }, token.mind.generateNewObj?.().id ?? `n_${Date.now()}`),
            );
            if (!lifecycle.isCurrent(token.id)) return;
            setState(current => ({
                ...current,
                suggestions: current.suggestions.filter(suggestion => suggestion !== topic),
                status: translate(aiKey('applied'), { topic }),
            }));
        } catch (failure: unknown) {
            if (lifecycle.isCurrent(token.id)) {
                logMindmapPropertyAiAddChildFailure(failure);
                patchState({ error: translate(aiKey('applyFailed')) });
            }
        } finally {
            finish(token);
        }
    };

    const dismiss = (): void => {
        if (!operationRef.current) {
            setState(current => ({ ...current, suggestions: [], error: '', needsConfiguration: false }));
        }
    };

    const visibleState = state.context === lifecycle
        ? state
        : EMPTY_STATE;

    return {
        ...visibleState,
        applySuggestion,
        dismiss,
        expand,
        expanding: visibleState.operation === 'expand',
        summarize,
        summarizing: visibleState.operation === 'summarize',
    };
};
