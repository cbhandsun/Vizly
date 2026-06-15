import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message } from '../AIConversationService';

const mockSupabaseState = vi.hoisted(() => ({ value: null as any }));

vi.mock('../../supabase', () => ({
    get supabase() {
        return mockSupabaseState.value;
    },
}));

const importFreshService = async () => {
    vi.resetModules();
    return import('../AIConversationService');
};

describe('AIConversationService', () => {
    let module: Awaited<ReturnType<typeof importFreshService>>;

    beforeEach(async () => {
        localStorage.clear();
        mockSupabaseState.value = null;
        module = await importFreshService();
        module.aiConversationService.setUserId(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        localStorage.clear();
    });

    const makeMessage = (id: string, overrides: Partial<Message> = {}): Message => ({
        id,
        role: 'user',
        content: 'hello',
        ...overrides,
    });

    const makeConversation = (id: string, overrides: Partial<Conversation> = {}): Conversation => ({
        id,
        title: `Conversation ${id}`,
        messages: [makeMessage(`${id}-msg`)],
        createdAt: 1000,
        updatedAt: 1000,
        ...overrides,
    });

    it('loads only valid bounded conversations from localStorage', () => {
        localStorage.setItem('AIChatPanel.conversations_anonymous', JSON.stringify([
            makeConversation('older', { updatedAt: 1 }),
            makeConversation('newer', { updatedAt: 3 }),
            makeConversation('newer', { updatedAt: 4, title: 'duplicate ignored' }),
            { id: '', title: 'bad', messages: [], createdAt: 1, updatedAt: 1 },
            makeConversation('bad-message', {
                updatedAt: 2,
                messages: [
                    makeMessage('safe'),
                    { id: 'bad-role', role: 'tool', content: 'nope' },
                    makeMessage('streaming', { isStreaming: true }),
                ] as Message[],
            }),
        ]));

        const conversations = module.aiConversationService.getConversations();

        expect(conversations.map(c => c.id)).toEqual(['newer', 'bad-message', 'older']);
        expect(conversations.find(c => c.id === 'bad-message')?.messages).toEqual([
            expect.objectContaining({ id: 'safe' }),
            expect.objectContaining({ id: 'streaming', isStreaming: false }),
        ]);
    });

    it('limits saved conversations and messages', () => {
        const conversations = Array.from({ length: 55 }, (_, index) => makeConversation(`conv-${index}`, {
            updatedAt: index,
            messages: Array.from({ length: 45 }, (_, msgIndex) => makeMessage(`m-${index}-${msgIndex}`)),
        }));
        conversations[54].messages[44] = makeMessage('large', {
            content: 'x'.repeat(5000),
            jsonContent: 'j'.repeat(13000),
        });

        module.aiConversationService.saveConversations(conversations);
        const saved = JSON.parse(localStorage.getItem('AIChatPanel.conversations_anonymous') || '[]') as Conversation[];

        expect(saved).toHaveLength(25);
        expect(saved[0].id).toBe('conv-54');
        expect(saved[0].messages).toHaveLength(40);
        expect(saved[0].messages.at(-1)?.content).toHaveLength(4000);
        expect(saved[0].messages.at(-1)?.jsonContent).toHaveLength(12000);
    });

    it('rejects malformed stored data and unsafe active ids', () => {
        localStorage.setItem('AIChatPanel.conversations_anonymous', JSON.stringify({ not: 'an array' }));
        expect(module.aiConversationService.getConversations()).toEqual([]);

        module.aiConversationService.setActiveConversationId(' active-id ');
        expect(module.aiConversationService.getActiveConversationId()).toBe('active-id');

        module.aiConversationService.setActiveConversationId('x'.repeat(161));
        expect(module.aiConversationService.getActiveConversationId()).toBeNull();
    });

    it('normalizes new and updated conversations without accepting invalid updates', () => {
        const conversation = module.aiConversationService.createConversation(makeMessage(' initial ', {
            content: 'First line\nsecond line',
            isStreaming: true,
        }));
        expect(conversation.messages[0]).toEqual(expect.objectContaining({
            id: 'initial',
            isStreaming: false,
        }));

        module.aiConversationService.updateConversation(conversation.id, {
            title: 't'.repeat(140),
            messages: [
                makeMessage('safe'),
                { id: 'unsafe', role: 'tool', content: 'bad' },
            ] as Message[],
        });

        const [updated] = module.aiConversationService.getConversations();
        expect(updated.title).toHaveLength(120);
        expect(updated.messages).toEqual([expect.objectContaining({ id: 'safe' })]);

        module.aiConversationService.updateConversation('x'.repeat(161), { title: 'ignored' });
        expect(module.aiConversationService.getConversations()).toHaveLength(1);
    });

    it('confirms cloud conversation deletion by requiring one deleted row', async () => {
        const query: any = {
            delete: vi.fn(() => query),
            eq: vi.fn(() => query),
            select: vi.fn(() => Promise.resolve({ data: [{ id: 'conv-1' }], error: null })),
        };
        mockSupabaseState.value = {
            from: vi.fn(() => query),
        };
        module = await importFreshService();
        module.aiConversationService.setUserId('user-1');
        module.aiConversationService.saveConversations([makeConversation('conv-1')]);
        module.aiConversationService.setActiveConversationId('conv-1');

        await expect(module.aiConversationService.deleteConversation('conv-1')).resolves.toEqual({
            localDeleted: true,
            cloudDeleted: true,
        });
        expect(mockSupabaseState.value.from).toHaveBeenCalledWith('ai_conversations');
        expect(query.eq).toHaveBeenCalledWith('id', 'conv-1');
        expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
        expect(query.select).toHaveBeenCalledWith('id');
        expect(module.aiConversationService.getConversations()).toEqual([]);
        expect(module.aiConversationService.getActiveConversationId()).toBeNull();
    });

    it('does not throw or report cloud success when cloud conversation deletion fails', async () => {
        const query: any = {
            delete: vi.fn(() => query),
            eq: vi.fn(() => query),
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        };
        mockSupabaseState.value = {
            from: vi.fn(() => query),
        };
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        module = await importFreshService();
        module.aiConversationService.setUserId('user-1');
        module.aiConversationService.saveConversations([makeConversation('conv-1')]);

        await expect(module.aiConversationService.deleteConversation('conv-1')).resolves.toEqual({
            localDeleted: true,
            cloudDeleted: false,
        });
        expect(warnSpy).toHaveBeenCalledWith('AIConversationService: cloud conversation delete affected no rows.');
        expect(module.aiConversationService.getConversations()).toEqual([]);
    });
});
