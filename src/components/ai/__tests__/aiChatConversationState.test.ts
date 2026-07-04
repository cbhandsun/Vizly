import { describe, expect, it } from 'vitest';
import {
    buildAIChatConversationUpdate,
    createAIChatPendingMessageState,
    updateAIChatAssistantMessage,
} from '../aiChatConversationState';
import type { Conversation, Message } from '@/services/ai/AIConversationService';

const baseMessages: Message[] = [
    { id: 'user-1', role: 'user', content: 'hello' },
    { id: 'assistant-1', role: 'assistant', content: '', isStreaming: true },
];

describe('aiChatConversationState', () => {
    it('creates optimistic user and assistant messages for a pending send', () => {
        const ids = ['user-2', 'assistant-2'];
        const result = createAIChatPendingMessageState(baseMessages, 'new question', () => ids.shift() || 'fallback');

        expect(result.newUserMessage).toEqual({
            id: 'user-2',
            role: 'user',
            content: 'new question',
        });
        expect(result.newAssistantMessage).toEqual({
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            isStreaming: true,
        });
        expect(result.updatedMessages).toHaveLength(4);
    });

    it('updates streaming assistant content and extracts partial diagram json', () => {
        const updated = updateAIChatAssistantMessage(
            baseMessages,
            'assistant-1',
            {
                content: '```json\n{"nodes":[],"edges":[]}',
                reasoningContent: 'thinking',
            },
            true
        );

        expect(updated[1]).toMatchObject({
            id: 'assistant-1',
            content: '```json\n{"nodes":[],"edges":[]}',
            reasoningContent: 'thinking',
            isStreaming: true,
            hasJson: true,
            jsonContent: '{"nodes":[],"edges":[]}',
        });
    });

    it('finalizes assistant content with fallback when aborted before content arrives', () => {
        const updated = updateAIChatAssistantMessage(
            baseMessages,
            'assistant-1',
            {
                content: '',
                reasoningContent: '',
            },
            false,
            '已停止生成'
        );

        expect(updated[1]).toMatchObject({
            id: 'assistant-1',
            content: '已停止生成',
            isStreaming: false,
            hasJson: false,
        });
    });

    it('builds a conversation patch for final assistant state', () => {
        const conversation: Conversation = {
            id: 'conv-1',
            title: 'Test',
            messages: baseMessages,
            createdAt: 1,
            updatedAt: 2,
        };

        const patch = buildAIChatConversationUpdate(conversation, 'assistant-1', {
            content: 'done',
            reasoningContent: 'summary',
        });

        expect(patch.messages?.[1]).toMatchObject({
            content: 'done',
            reasoningContent: 'summary',
            isStreaming: false,
        });
    });
});
