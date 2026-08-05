import React from 'react';
import { createPortal } from 'react-dom';
import type { TFunction } from 'i18next';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import Modal from 'antd/es/modal';
import Input from 'antd/es/input';
import Button from 'antd/es/button';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import {
    AudioOutlined,
    CloudServerOutlined,
    CloseOutlined,
    DeleteOutlined,
    EditOutlined,
    MenuFoldOutlined,
    PlusOutlined,
    SendOutlined,
    SettingOutlined,
    StopOutlined,
} from '@ant-design/icons';

import type { Conversation, Message } from '@/services/ai/AIConversationService';
import type { AIChatSaveTarget } from './aiChatSave';
import type { AIChatConfigurationState } from './aiChatRequestConfig';
import { MemoizedMessageItem } from './AIChatMessageItem';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

export interface AIChatSlashCommand {
    key: string;
    label: string;
    description: string;
}

interface AIChatModelOption {
    label: string;
    value: string;
    group: string;
}

interface GroupedModelOption {
    label: string;
    options: Array<{ label: string; value: string }>;
}

const groupModelOptions = (models: AIChatModelOption[]): GroupedModelOption[] => (
    models.reduce<GroupedModelOption[]>((groups, model) => {
        const group = groups.find(candidate => candidate.label === model.group);
        if (group) {
            group.options.push({ label: model.label, value: model.value });
        } else {
            groups.push({
                label: model.group,
                options: [{ label: model.label, value: model.value }],
            });
        }
        return groups;
    }, [])
);

interface AIChatViewLayoutProps {
    t: TFunction;
    user: { email?: string | null } | null;
    conversations: Conversation[];
    activeId: string | null;
    activeConversation: Conversation | null;
    messages: Message[];
    editingId: string | null;
    editingTitle: string;
    setEditingTitle: (title: string) => void;
    handleNewChat: () => void;
    handleSwitchChat: (id: string) => void;
    handleDeleteChat: (id: string, event?: React.MouseEvent) => void;
    handleStartRename: (conversation: Conversation, event: React.MouseEvent) => void;
    handleSaveRename: (id: string) => void;
    handleCancelRename: () => void;
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
    aiConfig: { activeModelKey: string };
    availableModels: AIChatModelOption[];
    activeModelName: string;
    configurationState: AIChatConfigurationState;
    handleModelChange: (value: string) => void;
    onOpenConfig: () => void;
    onClose: () => void;
    onPreviewJson?: (json: string) => void;
    onApplyJson?: (json: string) => void;
    handleSaveDiagramTo: (json: string, target: AIChatSaveTarget) => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
    showCommands: boolean;
    filteredCommands: AIChatSlashCommand[];
    handleSelectCommand: (command: AIChatSlashCommand) => void;
    inputRef: React.RefObject<TextAreaRef | null>;
    inputValue: string;
    handleInputChange: (value: string) => void;
    handleSendMessage: () => Promise<void>;
    loading: boolean;
    isListening: boolean;
    handleVoiceToggle: () => void;
    handleStopGeneration: () => void;
    saveModalVisible: boolean;
    setSaveModalVisible: (visible: boolean) => void;
    executeSave: () => Promise<void>;
    saveTitle: string;
    setSaveTitle: (title: string) => void;
    saveTarget: AIChatSaveTarget | null;
}

export const AIChatViewLayout: React.FC<AIChatViewLayoutProps> = ({
    t,
    user,
    conversations,
    activeId,
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
    isSidebarOpen,
    setIsSidebarOpen,
    aiConfig,
    availableModels,
    activeModelName,
    configurationState,
    handleModelChange,
    onOpenConfig,
    onClose,
    onPreviewJson,
    onApplyJson,
    handleSaveDiagramTo,
    messagesEndRef,
    showCommands,
    filteredCommands,
    handleSelectCommand,
    inputRef,
    inputValue,
    handleInputChange,
    handleSendMessage,
    loading,
    isListening,
    handleVoiceToggle,
    handleStopGeneration,
    saveModalVisible,
    setSaveModalVisible,
    executeSave,
    saveTitle,
    setSaveTitle,
    saveTarget,
}) => {
    const historyNewConversationRef = React.useRef<HTMLButtonElement>(null);
    const renameFocusReturnIdRef = React.useRef<string | null>(null);
    const deleteTriggerRef = React.useRef<HTMLElement | null>(null);
    const deleteCancelButtonRef = React.useRef<HTMLButtonElement>(null);
    const previousEditingIdRef = React.useRef<string | null>(editingId);
    const previousPendingDeleteIdRef = React.useRef<string | null>(null);
    const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
    const pendingDeleteConversation = conversations.find(conversation => conversation.id === pendingDeleteId) ?? null;
    const closeHistorySidebar = React.useCallback(() => {
        setIsSidebarOpen(false);
    }, [setIsSidebarOpen]);
    const {
        containerRef: historySidebarRef,
        handleKeyDown: handleHistorySidebarKeyDown,
    } = useModalFocusTrap<HTMLDivElement>({
        active: isSidebarOpen,
        initialFocusRef: historyNewConversationRef,
        onClose: closeHistorySidebar,
    });

    React.useEffect(() => {
        const previousEditingId = previousEditingIdRef.current;
        previousEditingIdRef.current = editingId;
        if (!previousEditingId || editingId !== null || !isSidebarOpen) return;
        const conversationId = renameFocusReturnIdRef.current;
        renameFocusReturnIdRef.current = null;
        queueMicrotask(() => {
            const renameTrigger = Array.from(
                historySidebarRef.current?.querySelectorAll<HTMLButtonElement>('[data-ai-chat-rename-id]') ?? [],
            ).find(button => button.dataset.aiChatRenameId === conversationId);
            renameTrigger?.focus();
        });
    }, [editingId, historySidebarRef, isSidebarOpen]);

    const handleRenameKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        handleCancelRename();
    }, [handleCancelRename]);

    const openDeleteConfirmation = React.useCallback((
        id: string,
        event: React.MouseEvent<HTMLElement>,
    ) => {
        event.stopPropagation();
        deleteTriggerRef.current = event.currentTarget;
        setPendingDeleteId(id);
    }, []);

    const closeDeleteConfirmation = React.useCallback(() => {
        setPendingDeleteId(null);
    }, []);

    const confirmDeleteConversation = React.useCallback(() => {
        if (!pendingDeleteId) return;
        handleDeleteChat(pendingDeleteId);
        setPendingDeleteId(null);
    }, [handleDeleteChat, pendingDeleteId]);

    const restoreDeleteFocus = React.useCallback(() => {
        const trigger = deleteTriggerRef.current;
        deleteTriggerRef.current = null;
        queueMicrotask(() => {
            if (trigger?.isConnected) {
                trigger.focus();
            } else if (historyNewConversationRef.current?.isConnected) {
                historyNewConversationRef.current.focus();
            }
        });
    }, []);

    const {
        containerRef: deleteDialogRef,
        handleKeyDown: handleDeleteDialogKeyDown,
    } = useModalFocusTrap<HTMLDivElement>({
        active: pendingDeleteConversation !== null,
        initialFocusRef: deleteCancelButtonRef,
        onClose: closeDeleteConfirmation,
    });

    React.useEffect(() => {
        const previousPendingDeleteId = previousPendingDeleteIdRef.current;
        previousPendingDeleteIdRef.current = pendingDeleteId;
        if (!previousPendingDeleteId || pendingDeleteId !== null) return;
        restoreDeleteFocus();
    }, [pendingDeleteId, restoreDeleteFocus]);

    return (
        <div className="ai-chat-container">
            {/* Overlay Sidebar: Conversations List */}
            {isSidebarOpen && (
                <div
                    className="ai-chat-sidebar-overlay"
                    aria-hidden="true"
                    onClick={closeHistorySidebar}
                />
            )}
            {isSidebarOpen && (
                <div
                    id="ai-chat-history-dialog"
                    ref={historySidebarRef}
                    className="ai-chat-sidebar open"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ai-chat-history-title"
                    data-preserve-dialog-on-escape="true"
                    tabIndex={-1}
                    onKeyDown={handleHistorySidebarKeyDown}
                >
                    <div className="ai-chat-sidebar-header">
                        <Typography.Text id="ai-chat-history-title" strong>
                            {t('aiChat.historyTitle')}
                        </Typography.Text>
                        <Button
                            ref={historyNewConversationRef}
                            className="ai-chat-new-conversation"
                            size="small"
                            icon={<PlusOutlined />}
                            aria-label={t('aiChat.newConversation')}
                            onClick={() => { handleNewChat(); closeHistorySidebar(); }}
                            type="text"
                        />
                    </div>
                    <div className="ai-chat-sidebar-list">
                        <div role="list" aria-label={t('aiChat.historyTitle')}>
                            {conversations.map(conv => (
                                <div
                                    key={conv.id}
                                    role="listitem"
                                    className={`ai-chat-history-item ${activeId === conv.id ? 'active' : ''}`}
                                >
                                    {editingId === conv.id ? (
                                        <Input
                                            aria-label={t('aiChat.renameConversation', { title: conv.title })}
                                            size="small"
                                            value={editingTitle}
                                            onChange={e => setEditingTitle(e.target.value)}
                                            onPressEnter={() => handleSaveRename(conv.id)}
                                            onBlur={() => handleSaveRename(conv.id)}
                                            onKeyDown={handleRenameKeyDown}
                                            autoFocus
                                            maxLength={200}
                                            data-preserve-dialog-on-escape="true"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="ai-chat-history-main"
                                                aria-current={activeId === conv.id ? 'true' : undefined}
                                                onClick={() => { handleSwitchChat(conv.id); closeHistorySidebar(); }}
                                            >
                                                <span className="ai-chat-history-title" title={conv.title}>{conv.title}</span>
                                            </button>
                                            <div className="item-actions">
                                                <Space size={4}>
                                                    <Button
                                                        className="ai-chat-history-action"
                                                        type="text"
                                                        icon={<EditOutlined />}
                                                        aria-label={t('aiChat.renameConversation', { title: conv.title })}
                                                        data-ai-chat-rename-id={conv.id}
                                                        onClick={(event) => {
                                                            renameFocusReturnIdRef.current = conv.id;
                                                            handleStartRename(conv, event);
                                                        }}
                                                    />
                                                    <Button
                                                        className="ai-chat-history-action"
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        aria-label={t('aiChat.deleteConversationLabel', { title: conv.title })}
                                                        onClick={(event) => openDeleteConfirmation(conv.id, event)}
                                                    />
                                                </Space>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {pendingDeleteConversation && createPortal(
                <div className="ai-chat-delete-dialog-mask">
                    <div
                        ref={deleteDialogRef}
                        className="ai-chat-delete-dialog"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="ai-chat-delete-conversation-title"
                        aria-describedby="ai-chat-delete-conversation-description"
                        tabIndex={-1}
                        onKeyDown={handleDeleteDialogKeyDown}
                    >
                        <Typography.Title id="ai-chat-delete-conversation-title" level={5}>
                            {t('aiChat.deleteConversation')}
                        </Typography.Title>
                        <Typography.Paragraph id="ai-chat-delete-conversation-description">
                            {t('aiChat.deleteConversationDescription', {
                                title: pendingDeleteConversation.title,
                            })}
                        </Typography.Paragraph>
                        <div className="ai-chat-delete-dialog-actions">
                            <Button ref={deleteCancelButtonRef} onClick={closeDeleteConfirmation}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="primary" danger onClick={confirmDeleteConversation}>
                                {t('common.delete')}
                            </Button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* Main Content Area */}
            {/* Inline Header */}
            <div className="ai-chat-inline-header">
                <Space className="ai-chat-inline-primary" size={4}>
                    <Button
                        className="ai-chat-inline-action"
                        icon={<MenuFoldOutlined />}
                        type="text"
                        size="small"
                        onClick={() => setIsSidebarOpen(true)}
                        title={t('aiChat.viewHistory')}
                        aria-label={t('aiChat.viewHistory')}
                        aria-expanded={isSidebarOpen}
                        aria-controls="ai-chat-history-dialog"
                    />
                    <Select
                        className="ai-chat-model-select"
                        aria-label={t('aiChat.modelSelectLabel')}
                        size="small"
                        variant="borderless"
                        value={aiConfig.activeModelKey}
                        onChange={handleModelChange}
                        popupMatchSelectWidth={false}
                        options={groupModelOptions(availableModels)}
                        labelRender={() => (
                            <span style={{ color: '#1677ff' }}>{activeModelName}</span>
                        )}
                        style={{ maxWidth: 160, fontWeight: 500 }}
                    />
                    <Typography.Text className="ai-chat-conversation-title" type="secondary" title={activeConversation?.title}>
                        {activeConversation?.title || ''}
                    </Typography.Text>
                </Space>
                <Space className="ai-chat-inline-secondary" size={4}>
                    {user ? (
                        <Tooltip title={t('aiChat.loggedIn', { email: user.email })}>
                            <CloudServerOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                        </Tooltip>
                    ) : (
                        <Tooltip title={t('aiChat.notLoggedIn')}>
                            <CloudServerOutlined style={{ color: '#bfbfbf', fontSize: 14 }} />
                        </Tooltip>
                    )}
                    <Button
                        className="ai-chat-inline-action"
                        icon={<SettingOutlined />}
                        type="text"
                        size="small"
                        onClick={onOpenConfig}
                        title={t('aiChat.settings')}
                        aria-label={t('aiChat.settings')}
                    />
                    <Button
                        className="ai-chat-inline-action"
                        icon={<CloseOutlined />}
                        type="text"
                        size="small"
                        onClick={onClose}
                        title={t('aiChat.close')}
                        aria-label={t('aiChat.close')}
                    />
                </Space>
            </div>

            {!configurationState.ready && (
                <div className="ai-chat-configuration-status" role="status">
                    <div className="ai-chat-configuration-copy">
                        <Typography.Text strong>{t('aiChat.configStatusTitle')}</Typography.Text>
                        <Typography.Text type="secondary">
                            {t(`aiChat.configReason.${configurationState.reason}`, {
                                provider: configurationState.providerName ?? '',
                            })}
                        </Typography.Text>
                    </div>
                    <Button type="link" onClick={onOpenConfig}>
                        {t('aiChat.configureNow')}
                    </Button>
                </div>
            )}

            {/* Content */}
            <div className="ai-chat-messages">
                {messages.map(item => (
                    <MemoizedMessageItem
                        key={item.id}
                        item={item}
                        t={t}
                        onPreviewJson={onPreviewJson}
                        onApplyJson={onApplyJson}
                        handleSaveDiagramTo={handleSaveDiagramTo}
                    />
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Slash Command Menu */}
            {showCommands && (
                <div className="ai-chat-commands">
                    {filteredCommands.map(cmd => (
                        <button
                            type="button"
                            key={cmd.key}
                            onClick={() => handleSelectCommand(cmd)}
                            className="ai-chat-command-item"
                        >
                            <Typography.Text code>{cmd.label}</Typography.Text>
                            <Typography.Text type="secondary">{cmd.description}</Typography.Text>
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <div className="ai-chat-input-area">
                <div className="ai-chat-input-row">
                    <Input.TextArea
                        ref={inputRef}
                        value={inputValue}
                        onChange={e => handleInputChange(e.target.value)}
                        onPressEnter={(e) => {
                            if (!e.shiftKey) {
                                e.preventDefault();
                                if (configurationState.ready) {
                                    handleSendMessage();
                                }
                            }
                        }}
                        placeholder={t('aiChat.inputPlaceholder')}
                        aria-label={t('aiChat.inputLabel')}
                        autoSize={{ minRows: 1, maxRows: 6 }}
                        disabled={loading}
                        className="ai-chat-textarea"
                    />
                    <div className="ai-chat-input-tools">
                        <span className="ai-chat-input-hint">{t('aiChat.inputHint')}</span>
                        <Space size={8}>
                            <Button
                                className={`voice-btn ${isListening ? 'listening' : ''}`}
                                icon={<AudioOutlined />}
                                shape="circle"
                                onClick={handleVoiceToggle}
                                aria-label={t('aiChat.voiceInput')}
                                aria-pressed={isListening}
                                title={t('aiChat.voiceInput')}
                            />
                            <Button
                                type={loading ? 'default' : 'primary'}
                                danger={loading}
                                shape="circle"
                                icon={loading ? <StopOutlined /> : <SendOutlined />}
                                onClick={loading ? handleStopGeneration : handleSendMessage}
                                disabled={!loading && (!inputValue.trim() || !configurationState.ready)}
                                aria-label={loading
                                    ? t('aiChat.stopGeneration')
                                    : configurationState.ready
                                        ? t('aiChat.sendMessage')
                                        : `${t('aiChat.sendMessage')}: ${t(`aiChat.configReason.${configurationState.reason}`, {
                                            provider: configurationState.providerName ?? '',
                                        })}`}
                                title={loading
                                    ? t('aiChat.stopGeneration')
                                    : configurationState.ready
                                        ? t('aiChat.sendMessage')
                                        : t('aiChat.configureBeforeSending')}
                                className="ai-chat-send-btn"
                            />
                        </Space>
                    </div>
                </div>
            </div>

            {/* Save Dialog */}
            <Modal
                title={t('aiChat.saveDialogTitle')}
                open={saveModalVisible}
                onOk={executeSave}
                onCancel={() => setSaveModalVisible(false)}
                okText={t('aiChat.confirmSave')}
                cancelText={t('aiChat.cancel')}
            >
                <div style={{ padding: '10px 0' }}>
                    <label className="ai-chat-save-label" htmlFor="ai-chat-save-title">
                        {t('aiChat.nameLabel')}
                    </label>
                    <Input
                        id="ai-chat-save-title"
                        value={saveTitle}
                        onChange={e => setSaveTitle(e.target.value)}
                        placeholder={t('aiChat.namePlaceholder')}
                        maxLength={200}
                        onPressEnter={executeSave}
                        autoFocus
                    />
                    <div className="ai-chat-save-target">
                        {t('aiChat.saveTarget')} <span>{saveTarget === 'local' ? t('aiChat.localTarget') : (saveTarget === 's3' ? 'S3' : 'Supabase')}</span>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
