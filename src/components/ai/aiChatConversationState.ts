import type { Conversation, Message } from '@/services/ai/AIConversationService';
import { extractJson } from './useAIChatStreaming';

export interface AIChatPendingMessageState {
    newUserMessage: Message;
    newAssistantMessage: Message;
    updatedMessages: Message[];
}

export interface AIChatStreamingSnapshot {
    content: string;
    reasoningContent: string;
}

type CreateId = () => string;

const buildStreamingAssistantMessage = (
    baseMessage: Message,
    snapshot: AIChatStreamingSnapshot,
    isStreaming: boolean,
    fallbackContent?: string
): Message => {
    const resolvedContent = snapshot.content || fallbackContent || (snapshot.reasoningContent ? '' : '（无内容）');
    const jsonContent = extractJson(snapshot.content, isStreaming);

    return {
        ...baseMessage,
        content: resolvedContent,
        reasoningContent: snapshot.reasoningContent || undefined,
        isStreaming,
        hasJson: !!jsonContent,
        jsonContent: jsonContent || undefined,
    };
};

export const createAIChatPendingMessageState = (
    messages: Message[],
    inputValue: string,
    createId: CreateId
): AIChatPendingMessageState => {
    const newUserMessage: Message = {
        id: createId(),
        role: 'user',
        content: inputValue,
    };
    const newAssistantMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: '',
        isStreaming: true,
    };

    return {
        newUserMessage,
        newAssistantMessage,
        updatedMessages: [...messages, newUserMessage, newAssistantMessage],
    };
};

export const updateAIChatAssistantMessage = (
    messages: Message[],
    assistantMessageId: string,
    snapshot: AIChatStreamingSnapshot,
    isStreaming: boolean,
    fallbackContent?: string
): Message[] => (
    messages.map((message) => (
        message.id === assistantMessageId
            ? buildStreamingAssistantMessage(message, snapshot, isStreaming, fallbackContent)
            : message
    ))
);

export const buildAIChatConversationUpdate = (
    conversation: Conversation,
    assistantMessageId: string,
    snapshot: AIChatStreamingSnapshot,
    options?: {
        isStreaming?: boolean;
        fallbackContent?: string;
    }
): Partial<Conversation> => ({
    messages: updateAIChatAssistantMessage(
        conversation.messages,
        assistantMessageId,
        snapshot,
        options?.isStreaming ?? false,
        options?.fallbackContent
    ),
});
