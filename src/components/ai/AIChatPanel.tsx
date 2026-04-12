// @ts-nocheck
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
import { useAuth } from '@/context/AuthContext';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { aiConversationService, Conversation, Message } from '@/services/ai/AIConversationService';
import { DIAGRAM_SYSTEM_PROMPT, enhanceWithSlashCommand, buildDiagramContext, buildAnalysisContext } from '@/services/ai/diagramPrompts';
import List from 'antd/es/list';
import Tooltip from 'antd/es/tooltip';
import Popconfirm from 'antd/es/popconfirm';
import { useTranslation } from 'react-i18next';
import './AIChatPanel.css';

const CUSTOM_PRESETS_STORAGE_KEY = 'GenericStandardDiagram.customPresets';

/** 画布操作回调接口 */
export interface CanvasOperations {
    /** 添加节点到画布（返回新节点 ID） */
    onAddNode?: (label: string, shape?: string) => string | void;
    /** 删除指定节点 */
    onDeleteNodes?: (nodeIds: string[]) => void;
    /** 连接两个节点 */
    onConnectNodes?: (sourceId: string, targetId: string, label?: string) => void;
    /** 触发自动布局 */
    onAutoLayout?: (strategy?: string) => void;
}

export interface AIChatPanelProps {
    open: boolean;
    onClose: () => void;
    onOpenConfig: () => void;
    onApplyJson: (json: string) => void;
    onPreviewJson: (json: string) => void;
    /** 当前画布节点引用（用于 AI 上下文） */
    diagramNodesRef?: React.RefObject<Array<{ id: string; type?: string; data?: any }>>;
    diagramEdgesRef?: React.RefObject<Array<{ id: string; source: string; target: string; label?: any }>>;
    /** 画布直接操作回调 */
    canvasOps?: CanvasOperations;
}

// --- Slash Commands ---
const SLASH_COMMANDS = [
    { key: '/add', label: '/add <节点描述>', description: '⚡ 直接添加节点到画布' },
    { key: '/connect', label: '/connect <A> <B>', description: '⚡ 连接两个节点' },
    { key: '/layout', label: '/layout [类型]', description: '⚡ 自动布局 (dagre/grid/force)' },
    { key: '/delete', label: '/delete <节点名>', description: '⚡ 删除匹配的节点' },
    { key: '/generate', label: '/generate <描述>', description: '🤖 AI 生成完整图表' },
    { key: '/analyze', label: '/analyze', description: '🤖 AI 分析当前图表结构' },
    { key: '/clear', label: '/clear', description: '清空对话' },
    { key: '/help', label: '/help', description: '显示帮助' },
];

// --- Typing Indicator Component ---
const TypingIndicator: React.FC = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677ff', animation: 'typingDot 1.4s infinite ease-in-out', animationDelay: '0s' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677ff', animation: 'typingDot 1.4s infinite ease-in-out', animationDelay: '0.2s' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1677ff', animation: 'typingDot 1.4s infinite ease-in-out', animationDelay: '0.4s' }} />
        <style>{`
            @keyframes typingDot {
                0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
                40% { transform: scale(1); opacity: 1; }
            }
        `}</style>
    </div>
);

// --- Helper: Generate unique ID ---
const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * The internal view component for AI Chat, suitable for both Drawer and Sidebar embedding.
 */
const HISTORY_STORAGE_KEY = 'AIChatPanel.history';

export const AIChatView: React.FC<Omit<AIChatPanelProps, 'open'>> = ({ onClose, onOpenConfig, onApplyJson, onPreviewJson, diagramNodesRef, diagramEdgesRef, canvasOps }) => {
    // --- i18n ---
    const { t } = useTranslation();
    // --- Auth ---
    const { user } = useAuth();

    // --- State ---
    const [conversations, setConversations] = useState<Conversation[]>(() => aiConversationService.getConversations());
    const [activeId, setActiveId] = useState<string | null>(() => aiConversationService.getActiveConversationId());
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [showCommands, setShowCommands] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default to closed overlay
    const [filteredCommands, setFilteredCommands] = useState(SLASH_COMMANDS);

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
            content: '你好！我是架构图 AI 助手。直接描述需求即可，例如：\n\n- "画一个电商微服务架构"\n- "生成 AWS 云架构图"\n- "创建 React 组件关系图"'
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
            const welcomeMsg: Message = { id: generateId(), role: 'assistant', content: '对话已清空。有什么可以帮助您的？' };
            if (activeId) {
                aiConversationService.updateConversation(activeId, { messages: [welcomeMsg] });
                setConversations(aiConversationService.getConversations());
            }
            return true;
        }

        if (lower === '/help') {
            const helpText = SLASH_COMMANDS.map(c => `**${c.label}** - ${c.description}`).join('\n');
            addLocalMessage('assistant', `📚 **可用命令**:\n\n${helpText}\n\n> ⚡ 标记的命令会**直接操纵画布**，无需等待 AI 响应`);
            return true;
        }

        // ⚡ /add — 直接添加节点
        if (cmd === '/add' && args) {
            if (canvasOps?.onAddNode) {
                addLocalMessage('user', trimmed);
                const newId = canvasOps.onAddNode(args);
                addLocalMessage('assistant', `✅ 已添加节点「${args}」${newId ? ` (ID: ${newId})` : ''}`);
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
                    addLocalMessage('assistant', `🗑️ 已删除 ${matches.length} 个匹配「${args}」的节点`);
                } else {
                    addLocalMessage('assistant', `⚠️ 未找到匹配「${args}」的节点`);
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
                        addLocalMessage('assistant', `🔗 已连接「${connectArgs[0]}」→「${connectArgs[connectArgs.length - 1]}」`);
                    } else {
                        const missing = !sourceNode ? connectArgs[0] : connectArgs[connectArgs.length - 1];
                        addLocalMessage('assistant', `⚠️ 未找到节点「${missing}」`);
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
                addLocalMessage('assistant', `📐 已应用${args ? ` ${args} ` : '自动'}布局`);
                return true;
            }
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
        console.log('[AI Debug] activeModelKey:', config.activeModelKey);
        console.log('[AI Debug] pId:', pId, 'mId:', mId);
        console.log('[AI Debug] activeProvider:', activeProvider?.id, 'enabled:', activeProvider?.enabled, 'hasApiKey:', !!activeProvider?.apiKey);
        console.log('[AI Debug] activeModel:', activeModel?.id, 'enabled:', activeModel?.enabled);

        // 如果当前选择的模型不可用，尝试自动回退到第一个可用的模型
        if (!activeProvider || !activeProvider.apiKey || !activeModel) {
            console.log('[AI Debug] Current model not available, trying to find fallback...');

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

                        console.log('[AI Debug] Auto-switched to:', newActiveModelKey);
                        message.info(`已自动切换到: ${provider.name} - ${enabledModel.name}`);
                        break;
                    }
                }
            }
        }

        // 再次检查
        if (!activeProvider || !activeProvider.apiKey || !activeModel) {
            console.log('[AI Debug] No available model found');
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
            const response = await fetch(`${activeProvider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeProvider.apiKey}`
                },
                body: JSON.stringify({
                    model: activeModel.id,
                    messages: [
                        { role: 'system', content: config.systemPrompt || DIAGRAM_SYSTEM_PROMPT },
                        ...messages.filter(m => !m.isStreaming).map(m => ({ role: m.role, content: m.content })),
                        { role: 'user', content: enhanceWithSlashCommand(newUserMsg.content) + buildDiagramContext(diagramNodesRef?.current || [], diagramEdgesRef?.current || []) + (newUserMsg.content.trim().startsWith('/analyze') ? buildAnalysisContext(diagramNodesRef?.current || [], diagramEdgesRef?.current || []) : '') }
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

                                // Update UI State
                                if (activeId) {
                                    const convs = [...aiConversationService.getConversations()];
                                    const cIdx = convs.findIndex(c => c.id === activeId);
                                    if (cIdx !== -1) {
                                        // 每次小更新也尝试嗅探一下有没有局部 JSON
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
            message.error(`请求失败: ${error.message}`);
            if (activeId) {
                const convs = [...aiConversationService.getConversations()];
                const cIdx = convs.findIndex(c => c.id === activeId);
                if (cIdx !== -1) {
                    convs[cIdx].messages = convs[cIdx].messages.map(m =>
                        m.id === aiMsgId ? { ...m, content: `❌ 请求出错: ${error.message}`, isStreaming: false } : m
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
            message.error('无效的图表数据');
        }
    };

    // --- Multi-Target Save Executor (Step 2: Save) ---
    const executeSave = async () => {
        if (!saveTarget || !saveJson) return;
        setSaveModalVisible(false);

        try {
            const obj = JSON.parse(saveJson);
            const target = saveTarget;
            const targetLabel = target === 'local' ? '本地工作区' : (target === 's3' ? 'S3 存储' : 'Supabase 云端');
            const hide = message.loading(`正在保存到 ${targetLabel}...`, 0);

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
                    message.success(`已保存到本地工作区: ${title}`);
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
                    message.success(`已保存到 ${targetLabel}: ${title}`);
                }
            } finally {
                hide();
            }
        } catch (error: any) {
            const errMsg = error.message || String(error);
            message.error(`保存失败: ${errMsg}`);
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
                    <div key={item.id} className={`ai-chat-message ${item.role}`}>
                        <div className="ai-chat-avatar">
                            {item.role === 'user' ? (
                                <Avatar icon={<UserOutlined />} className="avatar-user" />
                            ) : (
                                <Avatar icon={<RobotOutlined />} className="avatar-ai" />
                            )}
                        </div>
                        <div className="ai-chat-bubble">
                            <div className="ai-chat-bubble-content ai-markdown-content">
                                {item.reasoningContent && (
                                    <Collapse
                                        ghost
                                        className="ai-chat-reasoning"
                                        items={[{
                                            key: '1',
                                            label: <span style={{ color: '#888', fontSize: 13, userSelect: 'none' }}>🧠 思考过程 </span>,
                                            children: (
                                                <div className="reasoning-content-inner">
                                                    {item.reasoningContent}
                                                </div>
                                            )
                                        }]}
                                    />
                                )}
                                {item.isStreaming && !item.content && !item.reasoningContent ? (
                                    <TypingIndicator />
                                ) : item.content ? (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {item.content}
                                    </ReactMarkdown>
                                ) : null}
                                {item.isStreaming && item.content && (
                                    <span className="ai-chat-cursor" />
                                )}
                            </div>
                            {item.hasJson && item.jsonContent && (
                                <div className="ai-chat-actions">
                                        <Button
                                            type="text"
                                            size="small"
                                            icon={<CodeOutlined />}
                                            onClick={() => onPreviewJson(item.jsonContent!)}
                                        >
                                            {item.isStreaming ? '正在生成图表...' : t('aiChat.previewCode')}
                                        </Button>
                                        {!item.isStreaming && (
                                            <Dropdown
                                                menu={{
                                                    items: [
                                                        {
                                                            key: 'local',
                                                            label: t('aiChat.saveLocal'),
                                                            icon: <ApartmentOutlined />,
                                                            onClick: () => handleSaveDiagramTo(item.jsonContent!, 'local'),
                                                        },
                                                        {
                                                            key: 's3',
                                                            label: t('aiChat.saveS3'),
                                                            icon: <CloudOutlined />,
                                                            onClick: () => handleSaveDiagramTo(item.jsonContent!, 's3'),
                                                            disabled: !unifiedStorage.getProvider('s3').isConfigured(),
                                                        },
                                                        {
                                                            key: 'supabase',
                                                            label: t('aiChat.saveCloud'),
                                                            icon: <DatabaseOutlined />,
                                                            onClick: () => handleSaveDiagramTo(item.jsonContent!, 'supabase'),
                                                            disabled: !unifiedStorage.getProvider('supabase').isConfigured(),
                                                        },
                                                    ],
                                                }}
                                                placement="bottomLeft"
                                            >
                                                <Button type="text" size="small" icon={<CloudServerOutlined />}>
                                                    {t('aiChat.saveDiagram')} <DownOutlined style={{ fontSize: 10 }} />
                                                </Button>
                                            </Dropdown>
                                        )}
                                        <Button
                                            type="text"
                                            className="action-btn-apply"
                                            size="small"
                                            icon={<CheckCircleOutlined />}
                                            onClick={() => onApplyJson(item.jsonContent!)}
                                        >
                                            {t('aiChat.apply')}
                                        </Button>
                                </div>
                            )}
                        </div>
                    </div>
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
                        <Button
                            type="primary"
                            shape="circle"
                            icon={<SendOutlined />}
                            onClick={handleSendMessage}
                            loading={loading}
                            disabled={!inputValue.trim()}
                            className="ai-chat-send-btn"
                        />
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
