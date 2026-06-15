import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
// import Drawer from 'antd/es/drawer';
import Modal from 'antd/es/modal';
import Input from 'antd/es/input';
import Button from 'antd/es/button';
// import Avatar from 'antd/es/avatar';
import Collapse from 'antd/es/collapse';

import Dropdown from 'antd/es/dropdown';
import Select from 'antd/es/select';
// import message from 'antd/es/message';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import {
    
    AudioOutlined,
    CheckCircleOutlined,
    CloudOutlined,
    CloudServerOutlined,
    CodeOutlined,
    CloseOutlined,
    DatabaseOutlined,
    DeleteOutlined,
    DownOutlined,
    EditOutlined,
    _HistoryOutlined,
    _LeftOutlined,
    MenuFoldOutlined,
    _MenuUnfoldOutlined,
    PlusOutlined,
    _RightOutlined,
    SendOutlined,
    SettingOutlined,
    StopOutlined,
    _ThunderboltOutlined,
    _UserOutlined,
    RobotOutlined
} from '@ant-design/icons';
import { getAIConfig, loadCloudAIConfig, persistAIConfig } from './aiConfigStorage';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { PluginRegistry } from '@/core/services/PluginRegistry';
import { aiConversationService, Conversation, Message } from '@/services/ai/AIConversationService';
import { dataRegistry } from '@/data/DataRegistry';
import { 
    DIAGRAM_SYSTEM_PROMPT, 
    MINDMAP_SYSTEM_PROMPT,
    enhanceWithSlashCommand, 
    buildDiagramContext, 
    buildAnalysisContext 
} from '../../services/ai/diagramPrompts';
import List from 'antd/es/list';
import Tooltip from 'antd/es/tooltip';
import Popconfirm from 'antd/es/popconfirm';
import {   } from '@xyflow/react';
import { extractJson } from './useAIChatStreaming';
import { parseAIStreamDelta } from './aiStreamParsing';
import { sanitizeAIProviderError } from '@/services/ai/errorSecurity';
import { formatAIProviderRequestError, requestAIChatCompletion, resolveAIProviderEndpoint } from '@/services/ai/aiProviderClient';
import { getAICommandIds } from './aiCommandPolicy';
import { getAIDiagramTitle, parseAIDiagramJson, registerAIDiagramLocally, serializeAIDiagram, upsertDiagramConfigIndex } from './aiDiagramImport';
import { extractValidatedAICommands } from './aiCommandExtraction';
import { 
     
    AIChatPanelProps
} from './types';
import ShortcutsGuide from './ShortcutsGuide';
import './AIChatPanel.css';
import { appMessage } from '@/core/utils/antdStaticBridge';



const MarkdownMessage = React.lazy(() => import('./MarkdownMessage'));
const loadUnifiedStorage = async () => (await import('@/services/UnifiedStorageService')).unifiedStorage;



// --- Utilities ---
const generateId = (prefix: string = 'msg') => 
    `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

// --- Typing Indicator Component ---
const _TypingIndicator: React.FC = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', background: 'rgba(22, 119, 255, 0.05)', borderRadius: 12, width: 'fit-content', margin: '8px 0' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1677ff', animation: 'typingDotBreath 1.4s infinite ease-in-out', animationDelay: '0s' }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1677ff', animation: 'typingDotBreath 1.4s infinite ease-in-out', animationDelay: '0.2s' }} />
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1677ff', animation: 'typingDotBreath 1.4s infinite ease-in-out', animationDelay: '0.4s' }} />
        <style>{`
            @keyframes typingDotBreath {
                0%, 100% { transform: scale(0.8); opacity: 0.4; }
                50% { transform: scale(1.2); opacity: 1; filter: blur(0.5px); }
            }
        `}</style>
    </div>
);

// --- Constants ---
const _HISTORY_STORAGE_KEY = 'AIChatPanel.history';
const _CUSTOM_PRESETS_STORAGE_KEY = 'DiagramView.CustomPresets';

const isAbortError = (error: unknown): boolean => {
    return error instanceof DOMException && error.name === 'AbortError';
};

// --- Message Item Component (with Memo) ---
interface MessageItemProps {
    item: Message;
    t: any;
    onPreviewJson?: (json: string) => void;
    onApplyJson?: (json: string) => void;
    handleSaveDiagramTo?: (json: string, target: 'local' | 's3' | 'supabase') => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ 
    item, 
    t, 
    onPreviewJson, 
    onApplyJson, 
    handleSaveDiagramTo
}) => {
    const isAi = item.role === 'assistant';

    return (
        <div className={`ai-chat-message ${item.role}`}>
            <div className="ai-chat-bubble">
                <div className="ai-chat-bubble-content">
                    {item.reasoningContent && (
                        <div className="ai-chat-reasoning">
                            <Collapse
                                ghost
                                size="small"
                                expandIcon={({ isActive }) => <RobotOutlined style={{ color: isActive ? 'var(--color-primary-500, #1677ff)' : '#999', transition: 'all 0.3s' }} />}
                                items={[{
                                    key: 'reasoning',
                                    label: <Typography.Text type="secondary" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>{item.isStreaming ? (<span className="reasoning-pulse-dot" />) : null}{t('aiChat.reasoning') || 'Thinking Process...'}</Typography.Text>,
                                    children: (
                                        <div className="reasoning-content-inner">
                                            {item.reasoningContent}
                                        </div>
                                    )
                                }]}
                            />
                        </div>
                    )}
                    
                    <div className="ai-markdown-content">
                        <React.Suspense fallback={<span className="ai-markdown-fallback">{item.content}</span>}>
                            <MarkdownMessage content={item.content} />
                        </React.Suspense>
                    </div>

                    {item.content && item.content.includes('正在为您准备快捷键指南...') && (
                        <ShortcutsGuide />
                    )}

                    {item.isStreaming && <span className="ai-chat-cursor" />}
                </div>

                {/* JSON Action Buttons - Capsule Toolbar */}
                {isAi && item.hasJson && item.jsonContent && (
                    <div className="ai-chat-actions-capsule">
                        <Space size={4} split={<div style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.06)' }} />}>
                            <Tooltip title={t('aiChat.previewJson')}>
                                <Button 
                                    type="text"
                                    size="small" 
                                    className="action-icon-btn"
                                    icon={<CodeOutlined />} 
                                    onClick={() => onPreviewJson?.(item.jsonContent!)}
                                />
                            </Tooltip>
                            
                            <Dropdown
                                menu={{
                                    items: [
                                        { key: 'local', label: t('aiChat.saveToLocal'), icon: <DatabaseOutlined /> },
                                        { key: 'supabase', label: t('aiChat.saveToSupabase'), icon: <CloudOutlined /> },
                                        { key: 's3', label: t('aiChat.saveToS3'), icon: <CloudServerOutlined /> },
                                    ],
                                    onClick: ({ key }) => handleSaveDiagramTo?.(item.jsonContent!, key as any)
                                }}
                            >
                                <Tooltip title={t('aiChat.saveDiagram')}>
                                    <Button type="text" size="small" className="action-icon-btn" icon={<DownOutlined />} />
                                </Tooltip>
                            </Dropdown>

                            <Tooltip title={t('aiChat.applyToCanvas')}>
                                <Button 
                                    size="small" 
                                    type="primary" 
                                    className="action-btn-apply-capsule"
                                    icon={<CheckCircleOutlined />} 
                                    onClick={() => onApplyJson?.(item.jsonContent!)}
                                >
                                    应用图表
                                </Button>
                            </Tooltip>
                        </Space>
                    </div>
                )}
            </div>
        </div>
    );
};

const MemoizedMessageItem = React.memo(MessageItem, (prev, next) => {
    // Only re-render if content, streaming status or json status changes
    return prev.item.content === next.item.content && 
           prev.item.isStreaming === next.item.isStreaming &&
           prev.item.reasoningContent === next.item.reasoningContent &&
           prev.item.hasJson === next.item.hasJson;
});

/**
 * The internal view component for AI Chat, suitable for both Drawer and Sidebar embedding.
 */

export const AIChatView: React.FC<Omit<AIChatPanelProps, 'open'>> = ({ onClose, onOpenConfig, onApplyJson, onPreviewJson, diagramNodesRef, diagramEdgesRef, canvasOps, pluginId, diagramId }) => {
    // --- i18n ---
    const { t } = useTranslation();
    // --- Auth ---
    const { user } = useAuth();

    // --- State ---
    // [M-8] Memoize SLASH_COMMANDS: t() results are stable between renders unless locale changes.
    // Previously rebuilt on every render, causing filteredCommands comparison instability.
    const SLASH_COMMANDS = useMemo(() => [
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

    const [conversations, setConversations] = useState<Conversation[]>(() => {
        aiConversationService.setUserId(user?.id || null);
        return aiConversationService.getConversations();
    });
    const [activeId, setActiveId] = useState<string | null>(() => aiConversationService.getActiveConversationId());
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to closed overlay
    const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
    const [isListening, setIsListening] = useState(false); // Voice UI Feedback state

    const [aiConfig, setAiConfig] = useState(() => getAIConfig(user?.id));
    const activeRequestControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            activeRequestControllerRef.current?.abort(new DOMException('AI chat panel unmounted', 'AbortError'));
            activeRequestControllerRef.current = null;
        };
    }, []);

    useEffect(() => {
        setAiConfig(getAIConfig(user?.id));
        const handleConfigChange = () => setAiConfig(getAIConfig(user?.id));
        window.addEventListener('storage', handleConfigChange);
        window.addEventListener('aiConfigChanged', handleConfigChange);
        return () => {
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
                console.error('AIChatPanel: Failed to load cloud AI config', err);
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
                    setAiConfig(newConfig);
                    persistAIConfig(user?.id, newConfig);
                }
            }
        }
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

    const handleModelChange = (val: string) => {
        const newConfig = { ...aiConfig, activeModelKey: val };
        setAiConfig(newConfig);
        persistAIConfig(user?.id, newConfig);
        appMessage.success(t('aiChat.autoSwitched', { name: availableModels.find(m => m.value === val)?.label || val }));
    };

    // UI Local state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<any>(null);

    // Get current active conversation
    const activeConversation = useMemo(
        () => conversations.find(c => c.id === activeId) || null,
        [activeId, conversations]
    );
    const messages = useMemo(() => activeConversation?.messages || [], [activeConversation]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Sync with User & Cloud
    useEffect(() => {
        aiConversationService.setUserId(user?.id || null);
        if (user?.id) {
            aiConversationService.syncFromCloud().then(convs => {
                setConversations(convs);
                const active = aiConversationService.getActiveConversationId();
                if (active && convs.some(c => c.id === active)) {
                    setActiveId(active);
                } else if (convs.length > 0) {
                    setActiveId(convs[0].id);
                } else {
                    setActiveId(null);
                }
            });
        } else {
            // Load anonymous local conversations
            const localConvs = aiConversationService.getConversations();
            setConversations(localConvs);
            const active = aiConversationService.getActiveConversationId();
            if (active && localConvs.some(c => c.id === active)) {
                setActiveId(active);
            } else if (localConvs.length > 0) {
                setActiveId(localConvs[0].id);
            } else {
                setActiveId(null);
            }
        }
    }, [user?.id]);

    // --- Actions ---
    const handleNewChat = useCallback(() => {
        const welcomeMsg: Message = {
            id: generateId(),
            role: 'assistant',
            content: t('aiChat.welcomeMsg')
        };
        const newConv = aiConversationService.createConversation(welcomeMsg);
        setConversations(aiConversationService.getConversations());
        setActiveId(newConv.id);
    }, [t]);

    useEffect(() => {
        if (!user?.id && conversations.length === 0) {
            handleNewChat();
        } else if (!activeId && conversations.length > 0) {
            setActiveId(conversations[0].id);
        }
    }, [activeId, conversations, handleNewChat, user?.id]);

    const handleSwitchChat = (id: string) => {
        setActiveId(id);
        aiConversationService.setActiveConversationId(id);
    };

    const handleDeleteChat = (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        aiConversationService.deleteConversation(id);
        const updated = aiConversationService.getConversations();
        setConversations(updated);
        if (activeId === id) {
            const nextId = updated.length > 0 ? updated[0].id : null;
            setActiveId(nextId);
        }
    };

    const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(conv.id);
        setEditingTitle(conv.title);
    };

    const handleSaveRename = (id: string) => {
        aiConversationService.updateConversation(id, { title: editingTitle });
        setConversations(aiConversationService.getConversations());
        setEditingId(null);
    };

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
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

    /**
     * 解析并执行 AI 输出中的原子化命令
     * 格式：[COMMAND: {"action": "addNode", "label": "...", ...}]
     */
    const processCommands = async (content: string) => {
        if (!canvasOps) return;

        const extraction = extractValidatedAICommands(content);
        extraction.rejected.slice(0, 3).forEach(({ action, reason }) => {
            console.warn('[AI Pilot] Blocked autonomous command:', action, reason);
            appMessage.warning(`AI 指令 "${action}" 已被拦截：${reason}`);
        });

        for (const cmd of extraction.commands) {
            try {
                // [GAP-10] 首选：尝试通过插件分发器执行 (Architecture First)
                if (pluginId) {
                    const ctx = pluginId === 'flowchart' ? ((window as any).__flowContextBridge) : (diagramNodesRef ? {
                        getNodes: () => diagramNodesRef.current,
                        getEdges: () => diagramEdgesRef?.current || [],
                        addNode: canvasOps?.onAddNode,
                        updateNodesBatch: (ids: any, updates: any) => canvasOps?.onUpdateNodes?.(ids, updates),
                        takeSnapshot: () => {},
                        diagramId
                    } : null);

                    if (ctx) {
                        const handled = await PluginRegistry.getInstance().executeAIAction(pluginId, cmd.action, cmd, ctx as any);
                        if (handled) {
                            continue; 
                        }
                    }
                }

                // 次选：回退到通用内置指令处理
                switch (cmd.action) {
                    case 'addNode':
                        if (canvasOps.onAddNode) {
                            const newId = canvasOps.onAddNode(cmd.label, cmd.shape || cmd.type);
                            if (newId) appMessage.success(t('aiChat.status.nodeAdded', { label: cmd.label }));
                        }
                        break;
                    case 'deleteNodes':
                        if (canvasOps.onDeleteNodes && cmd.ids) {
                            canvasOps.onDeleteNodes(cmd.ids);
                            appMessage.success(t('aiChat.status.nodesDeleted', { count: cmd.ids.length }));
                        }
                        break;
                    case 'connectNodes':
                        if (canvasOps.onConnectNodes && cmd.source && cmd.target) {
                            canvasOps.onConnectNodes(cmd.source, cmd.target, cmd.label);
                            appMessage.success(t('aiChat.status.connected', { label: cmd.label || '' }));
                        }
                        break;
                    case 'triggerLayout':
                    case 'layout':
                        if (canvasOps.onAutoLayout) {
                            canvasOps.onAutoLayout(cmd.strategy);
                            appMessage.success(t('aiChat.status.layoutApplied', { strategy: cmd.strategy || t('aiChat.status.smartLayout') }));
                        }
                        break;
                    case 'groupNodes':
                        if (canvasOps.onGroupNodes && cmd.ids) {
                            canvasOps.onGroupNodes(cmd.ids, cmd.name || cmd.label);
                            appMessage.success(t('aiChat.status.groupCreated', { name: cmd.name || cmd.label || t('aiChat.status.smartGroup') }));
                        }
                        break;
                    case 'export':
                        if (canvasOps.onExport) {
                            canvasOps.onExport(cmd.type || 'png');
                        }
                        break;
                    case 'save':
                        if (canvasOps.onSave) {
                            canvasOps.onSave();
                        }
                        break;
                    case 'share':
                        if (canvasOps.onShare) canvasOps.onShare();
                        break;
                    case 'updateTheme':
                        if (canvasOps.onUpdateTheme && cmd.style) {
                            canvasOps.onUpdateTheme(cmd.style);
                        }
                        break;
                    case 'presentation':
                        if (canvasOps.onTogglePresentation) {
                            canvasOps.onTogglePresentation(cmd.active !== false);
                        }
                        break;
                    case 'animatePath':
                        if (canvasOps.onAnimatePath) {
                            const ids = getAICommandIds(cmd);
                            const options = cmd.params?.options || {};
                            if (ids) canvasOps.onAnimatePath(ids, { duration: cmd.duration ?? options.duration, loop: cmd.loop ?? options.loop });
                        }
                        break;
                    default:
                        break;
                }
                
                // [Phase 15] 为连续指令增加微小延迟，确保 React Flow 状态稳定同步
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error('[AI Pilot] Command execution error:', e, cmd);
            }
        }
    };

    // --- Handle Slash Commands ---
    const addLocalMessage = useCallback((role: 'user' | 'assistant', content: string) => {
        if (!activeId) return;
        const msg: Message = { id: generateId(), role, content };
        const updatedMessages = [...(aiConversationService.getConversations().find(c => c.id === activeId)?.messages || []), msg];
        aiConversationService.updateConversation(activeId, { messages: updatedMessages });
        setConversations(aiConversationService.getConversations());
    }, [activeId]);

    const handleSlashCommand = (command: string): boolean => {
        const trimmed = command.trim();
        const lower = trimmed.toLowerCase();
        const parts = trimmed.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1).join(' ');

        if (lower === '/clear') {
            const welcomeMsg: Message = { id: generateId(), role: 'assistant', content: t('aiChat.clearedMsg') };
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
                    { key: '/analyze', label: '/analyze', description: '深入分析当前图表架构并输出报告' },
                    { key: '/brainstorm', label: '/brainstorm', description: '针对选中节点进行思维发散 (仅限脑图模式)' }
                ]
            };
            
            const renderCategory = (title: string, cmds: any[]) => 
                `### ${title}\n` + cmds.map(c => `- **${c.label}**: ${c.description}`).join('\n');

            const helpMarkdown = `
${renderCategory('🌐 通用绘图指令', categories.general)}

${renderCategory('🤖 AI 智能指令', categories.ai)}

> **Pro Tip**: 使用 **Alt + /** 快速切换面板。输入「/」启动命令自动补全。
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

    const handleStopGeneration = () => {
        activeRequestControllerRef.current?.abort(new DOMException('用户已停止生成', 'AbortError'));
    };

    // --- Streaming Send Message ---
    const handleSendMessage = async () => {
        if (loading) return;
        if (!inputValue.trim()) return;

        // Check for local slash commands
        if (inputValue.startsWith('/') && handleSlashCommand(inputValue)) {
            setInputValue('');
            setShowCommands(false);
            return;
        }

        let config = getAIConfig(user?.id);
        const parts = (config.activeModelKey || '').split(':');
        let pId = parts[0];
        const mIdParts = parts.slice(1);
        let mId = mIdParts.join(':'); // 支持模型ID中包含冒号的情况
        let activeProvider = config.providers.find(p => p.id === pId);
        let activeModel = activeProvider?.models.find(m => m.id === mId);

        // 调试日志

        // 如果当前选择的模型不可用（如被删除或禁用），尝试自动回退到第一个可用的模型
        if (!activeProvider || !activeModel) {

            // 查找第一个可用的 provider 和 model
            for (const provider of config.providers) {
                if (provider.enabled) {
                    const enabledModel = provider.models.find(m => m.enabled);
                    if (enabledModel) {
                        activeProvider = provider;
                        activeModel = enabledModel;
                        pId = provider.id;
                        mId = enabledModel.id;

                        // 自动保存这个选择
                        const newActiveModelKey = `${pId}:${mId}`;
                        const newConfig = { ...config, activeModelKey: newActiveModelKey };
                        persistAIConfig(user?.id, newConfig);
                        config = newConfig;

                        appMessage.info(t('aiChat.autoSwitched', { name: `${provider.name} - ${enabledModel.name}` }));
                        break;
                    }
                }
            }
        }

        // 再次检查
        if (!activeProvider || !activeModel) {
            appMessage.warning('没有找到可用的模型，请先在设置中启用模型');
            onOpenConfig();
            return;
        }

        if (!activeProvider.apiKey) {
            appMessage.warning(`请先在 AI 设置中配置 ${activeProvider.name} 的 API Key`);
            onOpenConfig();
            return;
        }

        try {
            resolveAIProviderEndpoint(activeProvider, '/chat/completions');
        } catch {
            appMessage.warning(`${activeProvider.name} 的 Base URL 必须使用 HTTPS，或本机 HTTP localhost/127.0.0.1。`);
            onOpenConfig();
            return;
        }

        const newUserMsg: Message = { id: generateId(), role: 'user', content: inputValue };
        const aiMsgId = generateId();

        let updatedMessages = [...messages, newUserMsg];
        const newAiMsg: Message = { id: aiMsgId, role: 'assistant', content: '', isStreaming: true };
        updatedMessages = [...updatedMessages, newAiMsg];

        if (activeId) {
            // Update title if it's the first real message
            const updates: Partial<Conversation> = { messages: updatedMessages };
            if (messages.length <= 1) {
                updates.title = aiConversationService.generateTitle(inputValue);
            }
            aiConversationService.updateConversation(activeId, updates);
            setConversations(aiConversationService.getConversations());
        }

        setInputValue('');
        setShowCommands(false);
        setLoading(true);
        const requestController = new AbortController();
        activeRequestControllerRef.current = requestController;
        let accumulatedContent = '';
        let accumulatedReasoning = '';

        try {
            const contextPrompt = pluginId === 'mindmap' ? MINDMAP_SYSTEM_PROMPT : (config.systemPrompt || DIAGRAM_SYSTEM_PROMPT);
            const response = await requestAIChatCompletion(activeProvider, {
                model: activeModel.id,
                messages: [
                    {
                        role: 'system',
                        content: contextPrompt + (pluginId ? `\n\n[当前图表模式: ${pluginId}]` : '')
                    },
                    ...messages.map(m => ({ role: m.role, content: m.content })),
                    {
                        role: 'user',
                        content: enhanceWithSlashCommand(newUserMsg.content)
                            + buildDiagramContext(diagramNodesRef?.current || [], diagramEdgesRef?.current || [])
                            + (newUserMsg.content.trim().startsWith('/analyze')
                                ? (canvasOps?.onAnalyze ? `\n\n[实时图表巡检报告]\n${canvasOps.onAnalyze().summary}` : buildAnalysisContext(diagramNodesRef?.current || [], diagramEdgesRef?.current || []))
                                : '')
                    }
                ],
                stream: true
            }, { signal: requestController.signal, timeoutMs: 120_000 });

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let lastUpdateTimestamp = Date.now();
            const THROTTLE_MS = 60; // 约 16fps，保证视觉流畅且不阻塞进程

            if (reader) {
                let buffer = '';
                const cancelReader = () => {
                    void reader.cancel().catch(() => {});
                };
                requestController.signal.addEventListener('abort', cancelReader, { once: true });

                try {
                    while (true) {
                        if (requestController.signal.aborted) {
                            throw requestController.signal.reason;
                        }

                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;

                        const lines = buffer.split('\n');
                        // 保留最后一行（可能是不完整的）在 buffer 中
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const trimmedLine = line.trim();
                            if (trimmedLine.startsWith('data: ')) {
                                const data = trimmedLine.slice(6);
                                if (data === '[DONE]') continue;

                                const delta = parseAIStreamDelta(data);
                                if (delta) {
                                    if (delta.reasoningContent) accumulatedReasoning += delta.reasoningContent;
                                    if (delta.content) accumulatedContent += delta.content;

                                    // Update UI State (Throttled)
                                    if (activeId) {
                                        const now = Date.now();
                                        if (now - lastUpdateTimestamp > THROTTLE_MS) {
                                            const convs = [...aiConversationService.getConversations()];
                                            const cIdx = convs.findIndex(c => c.id === activeId);
                                            if (cIdx !== -1) {
                                                const partialJson = extractJson(accumulatedContent, true);
                                                convs[cIdx].messages = convs[cIdx].messages.map(m =>
                                                    m.id === aiMsgId ? {
                                                        ...m,
                                                        content: accumulatedContent,
                                                        reasoningContent: accumulatedReasoning,
                                                        hasJson: !!partialJson,
                                                        jsonContent: partialJson || undefined
                                                    } : m
                                                );
                                                setConversations(convs);
                                            }
                                            lastUpdateTimestamp = now;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } finally {
                    requestController.signal.removeEventListener('abort', cancelReader);
                }

                if (requestController.signal.aborted) {
                    throw requestController.signal.reason;
                }
            }

            // Finalize message
            const jsonContent = extractJson(accumulatedContent);
            
            // Phase 3: 执行原子化指令
            await processCommands(accumulatedContent);

            if (activeId) {
                const finalMessages = (aiConversationService.getConversations().find(c => c.id === activeId)?.messages || []).map(m =>
                    m.id === aiMsgId
                        ? { ...m, content: accumulatedContent || (accumulatedReasoning ? '' : '（无内容）'), reasoningContent: accumulatedReasoning || undefined, isStreaming: false, hasJson: !!jsonContent, jsonContent: jsonContent || undefined }
                        : m
                );
                aiConversationService.updateConversation(activeId, { messages: finalMessages });
                setConversations(aiConversationService.getConversations());
            }

        } catch (error: any) {
            if (isAbortError(error)) {
                if (activeId) {
                    const jsonContent = extractJson(accumulatedContent);
                    const convs = [...aiConversationService.getConversations()];
                    const cIdx = convs.findIndex(c => c.id === activeId);
                    if (cIdx !== -1) {
                        convs[cIdx].messages = convs[cIdx].messages.map(m =>
                            m.id === aiMsgId
                                ? {
                                    ...m,
                                    content: accumulatedContent || '已停止生成',
                                    reasoningContent: accumulatedReasoning || undefined,
                                    isStreaming: false,
                                    hasJson: !!jsonContent,
                                    jsonContent: jsonContent || undefined
                                }
                                : m
                        );
                        aiConversationService.updateConversation(activeId, { messages: convs[cIdx].messages });
                        setConversations(convs);
                    }
                }
                return;
            }

            const safeError = formatAIProviderRequestError(error);
            appMessage.error(t('aiChat.requestFailed', { error: safeError }));
            if (activeId) {
                const convs = [...aiConversationService.getConversations()];
                const cIdx = convs.findIndex(c => c.id === activeId);
                if (cIdx !== -1) {
                    convs[cIdx].messages = convs[cIdx].messages.map(m =>
                        m.id === aiMsgId ? { ...m, content: t('aiChat.requestError', { error: safeError }), isStreaming: false } : m
                    );
                    setConversations(convs);
                }
            }
        } finally {
            if (activeRequestControllerRef.current === requestController) {
                activeRequestControllerRef.current = null;
            }
            setLoading(false);
        }
    };

    // --- Save Modal States ---
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [saveTarget, setSaveTarget] = useState<'local' | 's3' | 'supabase' | null>(null);
    const [saveTitle, setSaveTitle] = useState('');
    const [saveJson, setSaveJson] = useState('');

    // --- Multi-Target Save Handler (Step 1: Open Modal) ---
    const handleSaveDiagramTo = (jsonContent: string, target: 'local' | 's3' | 'supabase') => {
        try {
            const fallbackTitle = `ai-generated-${Date.now()}`;
            const obj = parseAIDiagramJson(jsonContent, {
                id: `ai-${Date.now()}`,
                title: fallbackTitle,
            });
            const initialTitle = getAIDiagramTitle(obj, fallbackTitle);
            setSaveTitle(initialTitle);
            setSaveJson(serializeAIDiagram(obj));
            setSaveTarget(target);
            setSaveModalVisible(true);
        } catch (_e: any) {
            appMessage.error(t('aiChat.invalidDiagram'));
        }
    };

    // --- Multi-Target Save Executor (Step 2: Save) ---
    const executeSave = async () => {
        if (!saveTarget || !saveJson) return;
        setSaveModalVisible(false);

        try {
            const obj = parseAIDiagramJson(saveJson, {
                id: `ai-${Date.now()}`,
                title: saveTitle.trim() || `ai-generated-${Date.now()}`,
            });
            const target = saveTarget;
            const targetLabel = target === 'local' ? t('storage.manager.local') : (target === 's3' ? 'S3' : 'Supabase');
            const hide = appMessage.loading(t('aiChat.status.savingTo', { target: targetLabel }), 0);

            try {
                // [FIX] Update Title
                const title = saveTitle.trim() || `ai-generated-${Date.now()}`;
                obj.metadata = obj.metadata || {};
                obj.metadata.title = title;

                if (target === 'local') {
                    const localService = dataRegistry.getDataService();
                    const registered = registerAIDiagramLocally(localService, obj, title);
                    
                    // Persist to vizly_diagram_configs to make it appear in the dashboard immediately
                    try {
                        upsertDiagramConfigIndex(localStorage, registered, title);
                    } catch { /* ignore storage errors */ }
                    
                    appMessage.success(t('aiChat.status.saveSuccess', { target: targetLabel, title: title }));
                } else {
                    const unifiedStorage = await loadUnifiedStorage();
                    const provider = unifiedStorage.getProvider(target);
                    if (!provider.isConfigured()) {
                        throw new Error(`${provider.name} 未配置，请先在配置面板中设置`);
                    }

                    // [FIX] ID Generation Logic
                    // 1. If Supabase, MUST be UUID. If current ID is invalid/missing, regenerate.
                    // 2. If S3, can be string.
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    let finalId = obj.id;

                    if (target === 'supabase') {
                        if (!finalId || !uuidRegex.test(finalId)) {
                            // Force regenerate UUID if missing or invalid (e.g. preset name)
                            finalId = crypto.randomUUID();
                        }
                    } else {
                        // S3 or others
                        if (!finalId) finalId = `${target}-${Date.now()}`;
                    }

                    // Update object ID
                    obj.id = finalId;

                    await provider.saveDiagram({
                        id: finalId,
                        title: title,
                        content: obj,
                        user_id: user?.id || 'anonymous',
                        updated_at: new Date().toISOString()
                    });
                    appMessage.success(t('aiChat.status.saveSuccess', { target: targetLabel, title: title }));
                }
            } finally {
                hide();
            }
        } catch (error: any) {
            const errMsg = sanitizeAIProviderError(error);
            appMessage.error(t('aiChat.status.saveFailed', { error: errMsg }));
        }
    };

    // --- Select Slash Command ---
    const handleSelectCommand = (cmd: typeof SLASH_COMMANDS[0]) => {
        setInputValue(cmd.key + ' ');
        setShowCommands(false);
        inputRef.current?.focus();
    };

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
                        options={availableModels.reduce((acc: any[], curr) => {
                            const group = acc.find(g => g.label === curr.group);
                            if (group) {
                                group.options.push({ label: curr.label, value: curr.value });
                            } else {
                                acc.push({ label: curr.group, options: [{ label: curr.label, value: curr.value }] });
                            }
                            return acc;
                        }, [])}
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

const AIChatPanel: React.FC<AIChatPanelProps> = (props) => {
    // 侧边栏融合模式 (docked) 下，不需要使用 Drawer
    // 直接渲染 AIChatView 即可
    if (!props.open) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
            <AIChatView {...props} />
        </div>
    );
};

export default AIChatPanel;
