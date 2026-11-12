import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation } from '@/services/ai/AIConversationService';
import { useAIChatConversations } from '../useAIChatConversations';
const store = vi.hoisted(() => ({ rows: [] as Conversation[], activeId: null as string | null, sync: vi.fn() }));
vi.mock('@/services/ai/AIConversationService', () => ({ aiConversationService: {
    setUserId: vi.fn(), isCurrentUser: () => true, getConversations: () => store.rows,
    getActiveConversationId: () => store.activeId,
    setActiveConversationId: (id: string) => { store.activeId = id; },
    syncFromCloud: store.sync,
    createConversation: (message: Conversation['messages'][0]) => {
        const row = { id: 'new-conversation', title: 'New', messages: [message], createdAt: 1, updatedAt: 1 };
        store.rows = [row]; store.activeId = row.id; return row;
    },
    updateConversation: (id: string, updates: Partial<Conversation>) => {
        store.rows = store.rows.map(row => row.id === id ? { ...row, ...updates } : row);
    },
} }));
beforeEach(() => { store.rows = []; store.activeId = null; store.sync.mockReset(); });
const options = { userId: 'signed-in-user', welcomeMessage: 'Welcome', newConversationTitle: 'New chat' };
describe('signed-in AI conversation initialization', () => {
    it('creates an active conversation for an account with no cloud history after synchronization', async () => {
        let resolve!: (rows: Conversation[]) => void;
        store.sync.mockImplementation(() => new Promise<Conversation[]>(done => { resolve = done; }));
        const { result } = renderHook(() => useAIChatConversations(options));
        expect(result.current.activeId).toBeNull();
        expect(store.rows).toHaveLength(0);
        await act(async () => { resolve([]); });
        await waitFor(() => expect(result.current.activeId).toBe('new-conversation'));
        expect(result.current.messages[0].content).toBe('Welcome');
    });
    it('preserves a populated cloud history instead of creating an extra conversation', async () => {
        const row: Conversation = { id: 'existing', title: 'Existing', messages: [{ id: 'user', role: 'user', content: 'Keep my work' }], createdAt: 1, updatedAt: 1 };
        store.sync.mockImplementation(async () => { store.rows = [row]; return store.rows; });
        const { result } = renderHook(() => useAIChatConversations(options));
        await waitFor(() => expect(result.current.activeId).toBe('existing'));
        expect(store.rows).toEqual([row]);
    });
});
