// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
    createAIChatMessageId,
    isPristineAIChatConversation,
    normalizeAIChatConversationTitle,
    resolveAIChatActiveConversationId,
    resolvePristineAIChatConversationReuse,
} from '../aiChatConversationModel';
import type { Conversation } from '@/services/ai/AIConversationService';

const conversation = (id: string): Conversation => ({
    id,
    title: id,
    messages: [],
    createdAt: 1,
    updatedAt: 1,
});

describe('aiChatConversationModel', () => {
    it('creates deterministic bounded message ids from injected sources', () => {
        expect(createAIChatMessageId('msg', () => 123, () => 0.5)).toBe('msg_123_i');
    });

    it('resolves missing and stale active conversation ids', () => {
        const conversations = [conversation('first'), conversation('second')];
        expect(resolveAIChatActiveConversationId(conversations, 'second')).toBe('second');
        expect(resolveAIChatActiveConversationId(conversations, 'missing')).toBe('first');
        expect(resolveAIChatActiveConversationId([], 'missing')).toBeNull();
    });

    it('recognizes only empty or untouched welcome conversations as pristine', () => {
        const empty = conversation('empty');
        const welcome = {
            ...conversation('welcome'),
            messages: [{ id: 'welcome-message', role: 'assistant' as const, content: 'Welcome' }],
        };
        const answered = {
            ...welcome,
            id: 'answered',
            messages: [
                ...welcome.messages,
                { id: 'user-message', role: 'user' as const, content: 'Create a flowchart' },
            ],
        };

        expect(isPristineAIChatConversation(empty, 'Welcome')).toBe(true);
        expect(isPristineAIChatConversation(welcome, 'Welcome')).toBe(true);
        expect(isPristineAIChatConversation(welcome, 'Different welcome')).toBe(false);
        expect(isPristineAIChatConversation(answered, 'Welcome')).toBe(false);
        expect(isPristineAIChatConversation(null, 'Welcome')).toBe(false);
        expect(isPristineAIChatConversation(welcome, null)).toBe(false);
    });

    it('reuses the newest pristine conversation and identifies duplicate empty histories', () => {
        const newest = {
            ...conversation('newest'),
            messages: [{ id: 'welcome-newest', role: 'assistant' as const, content: 'Welcome' }],
        };
        const older = {
            ...conversation('older'),
            messages: [{ id: 'welcome-older', role: 'assistant' as const, content: 'Welcome' }],
        };
        const active = {
            ...conversation('active'),
            messages: [{ id: 'user-message', role: 'user' as const, content: 'Keep this work' }],
        };

        expect(resolvePristineAIChatConversationReuse([newest, active, older], 'Welcome')).toEqual({
            conversationId: newest.id,
            redundantConversationIds: [older.id],
        });
        expect(resolvePristineAIChatConversationReuse([active], 'Welcome')).toBeNull();
        expect(resolvePristineAIChatConversationReuse([], 'Welcome')).toBeNull();
    });

    it('normalizes empty, wrong-type, and oversized titles', () => {
        expect(normalizeAIChatConversationTitle('  Renamed  ', 'Fallback')).toBe('Renamed');
        expect(normalizeAIChatConversationTitle('', 'Fallback')).toBe('Fallback');
        expect(normalizeAIChatConversationTitle(null, 'Fallback')).toBe('Fallback');
        expect(normalizeAIChatConversationTitle('x'.repeat(500), 'Fallback')).toHaveLength(200);
    });
});
