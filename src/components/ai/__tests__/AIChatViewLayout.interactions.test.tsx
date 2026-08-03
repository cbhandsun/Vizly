import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { describe, expect, it, vi } from 'vitest';

import { AIChatViewLayout } from '../AIChatViewLayout';

type LayoutProps = React.ComponentProps<typeof AIChatViewLayout>;

class TestResizeObserver implements ResizeObserver {
    disconnect(): void {}

    observe(): void {}

    unobserve(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: TestResizeObserver,
});

const conversation = {
    id: 'conversation-1',
    title: 'Architecture review',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
};

const translate = ((key: string, options?: { title?: string }) => (
    options?.title ? `${key}: ${options.title}` : key
)) as LayoutProps['t'];

const createProps = (overrides: Partial<LayoutProps> = {}): LayoutProps => ({
    t: translate,
    user: null,
    conversations: [conversation],
    activeId: conversation.id,
    activeConversation: conversation,
    messages: [],
    editingId: null,
    editingTitle: '',
    setEditingTitle: vi.fn(),
    handleNewChat: vi.fn(),
    handleSwitchChat: vi.fn(),
    handleDeleteChat: vi.fn(),
    handleStartRename: vi.fn(),
    handleSaveRename: vi.fn(),
    isSidebarOpen: true,
    setIsSidebarOpen: vi.fn(),
    aiConfig: { activeModelKey: 'provider:model' },
    availableModels: [{ label: 'Model', value: 'provider:model', group: 'Provider' }],
    activeModelName: 'Model',
    configurationState: { ready: true, providerName: 'Provider' },
    handleModelChange: vi.fn(),
    onOpenConfig: vi.fn(),
    onClose: vi.fn(),
    onPreviewJson: vi.fn(),
    onApplyJson: vi.fn(),
    handleSaveDiagramTo: vi.fn(),
    messagesEndRef: React.createRef<HTMLDivElement>(),
    showCommands: false,
    filteredCommands: [],
    handleSelectCommand: vi.fn(),
    inputRef: React.createRef<TextAreaRef>(),
    inputValue: 'Draft question',
    handleInputChange: vi.fn(),
    handleSendMessage: vi.fn(async () => undefined),
    loading: false,
    isListening: false,
    handleVoiceToggle: vi.fn(),
    handleStopGeneration: vi.fn(),
    saveModalVisible: false,
    setSaveModalVisible: vi.fn(),
    executeSave: vi.fn(async () => undefined),
    saveTitle: '',
    setSaveTitle: vi.fn(),
    saveTarget: null,
    ...overrides,
});

describe('AIChatViewLayout commercial interactions', () => {
    it('opens a history item through a native named button and exposes named management actions', () => {
        const handleSwitchChat = vi.fn();
        const setIsSidebarOpen = vi.fn();
        render(<AIChatViewLayout {...createProps({ handleSwitchChat, setIsSidebarOpen })} />);

        fireEvent.click(screen.getByRole('button', { name: conversation.title }));

        expect(handleSwitchChat).toHaveBeenCalledWith(conversation.id);
        expect(setIsSidebarOpen).toHaveBeenCalledWith(false);
        expect(screen.getByRole('button', {
            name: `aiChat.renameConversation: ${conversation.title}`,
        })).not.toBeNull();
        expect(screen.getByRole('button', {
            name: `aiChat.deleteConversationLabel: ${conversation.title}`,
        })).not.toBeNull();
    });

    it('keeps the draft editable but blocks click and Enter submission until configuration is ready', () => {
        const handleSendMessage = vi.fn(async () => undefined);
        render(<AIChatViewLayout {...createProps({
            configurationState: {
                ready: false,
                reason: 'missing-api-key',
                providerName: 'Provider',
            },
            handleSendMessage,
        })} />);

        const composer = screen.getByRole('textbox', { name: 'aiChat.inputLabel' });
        const sendButton = screen.getByRole('button', { name: /aiChat.sendMessage/ });

        expect((composer as HTMLTextAreaElement).disabled).toBe(false);
        expect((sendButton as HTMLButtonElement).disabled).toBe(true);
        fireEvent.keyDown(composer, { key: 'Enter' });
        expect(handleSendMessage).not.toHaveBeenCalled();
    });

    it('submits the preserved draft after configuration becomes ready', () => {
        const handleSendMessage = vi.fn(async () => undefined);
        render(<AIChatViewLayout {...createProps({ handleSendMessage })} />);

        const sendButton = screen.getByRole('button', { name: 'aiChat.sendMessage' });
        expect((sendButton as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(sendButton);
        expect(handleSendMessage).toHaveBeenCalledTimes(1);
    });
});
