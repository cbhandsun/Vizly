import { supabase } from '../supabase';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
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

const CONVERSATIONS_STORAGE_KEY = 'AIChatPanel.conversations';
const ACTIVE_CONVERSATION_ID_KEY = 'AIChatPanel.activeId';

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
                const cloudConvs: Conversation[] = data.map(item => ({
                    id: item.id,
                    title: item.title,
                    messages: item.messages,
                    createdAt: new Date(item.created_at).getTime(),
                    updatedAt: new Date(item.updated_at).getTime(),
                }));
                // 合并本地与云端逻辑（简单点直接以云端为准，或者合并最新）
                this.saveConversations(cloudConvs, false); // 不再触发向上同步，防止死循环
                return cloudConvs;
            }
        } catch (e) {
            console.error('Failed to sync from cloud', e);
        }
        return this.getConversations();
    }

    async syncToCloud(conv: Conversation) {
        if (!this.currentUserId || !supabase) return;

        try {
            const { error } = await supabase
                .from('ai_conversations')
                .upsert({
                    id: conv.id.includes('conv_') ? undefined : conv.id, // 如果是本地临时 ID，由数据库生成或保留
                    user_id: this.currentUserId,
                    title: conv.title,
                    messages: conv.messages,
                    updated_at: new Date(conv.updatedAt).toISOString()
                }, { onConflict: 'id' });

            if (error) throw error;
        } catch (e) {
            console.error('Failed to sync to cloud', e);
        }
    }

    getConversations(): Conversation[] {
        try {
            const saved = localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
        } catch (e) {
            console.error('Failed to load conversations', e);
        }
        return [];
    }

    saveConversations(conversations: Conversation[], syncCloud: boolean = true) {
        try {
            localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations));
            // 如果需要，这里可以限制并发或进行全量同步，但通常 upsert 单条更好
        } catch (e) {
            console.error('Failed to save conversations', e);
        }
    }

    getActiveConversationId(): string | null {
        return localStorage.getItem(ACTIVE_CONVERSATION_ID_KEY);
    }

    setActiveConversationId(id: string | null) {
        if (id) {
            localStorage.setItem(ACTIVE_CONVERSATION_ID_KEY, id);
        } else {
            localStorage.removeItem(ACTIVE_CONVERSATION_ID_KEY);
        }
    }

    createConversation(initialMessage?: Message): Conversation {
        const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const conversation: Conversation = {
            id,
            title: initialMessage ? this.generateTitle(initialMessage.content) : '新对话',
            messages: initialMessage ? [initialMessage] : [],
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
        const convs = this.getConversations();
        const index = convs.findIndex(c => c.id === id);
        if (index !== -1) {
            const updatedConv = { ...convs[index], ...updates, updatedAt: Date.now() };
            convs[index] = updatedConv;
            this.saveConversations(convs);
            this.syncToCloud(updatedConv); // 更新时同步
        }
    }

    async deleteConversation(id: string) {
        const convs = this.getConversations();
        const filtered = convs.filter(c => c.id !== id);
        this.saveConversations(filtered);

        if (this.currentUserId && supabase) {
            await supabase.from('ai_conversations').delete().eq('id', id);
        }

        if (this.getActiveConversationId() === id) {
            this.setActiveConversationId(filtered.length > 0 ? filtered[0].id : null);
        }
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
