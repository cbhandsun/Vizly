import type { AIEditContext } from '@/components/ai/aiCanvasEdit';
import { captureAuthSession } from '@/context/authSessionBoundary';
import { supabase } from '../supabase';
import { safeLog } from '@vizly/core/logging';
import { redactSensitiveLogValue } from '@vizly/core/logging';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from '@vizly/core/logging';
import { safeJsonParseWithLimit } from '@vizly/core/input';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    reasoningContent?: string;
    hasJson?: boolean;
    jsonContent?: string;
    isStreaming?: boolean;
    editContext?: AIEditContext;
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
const MAX_CONTENT_LENGTH = 64 * 1024;
const MAX_JSON_CONTENT_LENGTH = 128 * 1024;
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

const coerceEditContext = (value: unknown): AIEditContext | undefined => {
    if (!isPlainRecord(value) || !isSafeId(value.diagramId)
        || (value.scope !== 'selection' && value.scope !== 'diagram')
        || !Array.isArray(value.nodeIds) || value.nodeIds.length > 500 || !value.nodeIds.every(isSafeId)
        || typeof value.fingerprint !== 'string' || value.fingerprint.length > 80) return undefined;
    return { diagramId: value.diagramId, scope: value.scope, nodeIds: [...new Set(value.nodeIds)], fingerprint: value.fingerprint };
};

const coerceMessage = (value: unknown): Message | null => {
    if (!isPlainRecord(value)) return null;
    const raw = value as Record<string, unknown>;
    if (!isSafeId(raw.id)) return null;
    if (raw.role !== 'user' && raw.role !== 'assistant' && raw.role !== 'system') return null;

    // A sliced JSON string is no longer a usable artifact. Keep complete bounded
    // diagrams and hide actions for invalid/oversized artifacts instead.
    let jsonContent: string | undefined;
    if (typeof raw.jsonContent === 'string' && raw.jsonContent.length <= MAX_JSON_CONTENT_LENGTH) {
        try {
            const parsed: unknown = JSON.parse(raw.jsonContent);
            if (isPlainRecord(parsed) && (Array.isArray(parsed.nodes) || Array.isArray(parsed.edges))) {
                jsonContent = raw.jsonContent;
            }
        } catch { /* Invalid persisted artifacts must not expose apply/save actions. */ }
    }

    return {
        id: raw.id.trim(),
        role: raw.role,
        content: clampText(raw.content, MAX_CONTENT_LENGTH),
        reasoningContent: typeof raw.reasoningContent === 'string'
            ? raw.reasoningContent.slice(0, MAX_CONTENT_LENGTH)
            : undefined,
        hasJson: Boolean(raw.hasJson && jsonContent),
        jsonContent,
        isStreaming: false,
        editContext: coerceEditContext(raw.editContext),
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
    const conversations = [...value]
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

    // Match the read limit, including JSON escaping and object overhead. Retain
    // newest complete messages; never truncate an artifact to meet this budget.
    let remaining = MAX_CONVERSATIONS_JSON_CHARS - 2;
    const bounded: Conversation[] = [];
    for (const conversation of conversations) {
        const overhead = JSON.stringify({ ...conversation, messages: [] }).length
            + (bounded.length ? 1 : 0);
        let available = remaining - overhead;
        if (available < 0) continue;
        const messages: Message[] = [];
        for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
            const message = conversation.messages[i];
            const size = JSON.stringify(message).length + (messages.length ? 1 : 0);
            if (size > available) break;
            messages.push(message);
            available -= size;
        }
        if (conversation.messages.length && !messages.length) continue;
        bounded.push({ ...conversation, messages: messages.reverse() });
        remaining = available;
    }
    return bounded;
};

class AIConversationService {
    private currentUserId: string | null = null;
    private conversationsCache: Conversation[] | null = null;
    private ownerRevision = 0;
    private cloudWrites = new Map<string, Promise<void>>();

    isCurrentUser(userId: string | null): boolean {
        return this.currentUserId === userId;
    }

    private captureOwner() {
        const userId = this.currentUserId;
        const revision = this.ownerRevision;
        const session = captureAuthSession(userId);
        return { userId, isCurrent: () => revision === this.ownerRevision
            && userId === this.currentUserId && session.isCurrent() };
    }

    private getDeletedIds(): Set<string> {
        try {
            const raw = localStorage.getItem(`${this.getStorageKey()}_deleted`);
            const parsed: unknown = raw && raw.length <= 64 * 1024 ? JSON.parse(raw) : [];
            return new Set(Array.isArray(parsed) ? parsed.filter(isSafeId).slice(-256) : []);
        } catch { return new Set(); }
    }

    private markDeleted(id: string) {
        const ids = this.getDeletedIds();
        ids.add(id);
        try { localStorage.setItem(`${this.getStorageKey()}_deleted`, JSON.stringify([...ids].slice(-256))); }
        catch (error) { logUiStorageWriteFailure('AIConversationService.delete', this.getStorageKey(), error); }
    }

    // Serialize writes for the same conversation so an older update cannot land
    // after a newer update or recreate a deleted conversation.
    private enqueueCloudWrite(id: string, write: () => Promise<void>): Promise<void> {
        const key = `${this.currentUserId}:${id}`;
        const previous = this.cloudWrites.get(key);
        const task = previous ? previous.then(write) : write();
        this.cloudWrites.set(key, task);
        void task.finally(() => {
            if (this.cloudWrites.get(key) === task) this.cloudWrites.delete(key);
        });
        return task;
    }

    constructor() {
        if (typeof window !== 'undefined') window.addEventListener('storage', event => {
            if (event.storageArea === localStorage && (event.key === null || event.key === this.getStorageKey())) {
                this.conversationsCache = null;
            }
        });
    }

    setUserId(userId: string | null) {
        if (this.currentUserId !== userId) {
            this.conversationsCache = null;
            this.ownerRevision += 1;
        }
        this.currentUserId = userId;
    }

    async syncFromCloud(): Promise<Conversation[]> {
        if (!this.currentUserId || !supabase) return this.getConversations();

        const owner = this.captureOwner();
        const atStart = new Map(this.getConversations().map(conversation => [conversation.id, JSON.stringify(conversation)]));
        try {
            const { data, error } = await supabase
                .from('ai_conversations')
                .select('*')
                .eq('user_id', owner.userId)
                .order('updated_at', { ascending: false });

            if (!owner.isCurrent()) return [];
            if (error) throw error;

            if (data) {
                const cloudConvs = coerceConversations(data.map(item => ({
                    id: item.id,
                    title: item.title,
                    messages: item.messages,
                    createdAt: new Date(item.created_at).getTime(),
                    updatedAt: new Date(item.updated_at).getTime(),
                })));
                const deleted = this.getDeletedIds();
                const merged = new Map(cloudConvs.filter(conversation => !deleted.has(conversation.id))
                    .map(conversation => [conversation.id, conversation]));
                for (const local of this.getConversations()) {
                    if (deleted.has(local.id)) continue;
                    const cloud = merged.get(local.id);
                    // Protect edits made while the query was in flight, even if
                    // a remote clock is ahead. Otherwise the newest version wins.
                    if (!cloud || this.cloudWrites.has(`${owner.userId}:${local.id}`)
                        || JSON.stringify(local) !== atStart.get(local.id) || local.updatedAt >= cloud.updatedAt) {
                        merged.set(local.id, local);
                    }
                }
                this.saveConversations([...merged.values()]);
                return this.getConversations();
            }
        } catch (e) {
            safeLog.error('Failed to sync from cloud', redactSensitiveLogValue(e));
        }
        return owner.isCurrent() ? this.getConversations() : [];
    }

    async syncToCloud(conv: Conversation) {
        if (!this.currentUserId || !supabase) return;
        const safeConversation = coerceConversation(conv);
        if (!safeConversation) return;

        const owner = this.captureOwner();
        const client = supabase;
        return this.enqueueCloudWrite(safeConversation.id, async () => {
            if (!owner.isCurrent()) return;
            try {
                const { error } = await client.from('ai_conversations').upsert({
                    id: safeConversation.id,
                    user_id: owner.userId,
                    title: safeConversation.title,
                    messages: safeConversation.messages,
                    updated_at: new Date(safeConversation.updatedAt).toISOString(),
                }, { onConflict: 'id' });
                if (error) throw error;
            } catch (error) {
                safeLog.error('Failed to sync to cloud', redactSensitiveLogValue(error));
            }
        });
    }

    private getStorageKey(): string {
        return this.currentUserId ? `AIChatPanel.conversations_${this.currentUserId}` : 'AIChatPanel.conversations_anonymous';
    }

    private getActiveIdKey(): string {
        return this.currentUserId ? `AIChatPanel.activeId_${this.currentUserId}` : 'AIChatPanel.activeId_anonymous';
    }

    private clearConversationsCache(): void {
        this.conversationsCache = null;
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
        return this.copyConversations(this.conversationsCache ??= this.readConversations());
    }

    private copyConversations(conversations: Conversation[]): Conversation[] {
        return conversations.map(conversation => ({ ...conversation,
            messages: conversation.messages.map(message => ({ ...message })) }));
    }

    private readConversations(): Conversation[] {
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
        const safeConversations = coerceConversations(conversations);
        this.conversationsCache = safeConversations;
        try {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(safeConversations));
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

        this.markDeleted(id);
        if (this.getActiveConversationId() === id) {
            this.setActiveConversationId(filtered.length > 0 ? filtered[0].id : null);
        }
        const owner = this.captureOwner();
        const client = supabase;
        let cloudDeleted: boolean | null = null;
        if (owner.userId && client) {
            await this.enqueueCloudWrite(id, async () => {
                if (!owner.isCurrent()) return;
                try {
                    const { data, error } = await client.from('ai_conversations').delete()
                        .eq('id', id).eq('user_id', owner.userId).select('id');
                    if (error) throw error;
                    cloudDeleted = Array.isArray(data) && data.length === 1;
                    if (!cloudDeleted) safeLog.warn('AIConversationService: cloud conversation delete affected no rows.');
                } catch (error) {
                    cloudDeleted = false;
                    safeLog.error('AIConversationService: failed to delete cloud conversation', redactSensitiveLogValue(error));
                }
            });
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
