import type { Conversation } from '@/services/ai/AIConversationService';

export const createAIChatMessageId = (
    prefix = 'msg',
    now: () => number = Date.now,
    random: () => number = Math.random,
): string => `${prefix}_${now()}_${random().toString(36).substring(2, 11)}`;

export const resolveAIChatActiveConversationId = (
    conversations: Conversation[],
    requestedId: unknown,
): string | null => {
    if (typeof requestedId === 'string' && conversations.some(conversation => conversation.id === requestedId)) {
        return requestedId;
    }
    return conversations[0]?.id ?? null;
};

export const isPristineAIChatConversation = (
    conversation: Conversation | null | undefined,
    welcomeMessage: unknown,
): boolean => {
    if (!conversation || typeof welcomeMessage !== 'string') return false;
    if (conversation.messages.length === 0) return true;
    if (conversation.messages.length !== 1) return false;

    const [message] = conversation.messages;
    return message.role === 'assistant' && message.content === welcomeMessage;
};

export interface AIChatConversationReuse {
    conversationId: string;
    redundantConversationIds: string[];
}

export const resolvePristineAIChatConversationReuse = (
    conversations: Conversation[],
    welcomeMessage: unknown,
): AIChatConversationReuse | null => {
    const pristineConversations = conversations.filter(conversation => (
        isPristineAIChatConversation(conversation, welcomeMessage)
    ));
    const reusableConversation = pristineConversations[0];
    if (!reusableConversation) return null;

    return {
        conversationId: reusableConversation.id,
        redundantConversationIds: pristineConversations
            .slice(1)
            .map(conversation => conversation.id),
    };
};

export const normalizeAIChatConversationTitle = (
    value: unknown,
    fallback: string,
): string => {
    const fallbackTitle = fallback.trim().slice(0, 200) || 'New Chat';
    if (typeof value !== 'string') return fallbackTitle;
    return value.trim().slice(0, 200) || fallbackTitle;
};
