import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';

import {
    aiConversationService,
    type Conversation,
    type Message,
} from '@/services/ai/AIConversationService';
import {
    createAIChatMessageId,
    normalizeAIChatConversationTitle,
    resolveAIChatActiveConversationId,
} from './aiChatConversationModel';
import { logAIChatConversationSyncFailure } from './aiLogging';

interface UseAIChatConversationsOptions {
    userId?: string;
    welcomeMessage: string;
}

export function useAIChatConversations({ userId, welcomeMessage }: UseAIChatConversationsOptions) {
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        aiConversationService.setUserId(userId || null);
        return aiConversationService.getConversations();
    });
    const [activeId, setActiveId] = useState<string | null>(() => aiConversationService.getActiveConversationId());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');

    const activeConversation = useMemo(
        () => conversations.find(conversation => conversation.id === activeId) || null,
        [activeId, conversations],
    );
    const messages = useMemo(() => activeConversation?.messages || [], [activeConversation]);

    useEffect(() => {
        let cancelled = false;
        aiConversationService.setUserId(userId || null);

        const applyConversations = (nextConversations: Conversation[]) => {
            if (cancelled) return;
            setConversations(nextConversations);
            setActiveId(resolveAIChatActiveConversationId(
                nextConversations,
                aiConversationService.getActiveConversationId(),
            ));
        };

        if (userId) {
            void aiConversationService.syncFromCloud()
                .then(applyConversations)
                .catch(logAIChatConversationSyncFailure);
        } else {
            applyConversations(aiConversationService.getConversations());
        }

        return () => { cancelled = true; };
    }, [userId]);

    const handleNewChat = useCallback(() => {
        const welcome: Message = {
            id: createAIChatMessageId(),
            role: 'assistant',
            content: welcomeMessage,
        };
        const conversation = aiConversationService.createConversation(welcome);
        setConversations(aiConversationService.getConversations());
        setActiveId(conversation.id);
    }, [welcomeMessage]);

    useEffect(() => {
        if (userId || conversations.length > 0) return;
        const timer = window.setTimeout(handleNewChat, 0);
        return () => window.clearTimeout(timer);
    }, [conversations.length, handleNewChat, userId]);

    const handleSwitchChat = useCallback((id: string) => {
        const nextId = resolveAIChatActiveConversationId(conversations, id);
        setActiveId(nextId);
        aiConversationService.setActiveConversationId(nextId);
    }, [conversations]);

    const handleDeleteChat = useCallback((id: string, event?: React.MouseEvent) => {
        event?.stopPropagation();
        aiConversationService.deleteConversation(id);
        const updated = aiConversationService.getConversations();
        setConversations(updated);
        if (activeId === id) setActiveId(resolveAIChatActiveConversationId(updated, null));
    }, [activeId]);

    const handleStartRename = useCallback((conversation: Conversation, event: React.MouseEvent) => {
        event.stopPropagation();
        setEditingId(conversation.id);
        setEditingTitle(conversation.title);
    }, []);

    const handleSaveRename = useCallback((id: string) => {
        const conversation = conversations.find(candidate => candidate.id === id);
        if (!conversation) {
            setEditingId(null);
            return;
        }
        aiConversationService.updateConversation(id, {
            title: normalizeAIChatConversationTitle(editingTitle, conversation.title),
        });
        setConversations(aiConversationService.getConversations());
        setEditingId(null);
    }, [conversations, editingTitle]);

    const addLocalMessage = useCallback((role: 'user' | 'assistant', content: string) => {
        if (!activeId) return;
        const message: Message = { id: createAIChatMessageId(), role, content };
        const activeMessages = aiConversationService
            .getConversations()
            .find(conversation => conversation.id === activeId)?.messages || [];
        aiConversationService.updateConversation(activeId, { messages: [...activeMessages, message] });
        setConversations(aiConversationService.getConversations());
    }, [activeId]);

    return {
        conversations,
        setConversations,
        activeId,
        setActiveId,
        activeConversation,
        messages,
        editingId,
        editingTitle,
        setEditingTitle,
        handleNewChat,
        handleSwitchChat,
        handleDeleteChat,
        handleStartRename,
        handleSaveRename,
        addLocalMessage,
    };
}
