import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { getAIConfig, loadCloudAIConfig, persistAIConfig } from './aiConfigStorage';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { PluginRegistry } from '@/core/services/PluginRegistry';
import { aiConversationService, type Message } from '@/services/ai/AIConversationService';
import { executeAICommandContent, type AICommandExecutionSuccess } from './aiCommandExecution';
import type { AIChatPanelProps } from './types';
import {
    logAIChatCloudConfigLoadFailure,
    logAICommandExecutionError,
    logBlockedAutonomousCommand,
} from './aiLogging';
import './AIChatPanel.css';
import './AIChatCommercialInteractions.css';
import { appMessage } from '@/core/utils/antdStaticBridge';
import type { PluginContext } from '@/core/types/plugin';
import { useAIChatDiagramSave } from './useAIChatDiagramSave';
import { useAIChatConversations } from './useAIChatConversations';
import { createAIChatMessageId } from './aiChatConversationModel';
import { AIChatViewLayout, type AIChatSlashCommand } from './AIChatViewLayout';
import { useAIChatRequestLifecycle } from './useAIChatRequestLifecycle';
import { getAIChatConfigurationState } from './aiChatRequestConfig';
import { shouldCloseAIChatOnKeyDown } from './aiChatEscape';
import {
    isConfigurationIndependentAIChatInput,
    resolveAIChatCopyKeys,
} from './aiChatPresentation';

// --- Message Item Component (with Memo) ---
/**
 * The internal view component for AI Chat, suitable for both Drawer and Sidebar embedding.
 */

export const AIChatView: React.FC<Omit<AIChatPanelProps, 'open'>> = ({ onClose, onOpenConfig, onApplyJson, onPreviewJson, diagramNodesRef, diagramEdgesRef, canvasOps, pluginId, diagramId }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const copyKeys = resolveAIChatCopyKeys(pluginId);
    const welcomeMessage = t(copyKeys.welcomeMessage);

    // --- State ---
    // [M-8] Memoize SLASH_COMMANDS: t() results are stable between renders unless locale changes.
    // Previously rebuilt on every render, causing filteredCommands comparison instability.
    const SLASH_COMMANDS = useMemo<AIChatSlashCommand[]>(() => [
        { key: '/add', label: t('aiChat.commands.add.label'), description: t('aiChat.commands.add.desc') },
        { key: '/connect', label: t('aiChat.commands.connect.label'), description: t('aiChat.commands.connect.desc') },
        { key: '/layout', label: t('aiChat.commands.layout.label'), description: t('aiChat.commands.layout.desc') },
        { key: '/delete', label: t('aiChat.commands.delete.label'), description: t('aiChat.commands.delete.desc') },
        { key: '/group', label: t('aiChat.commands.group.label'), description: t('aiChat.commands.group.desc') },
        { key: '/generate', label: t('aiChat.commands.generate.label'), description: t('aiChat.commands.generate.desc') },
        { key: '/analyze', label: t('aiChat.commands.analyze.label'), description: t('aiChat.commands.analyze.desc') },
        { key: '/sequence', label: t('aiChat.commands.sequence.label'), description: t('aiChat.commands.sequence.desc') },
        { key: '/doc', label: t('aiChat.commands.doc.label'), description: t('aiChat.commands.doc.desc') },
        { key: '/clear', label: t('aiChat.commands.clear.label'), description: t('aiChat.commands.clear.desc') },
        { key: '/help', label: t('aiChat.commands.help.label'), description: t('aiChat.commands.help.desc') },
    ], [t]);

    const {
        conversations,
        setConversations,
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
        addLocalMessage,
    } = useAIChatConversations({
        userId: user?.id,
        welcomeMessage,
        newConversationTitle: t('aiChat.newConversationTitle'),
    });
    const [inputValue, setInputValue] = useState('');
    const [showCommands, setShowCommands] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to closed overlay
    const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
    const [isListening, setIsListening] = useState(false); // Voice UI Feedback state
    const canSubmitWithoutConfiguration = isConfigurationIndependentAIChatInput(inputValue);

    const [aiConfig, setAiConfig] = useState(() => getAIConfig(user?.id));

    useEffect(() => {
        let cancelled = false;
        const handleConfigChange = () => {
            if (!cancelled) setAiConfig(getAIConfig(user?.id));
        };
        const refreshTimer = window.setTimeout(handleConfigChange, 0);
        window.addEventListener('storage', handleConfigChange);
        window.addEventListener('aiConfigChanged', handleConfigChange);
        return () => {
            cancelled = true;
            window.clearTimeout(refreshTimer);
            window.removeEventListener('storage', handleConfigChange);
            window.removeEventListener('aiConfigChanged', handleConfigChange);
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;

        let cancelled = false;
        loadCloudAIConfig(user.id)
            .then((cloudConfig) => {
                if (!cancelled && cloudConfig) {
                    setAiConfig(cloudConfig);
                }
            })
            .catch(err => {
                logAIChatCloudConfigLoadFailure(err);
            });

        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const availableModels = useMemo(() => {
        const models: { label: string, value: string, group: string }[] = [];
        aiConfig.providers.filter(p => p.enabled).forEach(p => {
            p.models.filter(m => m.enabled).forEach(m => {
                models.push({
                    label: m.name || m.id,
                    value: `${p.id}:${m.id}`,
                    group: p.name
                });
            });
        });
        return models;
    }, [aiConfig]);

    // Ensure active model is valid and enabled
    useEffect(() => {
        let fallbackTimer: number | undefined;
        const parts = (aiConfig.activeModelKey || '').split(':');
        const pId = parts[0];
        const mId = parts.slice(1).join(':');
        const provider = aiConfig.providers.find(p => p.id === pId);
        const model = provider?.models.find(m => m.id === mId);

        if (!provider?.enabled || !model?.enabled) {
            if (availableModels.length > 0) {
                const fallback = availableModels[0];
                if (aiConfig.activeModelKey !== fallback.value) {
                    const newConfig = { ...aiConfig, activeModelKey: fallback.value };
                    fallbackTimer = window.setTimeout(() => {
                        setAiConfig(newConfig);
                        persistAIConfig(user?.id, newConfig);
                    }, 0);
                }
            }
        }

        return () => {
            if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
        };
    }, [aiConfig, availableModels, user?.id]);

    // Find the readable name for the currently active model (even if disabled)
    const activeModelName = useMemo(() => {
        const parts = (aiConfig.activeModelKey || '').split(':');
        const pId = parts[0];
        const mId = parts.slice(1).join(':');
        const p = aiConfig.providers.find(prov => prov.id === pId);
        if (p) {
            const m = p.models.find(mod => mod.id === mId);
            if (m) return m.name || m.id;
        }
        return mId || aiConfig.activeModelKey;
    }, [aiConfig]);

    const configurationState = useMemo(
        () => getAIChatConfigurationState(aiConfig),
        [aiConfig],
    );

    const handleModelChange = (val: string) => {
        const newConfig = { ...aiConfig, activeModelKey: val };
        setAiConfig(newConfig);
        persistAIConfig(user?.id, newConfig);
        appMessage.success(t('aiChat.autoSwitched', { name: availableModels.find(m => m.value === val)?.label || val }));
    };

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<TextAreaRef>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const parentDialog = messagesEndRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
            if (shouldCloseAIChatOnKeyDown(e, parentDialog)) {
                onClose();
            }
            // Alt + / Toggle Sidebar
            if (e.altKey && e.key === '/') {
                e.preventDefault();
                setIsSidebarOpen(prev => !prev);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const notifyCommandSuccess = (event: AICommandExecutionSuccess) => {
        switch (event.type) {
            case 'node-added':
                appMessage.success(t('aiChat.status.nodeAdded', { label: event.label }));
                break;
            case 'nodes-connected':
                appMessage.success(t('aiChat.status.connected', { label: event.label }));
                break;
            case 'layout-applied':
                appMessage.success(t('aiChat.status.layoutApplied', { strategy: event.strategy || t('aiChat.status.smartLayout') }));
                break;
            case 'group-created':
                appMessage.success(t('aiChat.status.groupCreated', { name: event.name || t('aiChat.status.smartGroup') }));
                break;
        }
    };

    const processCommands = (content: string) => executeAICommandContent({
        content,
        canvasOps,
        pluginId,
        resolvePluginContext: () => {
            if (pluginId === 'flowchart') {
                return (window as Window & { __flowContextBridge?: unknown }).__flowContextBridge ?? null;
            }
            if (!diagramNodesRef) return null;
            return {
                getNodes: () => diagramNodesRef.current,
                getEdges: () => diagramEdgesRef?.current || [],
                addNode: canvasOps?.onAddNode,
                updateNodesBatch: (ids: string[], updates: Record<string, unknown>) => canvasOps?.onUpdateNodes?.(ids, updates),
                takeSnapshot: () => {},
                diagramId,
            };
        },
        executePluginAction: (targetPluginId, command, context) => (
            PluginRegistry.getInstance().executeAIAction(
                targetPluginId,
                command.action,
                command,
                context as PluginContext,
            )
        ),
        onRejected: (action, reason) => {
            logBlockedAutonomousCommand(action, reason);
            appMessage.warning(`AI 指令 "${action}" 已被拦截：${reason}`);
        },
        onSuccess: notifyCommandSuccess,
        onExecutionError: logAICommandExecutionError,
    });

    // --- Handle Slash Commands ---
    const handleSlashCommand = (command: string): boolean => {
        const trimmed = command.trim();
        const lower = trimmed.toLowerCase();
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        if (lower === '/clear') {
            const welcomeMsg: Message = { id: createAIChatMessageId(), role: 'assistant', content: t('aiChat.clearedMsg') };
            if (activeId) {
                aiConversationService.updateConversation(activeId, { messages: [welcomeMsg] });
                setConversations(aiConversationService.getConversations());
            }
            return true;
        }

        if (lower === '/help') {
            const categories = {
                general: SLASH_COMMANDS.filter(c => !['/brainstorm'].includes(c.key)),
                ai: [
                    { key: '/analyze', label: '/analyze', description: t('aiChat.help.analyzeDescription') },
                    { key: '/brainstorm', label: '/brainstorm', description: t('aiChat.help.brainstormDescription') }
                ]
            };
            
            const renderCategory = (title: string, cmds: AIChatSlashCommand[]) =>
                `### ${title}\n` + cmds.map(c => `- **${c.label}**: ${c.description}`).join('\n');

            const helpMarkdown = `
${renderCategory(t('aiChat.help.generalTitle'), categories.general)}

${renderCategory(t('aiChat.help.aiTitle'), categories.ai)}

> ${t('aiChat.help.tip')}
`;
            addLocalMessage('assistant', helpMarkdown);
            return true;
        }

        if (lower.startsWith('/brainstorm')) {
            if (pluginId !== 'mindmap') {
                addLocalMessage('assistant', t('aiChat.status.cmdBrainstormOnlyMindmap'));
                return true;
            }
            // 劫持输入，注入特定的 brainstorm prompt
            setInputValue('请帮我针对当前画布上的核心节点进行头脑风暴，发散 3-5 个有创意的子主题。');
            setTimeout(() => handleSendMessage(), 10);
            return true;
        }

        // ⚡ /add — 直接添加节点
        if (cmd === '/add' && args) {
            if (canvasOps?.onAddNode) {
                addLocalMessage('user', trimmed);
                const newId = canvasOps.onAddNode(args);
                addLocalMessage('assistant', `✅ ${t('aiChat.status.nodeAdded', { label: args })}${newId ? ` (ID: ${newId})` : ''}`);
                return true;
            }
        }

        // ⚡ /delete — 直接删除节点
        if (cmd === '/delete' && args) {
            const diagramNodes = diagramNodesRef?.current;
            if (canvasOps?.onDeleteNodes && diagramNodes) {
                addLocalMessage('user', trimmed);
                const keyword = args.toLowerCase();
                const matches = diagramNodes.filter(n => {
                    const label = String(n.data?.label || n.data?.description || '').toLowerCase();
                    return label.includes(keyword);
                });
                if (matches.length > 0) {
                    canvasOps.onDeleteNodes(matches.map(n => n.id));
                    addLocalMessage('assistant', `🗑️ ${t('aiChat.status.nodesDeleted', { count: matches.length })} 「${args}」`);
                } else {
                    addLocalMessage('assistant', `⚠️ ${t('aiChat.status.noMatchFound', { query: args })}`);
                }
                return true;
            }
        }

        // ⚡ /group — 直接对匹配节点分组
        if (cmd === '/group' && args) {
            const diagramNodes = diagramNodesRef?.current;
            if (canvasOps?.onGroupNodes && diagramNodes) {
                addLocalMessage('user', trimmed);
                const keyword = args.toLowerCase();
                const matches = diagramNodes.filter(n => {
                    const label = String(n.data?.label || n.data?.description || '').toLowerCase();
                    return label.includes(keyword);
                });
                if (matches.length > 0) {
                    canvasOps.onGroupNodes(matches.map(n => n.id), args);
                    addLocalMessage('assistant', `📦 ${t('aiChat.status.groupCreated', { name: args })}`);
                } else {
                    addLocalMessage('assistant', `⚠️ ${t('aiChat.status.noMatchFound', { query: args })}`);
                }
                return true;
            }
        }

        // ⚡ /connect — 直接连接节点
        if (cmd === '/connect') {
            const diagramNodes = diagramNodesRef?.current;
            if (canvasOps?.onConnectNodes && diagramNodes) {
                addLocalMessage('user', trimmed);
                // 支持格式: /connect A B 或 /connect A -> B
                const connectArgs = args.replace('->', ' ').trim().split(/\s+/);
                if (connectArgs.length >= 2) {
                    const findNode = (keyword: string) => {
                        const kw = keyword.toLowerCase();
                        return diagramNodes.find(n => {
                            const label = String(n.data?.label || n.data?.description || '').toLowerCase();
                            return label.includes(kw) || n.id.toLowerCase().includes(kw);
                        });
                    };
                    const sourceNode = findNode(connectArgs[0]);
                    const targetNode = findNode(connectArgs[connectArgs.length - 1]);
                    if (sourceNode && targetNode) {
                        canvasOps.onConnectNodes(sourceNode.id, targetNode.id);
                        addLocalMessage('assistant', `🔗 ${t('aiChat.status.connected', { label: `${connectArgs[0]} → ${connectArgs[connectArgs.length - 1]}` })}`);
                    } else {
                        const missing = !sourceNode ? connectArgs[0] : connectArgs[connectArgs.length - 1];
                        addLocalMessage('assistant', `⚠️ ${t('aiChat.status.nodeNotFound', { name: missing })}`);
                    }
                } else {
                    addLocalMessage('assistant', t('aiChat.status.connectFormat'));
                }
                return true;
            }
        }

        // ⚡ /layout — 直接触发布局
        if (cmd === '/layout') {
            if (canvasOps?.onAutoLayout) {
                addLocalMessage('user', trimmed);
                canvasOps.onAutoLayout(args || undefined);
                addLocalMessage('assistant', `📐 ${t('aiChat.status.layoutApplied', { strategy: args || t('aiChat.status.smartLayout') })}`);
                return true;
            }
        }

        // ⚡ /reset — 重置会话
        if (cmd === '/reset') {
            if (activeId) {
                aiConversationService.updateConversation(activeId, { messages: [] });
                setConversations(aiConversationService.getConversations());
                appMessage.success(t('aiChat.status.resetSuccess'));
                return true;
            }
        }

        // ⚡ /shortcuts — 显示快捷键指南
        if (cmd === '/shortcuts' || cmd === '/help') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', t('aiChat.status.cmdGuide')); 
            return true;
        }

        // ⚡ /present — 开启演示模式
        if (cmd === '/present') {
            if (canvasOps?.onTogglePresentation) {
                addLocalMessage('user', trimmed);
                canvasOps.onTogglePresentation(true);
                addLocalMessage('assistant', t('aiChat.status.cmdPresent'));
                return true;
            }
        }

        // ⚡ /exit — 退出演示模式
        if (cmd === '/exit' || cmd === '/quit') {
            if (canvasOps?.onTogglePresentation) {
                addLocalMessage('user', trimmed);
                canvasOps.onTogglePresentation(false);
                addLocalMessage('assistant', t('aiChat.status.cmdExit'));
                return true;
            }
        }

        // ⚡ /animate — 演练链路
        if (cmd === '/animate') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', t('aiChat.status.cmdAnimate'));
            // AI 会通过增强 prompt 生成 animatePath 指令
            return true;
        }

        // ⚡ /flow — 开启流量模拟
        if (cmd === '/flow') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', '🌊 正在开启全局流量仿真模拟...');
            // AI 会决定开启哪些核心链路的动画
            return true;
        }

        // ⚡ /style — 样式实验室
        if (cmd === '/style') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', t('aiChat.status.cmdStyle'));
            // AI 会通过增强 prompt 生成 updateTheme 指令
            return true;
        }

        // ⚡ /analyze — 架构巡检
        if (cmd === '/analyze') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', t('aiChat.status.cmdAnalyze'));
            return false; // 继续发送给 AI
        }

        // ⚡ /suggest — 补全建议
        if (cmd === '/suggest') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', t('aiChat.status.cmdSuggest'));
            return false; // 继续发送给 AI
        }

        // ⚡ /doc — 生成文档
        if (cmd === '/doc') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', t('aiChat.status.cmdDoc'));
            return false;
        }

        // Other commands will be sent to AI with context
        return false;
    };

    // --- Handle Input Change (Slash Command Detection) ---
    const handleInputChange = (value: string) => {
        setInputValue(value);

        if (value.startsWith('/')) {
            const filtered = SLASH_COMMANDS.filter(c => c.key.startsWith(value.split(' ')[0]));
            setFilteredCommands(filtered);
            setShowCommands(filtered.length > 0);
        } else {
            setShowCommands(false);
        }
    };

    // --- Handle Voice Toggle (Beta UI Feedback) ---
    const handleVoiceToggle = () => {
        if (!isListening) {
            setIsListening(true);
            appMessage.info({
                content: t('aiChat.status.voiceBeta'),
                key: 'voice-beta',
                duration: 3
            });
            // Simulate auto-stop after 5 seconds
            setTimeout(() => {
                setIsListening(false);
            }, 5000);
        } else {
            setIsListening(false);
        }
    };

    const {
        loading,
        handleStopGeneration,
        sendAIMessage,
    } = useAIChatRequestLifecycle({
        t,
        userId: user?.id,
        inputValue,
        setInputValue,
        setShowCommands,
        activeId,
        messages,
        setConversations,
        pluginId,
        diagramNodesRef,
        diagramEdgesRef,
        canvasOps,
        onOpenConfig,
        processCommands,
    });

    const handleSendMessage = async () => {
        if (loading || !inputValue.trim()) return;
        if (inputValue.startsWith('/') && handleSlashCommand(inputValue)) {
            setInputValue('');
            setShowCommands(false);
            return;
        }
        await sendAIMessage();
    };

    const {
        saveModalVisible,
        setSaveModalVisible,
        saveTarget,
        saveTitle,
        setSaveTitle,
        handleSaveDiagramTo,
        executeSave,
    } = useAIChatDiagramSave({ t, userId: user?.id });

    // --- Select Slash Command ---
    const handleSelectCommand = (cmd: AIChatSlashCommand) => {
        setInputValue(cmd.key + ' ');
        setShowCommands(false);
        inputRef.current?.focus();
    };

    return (
        <AIChatViewLayout
            t={t}
            user={user}
            conversations={conversations}
            activeId={activeId}
            activeConversation={activeConversation}
            messages={messages}
            editingId={editingId}
            editingTitle={editingTitle}
            setEditingTitle={setEditingTitle}
            handleNewChat={handleNewChat}
            handleSwitchChat={handleSwitchChat}
            handleDeleteChat={handleDeleteChat}
            handleStartRename={handleStartRename}
            handleSaveRename={handleSaveRename}
            handleCancelRename={handleCancelRename}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            aiConfig={aiConfig}
            availableModels={availableModels}
            activeModelName={activeModelName}
            configurationState={configurationState}
            canSubmitWithoutConfiguration={canSubmitWithoutConfiguration}
            inputPlaceholder={t(copyKeys.inputPlaceholder)}
            handleModelChange={handleModelChange}
            onOpenConfig={onOpenConfig}
            onClose={onClose}
            onPreviewJson={onPreviewJson}
            onApplyJson={onApplyJson}
            handleSaveDiagramTo={handleSaveDiagramTo}
            messagesEndRef={messagesEndRef}
            showCommands={showCommands}
            filteredCommands={filteredCommands}
            handleSelectCommand={handleSelectCommand}
            inputRef={inputRef}
            inputValue={inputValue}
            handleInputChange={handleInputChange}
            handleSendMessage={handleSendMessage}
            loading={loading}
            isListening={isListening}
            handleVoiceToggle={handleVoiceToggle}
            handleStopGeneration={handleStopGeneration}
            saveModalVisible={saveModalVisible}
            setSaveModalVisible={setSaveModalVisible}
            executeSave={executeSave}
            saveTitle={saveTitle}
            setSaveTitle={setSaveTitle}
            saveTarget={saveTarget}
        />
    );
};

const AIChatPanel: React.FC<AIChatPanelProps> = (props) => {
    // 侧边栏融合模式 (docked) 下，不需要使用 Drawer
    // 直接渲染 AIChatView 即可
    if (!props.open) return null;

    return (
        <div className="ai-chat-panel-shell">
            <AIChatView {...props} />
        </div>
    );
};

export default AIChatPanel;
