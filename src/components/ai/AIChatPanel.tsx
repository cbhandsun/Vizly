import React, { useState, useRef, useEffect, useCallback } from 'react';
import Drawer from 'antd/es/drawer';
import Modal from 'antd/es/modal';
import Input from 'antd/es/input';
import Button from 'antd/es/button';
import Avatar from 'antd/es/avatar';
import Collapse from 'antd/es/collapse';

import Dropdown from 'antd/es/dropdown';
import message from 'antd/es/message';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import {
    ApartmentOutlined,
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
    HistoryOutlined,
    LeftOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    PlusOutlined,
    RightOutlined,
    SendOutlined,
    SettingOutlined,
    ThunderboltOutlined,
    UserOutlined,
    RobotOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAIConfig } from './AIConfigModal';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { PluginRegistry } from '@/core/services/PluginRegistry';
import { aiConversationService, Conversation, Message } from '@/services/ai/AIConversationService';
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
import { Node, Edge } from '@xyflow/react';
import { 
    CanvasOperations, 
    AIChatPanelProps
} from './types';
import ShortcutsGuide from './ShortcutsGuide';
import './AIChatPanel.css';



// --- Utilities ---
const generateId = (prefix: string = 'msg') => 
    `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// --- Typing Indicator Component ---
const TypingIndicator: React.FC = () => (
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
const HISTORY_STORAGE_KEY = 'AIChatPanel.history';
const CUSTOM_PRESETS_STORAGE_KEY = 'DiagramView.CustomPresets';

// --- Message Item Component (with Memo) ---
interface MessageItemProps {
    item: Message;
    t: any;
    onPreviewJson?: (json: string) => void;
    onApplyJson?: (json: string) => void;
    handleSaveDiagramTo?: (json: string, target: 'local' | 's3' | 'supabase') => void;
    unifiedStorage: any;
}

const MessageItem: React.FC<MessageItemProps> = ({ 
    item, 
    t, 
    onPreviewJson, 
    onApplyJson, 
    handleSaveDiagramTo,
    unifiedStorage
}) => {
    const isAi = item.role === 'assistant';

    return (
        <div className={`ai-chat-message ${item.role}`}>
            <div className="ai-chat-avatar">
                {isAi ? (
                    <Avatar icon={<RobotOutlined />} className="avatar-ai" />
                ) : (
                    <Avatar icon={<UserOutlined />} className="avatar-user" />
                )}
            </div>
            <div className="ai-chat-bubble">
                <div className="ai-chat-bubble-content">
                    {item.reasoningContent && (
                        <div className="ai-chat-reasoning">
                            <Collapse
                                ghost
                                size="small"
                                items={[{
                                    key: 'reasoning',
                                    label: <Typography.Text type="secondary" italic>{t('aiChat.reasoning') || 'Thinking Process...'}</Typography.Text>,
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.content}
                        </ReactMarkdown>
                    </div>

                    {item.content && item.content.includes('正在为您准备快捷键指南...') && (
                        <ShortcutsGuide />
                    )}

                    {item.isStreaming && <span className="ai-chat-cursor" />}
                </div>

                {/* JSON Action Buttons */}
                {isAi && item.hasJson && item.jsonContent && (
                    <div className="ai-chat-actions">
                        <Space direction="vertical" style={{ width: '100%' }} size={4}>
                            <Space size={8} style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Button 
                                    size="small" 
                                    icon={<CodeOutlined />} 
                                    onClick={() => onPreviewJson?.(item.jsonContent!)}
                                >
                                    {t('aiChat.previewJson')}
                                </Button>
                                <Button 
                                    size="small" 
                                    type="primary" 
                                    className="action-btn-apply"
                                    icon={<CheckCircleOutlined />} 
                                    onClick={() => onApplyJson?.(item.jsonContent!)}
                                >
                                    {t('aiChat.applyToCanvas')}
                                </Button>
                            </Space>
                            
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
                                <Button size="small" icon={<DownOutlined />} style={{ width: '100%' }}>
                                    {t('aiChat.saveDiagram')}
                                </Button>
                            </Dropdown>
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

export const AIChatView: React.FC<Omit<AIChatPanelProps, 'open'>> = ({ onClose, onOpenConfig, onApplyJson, onPreviewJson, diagramNodesRef, diagramEdgesRef, canvasOps, pluginId }) => {
    // --- i18n ---
    const { t } = useTranslation();
    // --- Auth ---
    const { user } = useAuth();

    // --- State ---
    const SLASH_COMMANDS = [
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
    ];

    const [conversations, setConversations] = useState<Conversation[]>(() => aiConversationService.getConversations());
    const [activeId, setActiveId] = useState<string | null>(() => aiConversationService.getActiveConversationId());
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to closed overlay
    const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);
    const [isListening, setIsListening] = useState(false); // Voice UI Feedback state

    // UI Local state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<any>(null);

    // Get current active conversation
    const activeConversation = conversations.find(c => c.id === activeId) || null;
    const messages = activeConversation?.messages || [];

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
                if (!activeId && convs.length > 0) {
                    setActiveId(convs[0].id);
                }
            });
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id && conversations.length === 0) {
            handleNewChat();
        } else if (!activeId && conversations.length > 0) {
            setActiveId(conversations[0].id);
        }
    }, [activeId, conversations.length, user?.id]);

    // --- Actions ---
    const handleNewChat = () => {
        const welcomeMsg: Message = {
            id: generateId(),
            role: 'assistant',
            content: t('aiChat.welcomeMsg')
        };
        const newConv = aiConversationService.createConversation(welcomeMsg);
        setConversations(aiConversationService.getConversations());
        setActiveId(newConv.id);
    };

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

    // 增强版 JSON 提取与残缺容错
    const extractJson = (content: string, isStreaming: boolean = false): string | null => {
        // 尝试匹配完整包裹的 ```json 块
        const jsonMatch = content.match(/```json\n([\s\S]*?)(?:\n```|$)/);
        let rawStr = jsonMatch ? jsonMatch[1] : content;

        // 如果不是在流传输中或者本来就能 parse，直接过
        try {
            const potentialJson = JSON.parse(rawStr);
            if (potentialJson && (potentialJson.nodes || potentialJson.edges)) {
                return rawStr;
            }
        } catch { }

        // 如果正在 streaming，尝试主动修补尾部的缺失括号
        if (isStreaming) {
            try {
                // 1. 掐去最后一个不完整的节点或边（寻找最后一个完整的 '}'）
                const lastBraceIdx = rawStr.lastIndexOf('}');
                if (lastBraceIdx === -1) return null;
                
                let trimStr = rawStr.substring(0, lastBraceIdx + 1);

                // 2. 检查数组闭合，并强行打补丁
                const openNodes = (trimStr.match(/"nodes"\s*:\s*\[/g) || []).length;
                const closeNodes = (trimStr.match(/]/g) || []).length; // 粗略估算

                // 用一个简单暴力的修补策略：看看能不能闭合出 nodes 数组和根对象
                const patched = trimStr + ']}';
                const parsed = JSON.parse(patched);
                if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
                    return patched;
                }
            } catch {
                // 如果进一步尝试修补还是失败，也无妨，下一个 chunk 再说
            }
        }

        return null;
    };

    /**
     * 解析并执行 AI 输出中的原子化命令
     * 格式：[COMMAND: {"action": "addNode", "label": "...", ...}]
     */
    const processCommands = async (content: string) => {
        if (!canvasOps) return;

        const commandRegex = /\[COMMAND:\s*({[\s\S]*?})\s*\]/g;
        let match;
        let executedCount = 0;

        while ((match = commandRegex.exec(content)) !== null) {
            try {
                const cmdJson = match[1];
                const cmd = JSON.parse(cmdJson);
                
                
                // [GAP-10] 首选：尝试通过插件分发器执行 (Architecture First)
                if (pluginId) {
                    const ctx = pluginId === 'flowchart' ? ((window as any).__flowContextBridge) : (diagramNodesRef ? {
                        getNodes: () => diagramNodesRef.current,
                        getEdges: () => diagramEdgesRef?.current || [],
                        addNode: canvasOps?.onAddNode,
                        updateNodesBatch: (ids: any, updates: any) => canvasOps?.onUpdateNodes?.(ids, updates),
                        takeSnapshot: () => {} 
                    } : null);

                    if (ctx) {
                        const handled = await PluginRegistry.getInstance().executeAIAction(pluginId, cmd.action, cmd, ctx as any);
                        if (handled) {
                            executedCount++;
                            continue; 
                        }
                    }
                }

                // 次选：回退到通用内置指令处理
                executedCount++;
                switch (cmd.action) {
                    case 'addNode':
                        if (canvasOps.onAddNode) {
                            const newId = canvasOps.onAddNode(cmd.label, cmd.shape || cmd.type);
                            if (newId) message.success(t('aiChat.status.nodeAdded', { label: cmd.label }));
                        }
                        break;
                    case 'deleteNodes':
                        if (canvasOps.onDeleteNodes && cmd.ids) {
                            canvasOps.onDeleteNodes(cmd.ids);
                            message.success(t('aiChat.status.nodesDeleted', { count: cmd.ids.length }));
                        }
                        break;
                    case 'connectNodes':
                        if (canvasOps.onConnectNodes && cmd.source && cmd.target) {
                            canvasOps.onConnectNodes(cmd.source, cmd.target, cmd.label);
                            message.success(t('aiChat.status.connected', { label: cmd.label || '' }));
                        }
                        break;
                    case 'triggerLayout':
                    case 'layout':
                        if (canvasOps.onAutoLayout) {
                            canvasOps.onAutoLayout(cmd.strategy);
                            message.success(t('aiChat.status.layoutApplied', { strategy: cmd.strategy || t('aiChat.status.smartLayout') }));
                        }
                        break;
                    case 'groupNodes':
                        if (canvasOps.onGroupNodes && cmd.ids) {
                            canvasOps.onGroupNodes(cmd.ids, cmd.name || cmd.label);
                            message.success(t('aiChat.status.groupCreated', { name: cmd.name || cmd.label || t('aiChat.status.smartGroup') }));
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
                        if (canvasOps.onAnimatePath && cmd.ids) {
                            canvasOps.onAnimatePath(cmd.ids, { duration: cmd.duration, loop: cmd.loop });
                        }
                        break;
                    default:
                        break;
                }
                
                // [Phase 15] 为连续指令增加微小延迟，确保 React Flow 状态稳定同步
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (e) {
                console.error('[AI Pilot] Command execution error:', e, match[1]);
            }
        }

        if (executedCount > 0) {
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
                addLocalMessage('assistant', '⚠️ 「头脑风暴」指令目前仅在**思维导图**模式下可用。');
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
                    addLocalMessage('assistant', '⚠️ 格式: `/connect 节点A 节点B`');
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
                message.success('会话已重置');
                return true;
            }
        }

        // ⚡ /shortcuts — 显示快捷键指南
        if (cmd === '/shortcuts' || cmd === '/help') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', '正在为您准备指南...', true); 
            return true;
        }

        // ⚡ /present — 开启演示模式
        if (cmd === '/present') {
            if (canvasOps?.onTogglePresentation) {
                addLocalMessage('user', trimmed);
                canvasOps.onTogglePresentation(true);
                addLocalMessage('assistant', '🎬 演示模式已开启。按 ESC 或使用 /exit 退出。');
                return true;
            }
        }

        // ⚡ /exit — 退出演示模式
        if (cmd === '/exit' || cmd === '/quit') {
            if (canvasOps?.onTogglePresentation) {
                addLocalMessage('user', trimmed);
                canvasOps.onTogglePresentation(false);
                addLocalMessage('assistant', '✅ 已退出演示模式。');
                return true;
            }
        }

        // ⚡ /animate — 演练链路
        if (cmd === '/animate') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', '🔄 正在分析业务路径并准备动态演练...');
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
            addLocalMessage('assistant', '✨ 正在分析图表并生成推荐样式方案...');
            // AI 会通过增强 prompt 生成 updateTheme 指令
            return true;
        }

        // ⚡ /analyze — 架构巡检
        if (cmd === '/analyze') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', '🔍 正在进行深度架构巡检与合规性检查...');
            return false; // 继续发送给 AI
        }

        // ⚡ /suggest — 补全建议
        if (cmd === '/suggest') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', '💡 正在扫描当前架构并生成补全建议...');
            return false; // 继续发送给 AI
        }

        // ⚡ /doc — 生成文档
        if (cmd === '/doc') {
            addLocalMessage('user', trimmed);
            addLocalMessage('assistant', '📄 正在基于当前设计编写深度技术文档...');
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
            message.info({
                content: 'Vizly Voice Beta: 正在调优语音模型，当前仅提供视觉预览。',
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

    // --- Streaming Send Message ---
    const handleSendMessage = async () => {
        if (!inputValue.trim()) return;

        // Check for local slash commands
        if (inputValue.startsWith('/') && handleSlashCommand(inputValue)) {
            setInputValue('');
            setShowCommands(false);
            return;
        }

        const config = getAIConfig();
        let [pId, ...mIdParts] = (config.activeModelKey || '').split(':');
        let mId = mIdParts.join(':'); // 支持模型ID中包含冒号的情况
        let activeProvider = config.providers.find(p => p.id === pId);
        let activeModel = activeProvider?.models.find(m => m.id === mId);

        // 调试日志

        // 如果当前选择的模型不可用，尝试自动回退到第一个可用的模型
        if (!activeProvider || !activeProvider.apiKey || !activeModel) {

            // 查找第一个可用的 provider 和 model
            for (const provider of config.providers) {
                if (provider.enabled && provider.apiKey) {
                    const enabledModel = provider.models.find(m => m.enabled);
                    if (enabledModel) {
                        activeProvider = provider;
                        activeModel = enabledModel;
                        pId = provider.id;
                        mId = enabledModel.id;

                        // 自动保存这个选择
                        const newActiveModelKey = `${pId}:${mId}`;
                        config.activeModelKey = newActiveModelKey;
                        localStorage.setItem('DiagramView.AIConfig_V2_Advanced', JSON.stringify(config));

                        message.info(t('aiChat.autoSwitched', { name: `${provider.name} - ${enabledModel.name}` }));
                        break;
                    }
                }
            }
        }

        // 再次检查
        if (!activeProvider || !activeProvider.apiKey || !activeModel) {
            message.warning('没有找到可用的模型，请先在设置中配置 API Key 并启用模型');
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

        try {
            const contextPrompt = pluginId === 'mindmap' ? MINDMAP_SYSTEM_PROMPT : (config.systemPrompt || DIAGRAM_SYSTEM_PROMPT);
            const response = await fetch(`${activeProvider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeProvider.apiKey}`
                },
                body: JSON.stringify({
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
                    stream: true // Enable streaming
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                if (errText.trim().startsWith('<')) {
                    throw new Error(`API 返回了 HTML 错误页 (${response.status})。请检查 Base URL。`);
                }
                throw new Error(`API Error: ${response.status} - ${errText}`);
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let accumulatedContent = '';
            let accumulatedReasoning = '';
            let lastUpdateTimestamp = Date.now();
            const THROTTLE_MS = 60; // 约 16fps，保证视觉流畅且不阻塞进程

            if (reader) {
                let buffer = '';

                while (true) {
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

                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta;
                                if (!delta) continue;

                                // 处理思考过程
                                if (delta.reasoning_content) {
                                    accumulatedReasoning += delta.reasoning_content;
                                }

                                // 处理正文
                                if (delta.content) {
                                    accumulatedContent += delta.content;
                                }

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
                            } catch (e) {
                                // Ignore incomplete JSON due to fragmentation
                            }
                        }
                    }
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
            message.error(t('aiChat.requestFailed', { error: error.message }));
            if (activeId) {
                const convs = [...aiConversationService.getConversations()];
                const cIdx = convs.findIndex(c => c.id === activeId);
                if (cIdx !== -1) {
                    convs[cIdx].messages = convs[cIdx].messages.map(m =>
                        m.id === aiMsgId ? { ...m, content: t('aiChat.requestError', { error: error.message }), isStreaming: false } : m
                    );
                    setConversations(convs);
                }
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
            const obj = JSON.parse(jsonContent);
            if (!obj) throw new Error('Invalid JSON');
            const initialTitle = obj.metadata?.title || `ai-generated-${Date.now()}`;
            setSaveTitle(initialTitle);
            setSaveJson(jsonContent);
            setSaveTarget(target);
            setSaveModalVisible(true);
        } catch (e: any) {
            message.error(t('aiChat.invalidDiagram'));
        }
    };

    // --- Multi-Target Save Executor (Step 2: Save) ---
    const executeSave = async () => {
        if (!saveTarget || !saveJson) return;
        setSaveModalVisible(false);

        try {
            const obj = JSON.parse(saveJson);
            const target = saveTarget;
            const targetLabel = target === 'local' ? t('storage.manager.local') : (target === 's3' ? 'S3' : 'Supabase');
            const hide = message.loading(t('aiChat.status.savingTo', { target: targetLabel }), 0);

            try {
                // [FIX] Update Title
                const title = saveTitle.trim() || `ai-generated-${Date.now()}`;
                obj.metadata = obj.metadata || {};
                obj.metadata.title = title;

                if (target === 'local') {
                    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY) : null;
                    const map = raw ? JSON.parse(raw) : {};
                    map[title] = obj;
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(map));
                    }
                    message.success(t('aiChat.status.saveSuccess', { target: targetLabel, title: title }));
                } else {
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
                    message.success(t('aiChat.status.saveSuccess', { target: targetLabel, title: title }));
                }
            } finally {
                hide();
            }
        } catch (error: any) {
            const errMsg = error.message || String(error);
            message.error(t('aiChat.status.saveFailed', { error: errMsg }));
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
                    <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', verticalAlign: 'middle' }}>
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
                        unifiedStorage={unifiedStorage}
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
                                type="primary"
                                shape="circle"
                                icon={<SendOutlined />}
                                onClick={handleSendMessage}
                                loading={loading}
                                disabled={!inputValue.trim()}
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
