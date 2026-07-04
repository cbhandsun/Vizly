import { supabase } from '../supabase';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@/core/utils/uiStorageLogging';
import { safeJsonParseWithLimit } from '@/core/utils/jsonUtils';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    reasoningContent?: string;
    hasJson?: boolean;
    jsonContent?: string;
    isStreaming?: boolean;
}

export interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    createdAt: number;
    updatedAt: number;
}

export interface DeleteConversationResult {
    localDeleted: boolean;
    cloudDeleted: boolean | null;
}

const _CONVERSATIONS_STORAGE_KEY = 'AIChatPanel.conversations';
const _ACTIVE_CONVERSATION_ID_KEY = 'AIChatPanel.activeId';
const MAX_CONVERSATIONS = 25;
const MAX_MESSAGES_PER_CONVERSATION = 40;
const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 4000;
const MAX_JSON_CONTENT_LENGTH = 12000;
const MAX_ID_LENGTH = 160;
const MAX_CONVERSATIONS_JSON_CHARS = 2 * 1024 * 1024;

const isSafeId = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_ID_LENGTH;

const clampText = (value: unknown, maxLength: number): string =>
    typeof value === 'string' ? value.slice(0, maxLength) : '';

const toTimestamp = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const coerceMessage = (value: unknown): Message | null => {
    if (!isPlainRecord(value)) return null;
    const raw = value as Record<string, unknown>;
    if (!isSafeId(raw.id)) return null;
    if (raw.role !== 'user' && raw.role !== 'assistant' && raw.role !== 'system') return null;

    return {
        id: raw.id.trim(),
        role: raw.role,
        content: clampText(raw.content, MAX_CONTENT_LENGTH),
        reasoningContent: typeof raw.reasoningContent === 'string'
            ? raw.reasoningContent.slice(0, MAX_CONTENT_LENGTH)
            : undefined,
        hasJson: typeof raw.hasJson === 'boolean' ? raw.hasJson : undefined,
        jsonContent: typeof raw.jsonContent === 'string'
            ? raw.jsonContent.slice(0, MAX_JSON_CONTENT_LENGTH)
            : undefined,
        isStreaming: false,
    };
};

const coerceConversation = (value: unknown): Conversation | null => {
    if (!isPlainRecord(value)) return null;
    const raw = value as Record<string, unknown>;
    if (!isSafeId(raw.id)) return null;
    const now = Date.now();
    const createdAt = toTimestamp(raw.createdAt, now);
    const updatedAt = toTimestamp(raw.updatedAt, createdAt);
    const messages = Array.isArray(raw.messages)
        ? raw.messages
            .slice(-MAX_MESSAGES_PER_CONVERSATION)
            .map(coerceMessage)
            .filter((message): message is Message => Boolean(message))
        : [];

    return {
        id: raw.id.trim(),
        title: clampText(raw.title, MAX_TITLE_LENGTH) || '新对话',
        messages,
        createdAt,
        updatedAt,
    };
};

const coerceConversations = (value: unknown): Conversation[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return [...value]
        .sort((a, b) => {
            const aUpdated = toTimestamp(isPlainRecord(a) ? a.updatedAt : undefined, 0);
            const bUpdated = toTimestamp(isPlainRecord(b) ? b.updatedAt : undefined, 0);
            return bUpdated - aUpdated;
        })
        .slice(0, MAX_CONVERSATIONS)
        .map(coerceConversation)
        .filter((conversation): conversation is Conversation => {
            if (!conversation || seen.has(conversation.id)) return false;
            seen.add(conversation.id);
            return true;
        });
};

class AIConversationService {
    private currentUserId: string | null = null;

    setUserId(userId: string | null) {
        this.currentUserId = userId;
    }

    async syncFromCloud(): Promise<Conversation[]> {
        if (!this.currentUserId || !supabase) return this.getConversations();

        try {
            const { data, error } = await supabase
                .from('ai_conversations')
                .select('*')
                .eq('user_id', this.currentUserId)
                .order('updated_at', { ascending: false });

            if (error) throw error;

            if (data) {
                const cloudConvs = coerceConversations(data.map(item => ({
                    id: item.id,
                    title: item.title,
                    messages: item.messages,
                    createdAt: new Date(item.created_at).getTime(),
                    updatedAt: new Date(item.updated_at).getTime(),
                })));
                // 合并本地与云端逻辑（简单点直接以云端为准，或者合并最新）
                this.saveConversations(cloudConvs);
                return cloudConvs;
            }
        } catch (e) {
            safeLog.error('Failed to sync from cloud', redactSensitiveLogValue(e));
        }
        return this.getConversations();
    }

    async syncToCloud(conv: Conversation) {
        if (!this.currentUserId || !supabase) return;
        const safeConversation = coerceConversation(conv);
        if (!safeConversation) return;

        try {
            const { error } = await supabase
                .from('ai_conversations')
                .upsert({
                    // [M-2] Always pass conv.id so upsert+onConflict can match the existing row.
                    // Previous logic (id: includes('conv_') ? undefined : id) passed undefined for local IDs,
                    // causing every sync to INSERT a new row instead of updating the existing one.
                    id: safeConversation.id,
                    user_id: this.currentUserId,
                    title: safeConversation.title,
                    messages: safeConversation.messages,
                    updated_at: new Date(safeConversation.updatedAt).toISOString()
                }, { onConflict: 'id' });

            if (error) throw error;
        } catch (e) {
            safeLog.error('Failed to sync to cloud', redactSensitiveLogValue(e));
        }
    }

    private getStorageKey(): string {
        return this.currentUserId ? `AIChatPanel.conversations_${this.currentUserId}` : 'AIChatPanel.conversations_anonymous';
    }

    private getActiveIdKey(): string {
        return this.currentUserId ? `AIChatPanel.activeId_${this.currentUserId}` : 'AIChatPanel.activeId_anonymous';
    }

    private clearConversationsCache(): void {
        try {
            localStorage.removeItem(this.getStorageKey());
        } catch (error) {
            logUiStorageWriteFailure('AIConversationService.clearConversationsCache', this.getStorageKey(), error);
        }

        try {
            localStorage.removeItem(this.getActiveIdKey());
        } catch (error) {
            logUiStorageWriteFailure('AIConversationService.clearConversationsCache', this.getActiveIdKey(), error);
        }
    }

    getConversations(): Conversation[] {
        try {
            const saved = localStorage.getItem(this.getStorageKey());
            if (saved) {
                let readFailure: unknown = null;
                const parsed = safeJsonParseWithLimit<unknown>(saved, null, {
                    maxLength: MAX_CONVERSATIONS_JSON_CHARS,
                    onFailure: (error) => {
                        readFailure = error;
                        logUiStorageReadFailure('AIConversationService.getConversations', this.getStorageKey(), error);
                    },
                    buildOversizeError: () => new Error('AI conversation JSON is too large.'),
                });
                if (parsed === null) {
                    this.clearConversationsCache();
                    if (readFailure) {
                        safeLog.error('Failed to load conversations', redactSensitiveLogValue(readFailure));
                    }
                    return [];
                }
                // Guard against corrupted or migrated data (e.g., a non-array was serialised)
                if (Array.isArray(parsed)) return coerceConversations(parsed);

                this.clearConversationsCache();
                safeLog.warn('AIConversationService: stored conversations is not an array, resetting.');
            }
        } catch (e) {
            logUiStorageReadFailure('AIConversationService.getConversations', this.getStorageKey(), e);
            this.clearConversationsCache();
            safeLog.error('Failed to load conversations', redactSensitiveLogValue(e));
        }
        return [];
    }

    saveConversations(conversations: Conversation[]) {
        try {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(coerceConversations(conversations)));
            // 如果需要，这里可以限制并发或进行全量同步，但通常 upsert 单条更好
        } catch (e) {
            logUiStorageWriteFailure('AIConversationService.saveConversations', this.getStorageKey(), e);
            safeLog.error('Failed to save conversations', redactSensitiveLogValue(e));
        }
    }

    getActiveConversationId(): string | null {
        try {
            const id = localStorage.getItem(this.getActiveIdKey());
            if (!isSafeId(id)) return null;
            return id.trim();
        } catch (error) {
            logUiStorageReadFailure('AIConversationService.getActiveConversationId', this.getActiveIdKey(), error);
            safeLog.error('Failed to load active conversation id', redactSensitiveLogValue(error));
            return null;
        }
    }

    setActiveConversationId(id: string | null) {
        try {
            if (isSafeId(id)) {
                localStorage.setItem(this.getActiveIdKey(), id.trim());
            } else {
                localStorage.removeItem(this.getActiveIdKey());
            }
        } catch (error) {
            logUiStorageWriteFailure('AIConversationService.setActiveConversationId', this.getActiveIdKey(), error);
            safeLog.error('Failed to save active conversation id', redactSensitiveLogValue(error));
        }
    }

    createConversation(initialMessage?: Message): Conversation {
        const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const conversation: Conversation = {
            id,
            title: initialMessage ? this.generateTitle(initialMessage.content) : '新对话',
            messages: initialMessage ? coerceConversations([{ id, title: '新对话', messages: [initialMessage], createdAt: Date.now(), updatedAt: Date.now() }])[0]?.messages ?? [] : [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const convs = this.getConversations();
        const updated = [conversation, ...convs];
        this.saveConversations(updated);
        this.setActiveConversationId(id);
        this.syncToCloud(conversation); // 创建时同步
        return conversation;
    }

    updateConversation(id: string, updates: Partial<Conversation>) {
        if (!isSafeId(id)) return;
        const convs = this.getConversations();
        const index = convs.findIndex(c => c.id === id);
        if (index !== -1) {
            const updatedConv = coerceConversation({ ...convs[index], ...updates, id, updatedAt: Date.now() });
            if (!updatedConv) return;
            convs[index] = updatedConv;
            this.saveConversations(convs);
            this.syncToCloud(updatedConv); // 更新时同步
        }
    }

    async deleteConversation(id: string): Promise<DeleteConversationResult> {
        if (!isSafeId(id)) return { localDeleted: false, cloudDeleted: null };
        const convs = this.getConversations();
        const filtered = convs.filter(c => c.id !== id);
        const localDeleted = filtered.length !== convs.length;
        this.saveConversations(filtered);

        let cloudDeleted: boolean | null = null;
        if (this.currentUserId && supabase) {
            try {
                const { data, error } = await supabase
                    .from('ai_conversations')
                    .delete()
                    .eq('id', id)
                    .eq('user_id', this.currentUserId)
                    .select('id');

                if (error) throw error;
                cloudDeleted = Array.isArray(data) && data.length === 1;
                if (!cloudDeleted) {
                    safeLog.warn('AIConversationService: cloud conversation delete affected no rows.');
                }
            } catch (error) {
                cloudDeleted = false;
                safeLog.error('AIConversationService: failed to delete cloud conversation', redactSensitiveLogValue(error));
            }
        }

        if (this.getActiveConversationId() === id) {
            this.setActiveConversationId(filtered.length > 0 ? filtered[0].id : null);
        }

        return { localDeleted, cloudDeleted };
    }

    generateTitle(content: string): string {
        // Simple title generation: take first line or first 20 characters
        const firstLine = content.split('\n')[0].trim();
        if (firstLine.length > 20) {
            return firstLine.substring(0, 20) + '...';
        }
        return firstLine || '新对话';
    }
}

export const aiConversationService = new AIConversationService();
