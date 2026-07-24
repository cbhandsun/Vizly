import React from 'react';
import type { TFunction } from 'i18next';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import Modal from 'antd/es/modal';
import Input from 'antd/es/input';
import Button from 'antd/es/button';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import List from 'antd/es/list';
import Popconfirm from 'antd/es/popconfirm';
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
import { MemoizedMessageItem } from './AIChatMessageItem';

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
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
    aiConfig: { activeModelKey: string };
    availableModels: AIChatModelOption[];
    activeModelName: string;
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
    isSidebarOpen,
    setIsSidebarOpen,
    aiConfig,
    availableModels,
    activeModelName,
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
    return (
        <div className="ai-chat-container">
            {/* Overlay Sidebar: Conversations List */}
            {isSidebarOpen && (
                <div className="ai-chat-sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
            )}
            <div className={`ai-chat-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                <div className="ai-chat-sidebar-header">
                    <Typography.Text strong>{t('aiChat.historyTitle')}</Typography.Text>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => { handleNewChat(); setIsSidebarOpen(false); }} type="text" />
                </div>
                <div className="ai-chat-sidebar-list">
                    <List
                        dataSource={conversations}
                        renderItem={conv => (
                            <div
                                onClick={() => { handleSwitchChat(conv.id); setIsSidebarOpen(false); }}
                                className={`ai-chat-history-item ${activeId === conv.id ? 'active' : ''}`}
                            >
                                {editingId === conv.id ? (
                                    <Input
                                        size="small"
                                        value={editingTitle}
                                        onChange={e => setEditingTitle(e.target.value)}
                                        onPressEnter={() => handleSaveRename(conv.id)}
                                        onBlur={() => handleSaveRename(conv.id)}
                                        autoFocus
                                        onClick={e => e.stopPropagation()}
                                    />
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, flex: 1, marginRight: 8 }}>
                                            {conv.title}
                                        </div>
                                        <div className="item-actions" style={{ display: 'none' }}>
                                            <Space size={4}>
                                                <EditOutlined style={{ fontSize: 13, color: '#999' }} onClick={(e) => handleStartRename(conv, e)} />
                                                <Popconfirm
                                                    title={t('aiChat.deleteConversation')}
                                                    onConfirm={() => handleDeleteChat(conv.id)}
                                                    onCancel={e => e?.stopPropagation()}
                                                    placement="right"
                                                >
                                                    <DeleteOutlined style={{ fontSize: 13, color: '#ff4d4f' }} onClick={e => e.stopPropagation()} />
                                                </Popconfirm>
                                            </Space>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    />
                </div>
            </div>

            {/* Main Content Area */}
            {/* Inline Header */}
            <div className="ai-chat-inline-header">
                <Space size={4}>
                    <Button
                        icon={<MenuFoldOutlined />}
                        type="text"
                        size="small"
                        onClick={() => setIsSidebarOpen(true)}
                        title={t('aiChat.viewHistory')}
                    />
                    <Select
                        size="small"
                        variant="borderless"
                        value={aiConfig.activeModelKey}
                        onChange={handleModelChange}
                        dropdownMatchSelectWidth={false}
                        options={groupModelOptions(availableModels)}
                        labelRender={() => (
                            <span style={{ color: '#1677ff' }}>{activeModelName}</span>
                        )}
                        style={{ maxWidth: 160, fontWeight: 500 }}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle', marginLeft: 4 }} title={activeConversation?.title}>
                        {activeConversation?.title || ''}
                    </Typography.Text>
                </Space>
                <Space size={4}>
                    {user ? (
                        <Tooltip title={t('aiChat.loggedIn', { email: user.email })}>
                            <CloudServerOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                        </Tooltip>
                    ) : (
                        <Tooltip title={t('aiChat.notLoggedIn')}>
                            <CloudServerOutlined style={{ color: '#bfbfbf', fontSize: 14 }} />
                        </Tooltip>
                    )}
                    <Button icon={<SettingOutlined />} type="text" size="small" onClick={onOpenConfig} title={t('aiChat.settings')} />
                    <Button icon={<CloseOutlined />} type="text" size="small" onClick={onClose} title={t('aiChat.close')} />
                </Space>
            </div>

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
                        <div
                            key={cmd.key}
                            onClick={() => handleSelectCommand(cmd)}
                            className="ai-chat-command-item"
                        >
                            <Typography.Text code>{cmd.label}</Typography.Text>
                            <Typography.Text type="secondary">{cmd.description}</Typography.Text>
                        </div>
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
                                handleSendMessage();
                            }
                        }}
                        placeholder={t('aiChat.inputPlaceholder')}
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
                                title="Voice (Beta)"
                            />
                            <Button
                                type={loading ? 'default' : 'primary'}
                                danger={loading}
                                shape="circle"
                                icon={loading ? <StopOutlined /> : <SendOutlined />}
                                onClick={loading ? handleStopGeneration : handleSendMessage}
                                disabled={!loading && !inputValue.trim()}
                                title={loading ? '停止生成' : '发送'}
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
                    <div style={{ marginBottom: 8 }}>名称:</div>
                    <Input
                        value={saveTitle}
                        onChange={e => setSaveTitle(e.target.value)}
                        placeholder={t('aiChat.namePlaceholder')}
                        onPressEnter={executeSave}
                        autoFocus
                    />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                        将保存到: <span style={{ color: '#1677ff' }}>{saveTarget === 'local' ? '本地' : (saveTarget === 's3' ? 'S3' : 'Supabase')}</span>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
