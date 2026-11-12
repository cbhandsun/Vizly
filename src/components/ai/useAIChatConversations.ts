import { captureAuthSession, getAuthSessionRevision, onAuthSessionInvalidated } from '@/context/authSessionBoundary';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
    resolvePristineAIChatConversationReuse,
} from './aiChatConversationModel';
import { logAIChatConversationSyncFailure } from './aiLogging';
import { localizePristineAIChatConversations } from './aiChatPresentation';

interface UseAIChatConversationsOptions {
    userId?: string;
    welcomeMessage: string;
    newConversationTitle: string;
}

export function useAIChatConversations({
    userId,
    welcomeMessage,
    newConversationTitle,
}: UseAIChatConversationsOptions) {
    const revision = useSyncExternalStore(onAuthSessionInvalidated, getAuthSessionRevision, getAuthSessionRevision);
    const owner = userId || null;
    const [stateOwner, setStateOwner] = useState({ owner, revision });
    const ownsState = stateOwner.owner === owner && stateOwner.revision === revision;
    const session = useMemo(() => ({ revision, ...captureAuthSession(userId) }), [userId, revision]);
    const canMutate = useCallback(() => ownsState && aiConversationService.isCurrentUser(owner)
        && session.isCurrent(), [ownsState, owner, session]);
    const [conversations, setConversations] = useState<Conversation[]>(() => {
        aiConversationService.setUserId(userId || null);
        return aiConversationService.getConversations();
    });
    const [activeId, setActiveId] = useState<string | null>(() => aiConversationService.getActiveConversationId());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');
    const [loadedOwner, setLoadedOwner] = useState<string | null | undefined>(undefined);

    const presentedConversations = useMemo(
        () => localizePristineAIChatConversations(
            ownsState ? conversations : [],
            welcomeMessage,
            newConversationTitle,
        ),
        [conversations, newConversationTitle, welcomeMessage, ownsState],
    );
    const activeConversation = useMemo(
        () => presentedConversations.find(conversation => conversation.id === activeId) || null,
        [activeId, presentedConversations],
    );
    const messages = useMemo(() => activeConversation?.messages || [], [activeConversation]);

    useEffect(() => {
        if (!canMutate()) return;
        const changed = presentedConversations.filter(
            (conversation, index) => conversation !== conversations[index]
                && !conversation.messages.some(message => message.isStreaming),
        );
        if (changed.length === 0) return;
        changed.forEach((conversation) => {
            aiConversationService.updateConversation(conversation.id, {
                title: conversation.title,
                messages: conversation.messages,
            });
        });
    }, [conversations, presentedConversations, canMutate]);

    useEffect(() => {
        let cancelled = false;
        const session = captureAuthSession(userId);
        aiConversationService.setUserId(owner);
        // Read local state immediately, but do not create an empty cloud chat
        // until the initial synchronization has finished.
        const local = aiConversationService.getConversations();
        queueMicrotask(() => {
            if (cancelled || !session.isCurrent()) return;
            setStateOwner({ owner, revision });
            setConversations(local);
            setActiveId(aiConversationService.getActiveConversationId());
            setEditingId(null);
            setEditingTitle('');
        });

        const applyConversations = (nextConversations: Conversation[]) => {
            if (cancelled || !session.isCurrent()) return;
            setConversations(nextConversations);
            setLoadedOwner(userId || null);
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
    }, [userId, owner, revision]);

    const handleNewChat = useCallback(() => {
        if (!canMutate()) return;
        const reusableConversation = resolvePristineAIChatConversationReuse(
            presentedConversations,
            welcomeMessage,
        );
        if (reusableConversation) {
            reusableConversation.redundantConversationIds.forEach(id => {
                void aiConversationService.deleteConversation(id);
            });
            setConversations(aiConversationService.getConversations());
            setActiveId(reusableConversation.conversationId);
            aiConversationService.setActiveConversationId(reusableConversation.conversationId);
            return;
        }

        const welcome: Message = {
            id: createAIChatMessageId(),
            role: 'assistant',
            content: welcomeMessage,
        };
        const conversation = aiConversationService.createConversation(welcome);
        aiConversationService.updateConversation(conversation.id, { title: newConversationTitle });
        setConversations(aiConversationService.getConversations());
        setActiveId(conversation.id);
    }, [newConversationTitle, presentedConversations, welcomeMessage, canMutate]);

    useEffect(() => {
        if (loadedOwner !== (userId || null) || conversations.length > 0) return;
        const timer = window.setTimeout(handleNewChat, 0);
        return () => window.clearTimeout(timer);
    }, [conversations.length, handleNewChat, userId, loadedOwner]);

    const handleSwitchChat = useCallback((id: string) => {
        if (!canMutate()) return;
        const nextId = resolveAIChatActiveConversationId(conversations, id);
        setActiveId(nextId);
        aiConversationService.setActiveConversationId(nextId);
    }, [conversations, canMutate]);

    const handleDeleteChat = useCallback((id: string, event?: React.MouseEvent) => {
        event?.stopPropagation();
        if (!canMutate()) return;
        void aiConversationService.deleteConversation(id);
        const updated = aiConversationService.getConversations();
        setConversations(updated);
        if (activeId === id) setActiveId(resolveAIChatActiveConversationId(updated, null));
    }, [activeId, canMutate]);

    const handleStartRename = useCallback((conversation: Conversation, event: React.MouseEvent) => {
        event.stopPropagation();
        setEditingId(conversation.id);
        setEditingTitle(conversation.title);
    }, []);

    const handleSaveRename = useCallback((id: string) => {
        if (!canMutate()) return;
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
    }, [conversations, editingTitle, canMutate]);

    const handleCancelRename = useCallback(() => {
        setEditingId(null);
        setEditingTitle('');
    }, []);

    const addLocalMessage = useCallback((role: 'user' | 'assistant', content: string) => {
        if (!activeId || !canMutate()) return;
        const message: Message = { id: createAIChatMessageId(), role, content };
        const activeMessages = aiConversationService
            .getConversations()
            .find(conversation => conversation.id === activeId)?.messages || [];
        aiConversationService.updateConversation(activeId, { messages: [...activeMessages, message] });
        setConversations(aiConversationService.getConversations());
    }, [activeId, canMutate]);

    return {
        conversations: presentedConversations,
        setConversations,
        activeId: ownsState ? activeId : null,
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
        handleCancelRename,
        addLocalMessage,
    };
}
