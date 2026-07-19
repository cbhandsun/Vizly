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

export const normalizeAIChatConversationTitle = (
    value: unknown,
    fallback: string,
): string => {
    const fallbackTitle = fallback.trim().slice(0, 200) || 'New Chat';
    if (typeof value !== 'string') return fallbackTitle;
    return value.trim().slice(0, 200) || fallbackTitle;
};
