import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { describe, expect, it, vi } from 'vitest';

import { AIChatViewLayout } from '../AIChatViewLayout';
import { shouldCloseAIChatOnKeyDown } from '../aiChatEscape';

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
    handleCancelRename: vi.fn(),
    isSidebarOpen: true,
    setIsSidebarOpen: vi.fn(),
    aiConfig: { activeModelKey: 'provider:model' },
    availableModels: [{ label: 'Model', value: 'provider:model', group: 'Provider' }],
    activeModelName: 'Model',
    configurationState: { ready: true, providerId: 'provider', providerName: 'Provider' },
    canSubmitWithoutConfiguration: false,
    inputPlaceholder: 'Describe the diagram',
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

    it('treats history as a modal layer, closes only that layer on Escape, and restores focus', async () => {
        const StatefulHistoryLayout = () => {
            const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
            return (
                <AIChatViewLayout
                    {...createProps({ isSidebarOpen, setIsSidebarOpen })}
                />
            );
        };

        render(<StatefulHistoryLayout />);

        const trigger = screen.getByRole('button', { name: 'aiChat.viewHistory' });
        expect(screen.queryByRole('dialog', { name: 'aiChat.historyTitle' })).toBeNull();
        trigger.focus();
        fireEvent.click(trigger);

        const historyDialog = screen.getByRole('dialog', { name: 'aiChat.historyTitle' });
        const newConversation = screen.getByRole('button', { name: 'aiChat.newConversation' });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        await waitFor(() => expect(document.activeElement).toBe(newConversation));

        fireEvent.keyDown(historyDialog, { key: 'Escape' });

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'aiChat.historyTitle' })).toBeNull();
            expect(document.activeElement).toBe(trigger);
        });
        expect(screen.getByRole('textbox', { name: 'aiChat.inputLabel' })).not.toBeNull();
    });

    it('cancels inline rename on Escape without closing history and restores the rename trigger', async () => {
        const StatefulRenameLayout = () => {
            const [editingId, setEditingId] = React.useState<string | null>(null);
            return (
                <AIChatViewLayout
                    {...createProps({
                        editingId,
                        editingTitle: conversation.title,
                        handleStartRename: () => setEditingId(conversation.id),
                        handleCancelRename: () => setEditingId(null),
                    })}
                />
            );
        };

        render(<StatefulRenameLayout />);

        const renameTrigger = screen.getByRole('button', {
            name: `aiChat.renameConversation: ${conversation.title}`,
        });
        fireEvent.click(renameTrigger);

        const renameInput = screen.getByRole('textbox', {
            name: `aiChat.renameConversation: ${conversation.title}`,
        });
        await waitFor(() => expect(document.activeElement).toBe(renameInput));
        fireEvent.keyDown(renameInput, { key: 'Escape' });

        expect(screen.getByRole('dialog', { name: 'aiChat.historyTitle' })).not.toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', {
            name: `aiChat.renameConversation: ${conversation.title}`,
        })));
    });

    it('uses a localized, viewport-level dialog for destructive confirmation and restores focus on cancel', async () => {
        render(<AIChatViewLayout {...createProps()} />);

        const deleteTrigger = screen.getByRole('button', {
            name: `aiChat.deleteConversationLabel: ${conversation.title}`,
        });
        fireEvent.click(deleteTrigger);

        const confirmation = await screen.findByRole('alertdialog', { name: 'aiChat.deleteConversation' });
        expect(document.body.contains(confirmation)).toBe(true);
        expect(screen.getByText(`aiChat.deleteConversationDescription: ${conversation.title}`)).not.toBeNull();
        expect(screen.getByRole('button', { name: 'common.delete' })).not.toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'aiChat.deleteConversation' })).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(deleteTrigger));
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

    it('allows configuration-independent help commands while the provider is not ready', () => {
        const handleSendMessage = vi.fn(async () => undefined);
        render(<AIChatViewLayout {...createProps({
            configurationState: {
                ready: false,
                reason: 'missing-api-key',
                providerId: 'provider',
                providerName: 'Provider',
            },
            canSubmitWithoutConfiguration: true,
            inputValue: '/help',
            handleSendMessage,
        })} />);

        const composer = screen.getByRole('textbox', { name: 'aiChat.inputLabel' });
        const sendButton = screen.getByRole('button', { name: 'aiChat.sendMessage' });

        expect((sendButton as HTMLButtonElement).disabled).toBe(false);
        fireEvent.keyDown(composer, { key: 'Enter' });
        expect(handleSendMessage).toHaveBeenCalledTimes(1);
    });

    it('opens the provider responsible for the readiness warning', () => {
        const onOpenConfig = vi.fn();
        render(<AIChatViewLayout {...createProps({
            configurationState: {
                ready: false,
                reason: 'missing-api-key',
                providerId: 'provider',
                providerName: 'Provider',
            },
            onOpenConfig,
        })} />);

        fireEvent.click(screen.getByRole('button', { name: 'aiChat.configureNow' }));
        expect(onOpenConfig).toHaveBeenCalledWith('provider');
    });

    it('submits the preserved draft after configuration becomes ready', () => {
        const handleSendMessage = vi.fn(async () => undefined);
        render(<AIChatViewLayout {...createProps({ handleSendMessage })} />);

        const sendButton = screen.getByRole('button', { name: 'aiChat.sendMessage' });
        expect((sendButton as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(sendButton);
        expect(handleSendMessage).toHaveBeenCalledTimes(1);
    });

    it('keeps the chat open when Escape belongs to a nested interaction layer', () => {
        const parentDialog = document.createElement('div');
        parentDialog.setAttribute('role', 'dialog');
        const chatInput = document.createElement('textarea');
        parentDialog.appendChild(chatInput);

        const nestedDialog = document.createElement('div');
        nestedDialog.setAttribute('role', 'dialog');
        const nestedDialogButton = document.createElement('button');
        nestedDialog.appendChild(nestedDialogButton);

        const nestedMenu = document.createElement('div');
        nestedMenu.setAttribute('role', 'menu');
        const nestedMenuItem = document.createElement('button');
        nestedMenu.appendChild(nestedMenuItem);
        document.body.append(parentDialog, nestedDialog, nestedMenu);

        expect(shouldCloseAIChatOnKeyDown({ key: 'Enter', target: chatInput }, parentDialog)).toBe(false);
        expect(shouldCloseAIChatOnKeyDown({ key: 'Escape', target: chatInput }, parentDialog)).toBe(true);
        expect(shouldCloseAIChatOnKeyDown({ key: 'Escape', target: nestedDialogButton }, parentDialog)).toBe(false);
        expect(shouldCloseAIChatOnKeyDown({ key: 'Escape', target: nestedMenuItem }, parentDialog)).toBe(false);

        parentDialog.remove();
        nestedDialog.remove();
        nestedMenu.remove();
    });

    it('closes a docked chat without a parent dialog when no overlay owns Escape', () => {
        const chatInput = document.createElement('textarea');
        document.body.appendChild(chatInput);

        expect(shouldCloseAIChatOnKeyDown({ key: 'Escape', target: chatInput })).toBe(true);
        chatInput.remove();
    });
});
