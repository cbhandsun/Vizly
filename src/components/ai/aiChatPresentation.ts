import type { Conversation } from '@/services/ai/AIConversationService';

export interface AIChatCopyKeys {
    inputPlaceholder: 'aiChat.inputPlaceholder' | 'aiChat.genericInputPlaceholder';
    welcomeMessage: 'aiChat.welcomeMsg' | 'aiChat.genericWelcomeMsg';
}

const CONFIGURATION_INDEPENDENT_COMMANDS = new Set([
    '/clear',
    '/exit',
    '/help',
    '/present',
    '/quit',
    '/reset',
    '/shortcuts',
]);

export const resolveAIChatCopyKeys = (pluginId: string | undefined): AIChatCopyKeys => (
    pluginId === 'architecture-diagram'
        ? {
            inputPlaceholder: 'aiChat.inputPlaceholder',
            welcomeMessage: 'aiChat.welcomeMsg',
        }
        : {
            inputPlaceholder: 'aiChat.genericInputPlaceholder',
            welcomeMessage: 'aiChat.genericWelcomeMsg',
        }
);

export const isConfigurationIndependentAIChatInput = (value: unknown): boolean => {
    if (typeof value !== 'string') return false;
    const command = value.trim().split(/\s+/, 1)[0]?.toLowerCase();
    return Boolean(command && CONFIGURATION_INDEPENDENT_COMMANDS.has(command));
};

export const localizePristineAIChatConversations = (
    conversations: Conversation[],
    welcomeMessage: string,
    newConversationTitle: string,
): Conversation[] => conversations.map((conversation) => {
    const isPristine = conversation.messages.length === 0 || (
        conversation.messages.length === 1
        && conversation.messages[0]?.role === 'assistant'
        && !conversation.messages[0].hasJson
        && !conversation.messages[0].jsonContent
    );
    if (!isPristine) return conversation;

    const currentMessage = conversation.messages[0];
    if (currentMessage?.content === welcomeMessage && conversation.title === newConversationTitle) {
        return conversation;
    }

    return {
        ...conversation,
        title: newConversationTitle,
        messages: currentMessage
            ? [{ ...currentMessage, content: welcomeMessage }]
            : [],
    };
});
