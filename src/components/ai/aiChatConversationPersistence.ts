import type { Conversation } from '@/services/ai/AIConversationService';
import {
    buildAIChatConversationUpdate,
    type AIChatStreamingSnapshot,
} from './aiChatConversationState';

interface AIChatConversationPersistencePort {
    getConversations: () => Conversation[];
    updateConversation: (id: string, updates: Partial<Conversation>) => void;
}

interface PersistAIChatAssistantSnapshotOptions {
    isStreaming?: boolean;
    fallbackContent?: string;
}

export const persistAIChatAssistantSnapshot = (
    conversationStore: AIChatConversationPersistencePort,
    conversationId: string,
    assistantMessageId: string,
    snapshot: AIChatStreamingSnapshot,
    options?: PersistAIChatAssistantSnapshotOptions,
): Conversation[] => {
    const conversation = conversationStore
        .getConversations()
        .find(candidate => candidate.id === conversationId);
    if (!conversation) return conversationStore.getConversations();

    conversationStore.updateConversation(
        conversationId,
        buildAIChatConversationUpdate(conversation, assistantMessageId, snapshot, options),
    );
    return conversationStore.getConversations();
};
