// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
    createAIChatMessageId,
    normalizeAIChatConversationTitle,
    resolveAIChatActiveConversationId,
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

    it('normalizes empty, wrong-type, and oversized titles', () => {
        expect(normalizeAIChatConversationTitle('  Renamed  ', 'Fallback')).toBe('Renamed');
        expect(normalizeAIChatConversationTitle('', 'Fallback')).toBe('Fallback');
        expect(normalizeAIChatConversationTitle(null, 'Fallback')).toBe('Fallback');
        expect(normalizeAIChatConversationTitle('x'.repeat(500), 'Fallback')).toHaveLength(200);
    });
});
