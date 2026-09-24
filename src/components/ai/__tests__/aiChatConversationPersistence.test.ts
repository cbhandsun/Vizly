import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/services/ai/AIConversationService';
import { persistAIChatAssistantSnapshot } from '../aiChatConversationPersistence';

const makeConversation = (): Conversation => ({
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    messages: [
        { id: 'user-1', role: 'user', content: 'Help' },
        { id: 'assistant-1', role: 'assistant', content: '', isStreaming: true },
    ],
});

describe('persistAIChatAssistantSnapshot', () => {
    it('persists a request failure so it survives conversation reloads', () => {
        let conversations = [makeConversation()];
        const updateConversation = vi.fn((id: string, updates: Partial<Conversation>) => {
            conversations = conversations.map(conversation => (
                conversation.id === id
                    ? { ...conversation, ...updates, updatedAt: 2 }
                    : conversation
            ));
        });
        const store = {
            getConversations: () => conversations,
            updateConversation,
        };

        const persisted = persistAIChatAssistantSnapshot(
            store,
            'conversation-1',
            'assistant-1',
            { content: '', reasoningContent: '' },
            { fallbackContent: 'Request failed. Try again.' },
        );

        expect(updateConversation).toHaveBeenCalledOnce();
        expect(persisted[0].messages[1]).toMatchObject({
            content: 'Request failed. Try again.',
            isStreaming: false,
        });
        expect(store.getConversations()[0].messages[1].content).toBe('Request failed. Try again.');
    });

    it('does not write when the conversation no longer exists', () => {
        const updateConversation = vi.fn();
        const store = {
            getConversations: () => [] as Conversation[],
            updateConversation,
        };

        expect(persistAIChatAssistantSnapshot(
            store,
            'missing',
            'assistant-1',
            { content: 'ignored', reasoningContent: '' },
        )).toEqual([]);
        expect(updateConversation).not.toHaveBeenCalled();
    });
});
