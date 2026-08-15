import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Segmented, Select, Spin } from 'antd';
import {
    BranchesOutlined,
    BulbOutlined,
    CheckSquareOutlined,
    CloseOutlined,
    DeploymentUnitOutlined,
    FileTextOutlined,
    RobotOutlined,
} from '@ant-design/icons';
import type { NodeObj } from 'mind-elixir';
import {
    getMindElixirInstance,
    subscribeAIPanel,
    subscribeMindElixir,
    toggleAIPanel,
} from './mindElixirStore';
import {
    classifyTasksWithAI,
    expandNodeWithAI,
    generateMindMapFromPrompt,
    getAncestorPath,
    processNodeWithAICustomAction,
    summarizeNodeWithAI,
} from './mindmapAIService';
import { countNodes, findNodeById } from './migrate';
import {
    applyTaskClassifications,
    classifyTaskCandidatesLocally,
    collectTaskCandidates,
} from './mindmapTaskClassification';
import { cleanMindMapData, cleanMindMapTopic, refreshMindElixirWithSanitizedData } from './mindmapTreeSanitizer';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { createMindMapAIRequestLifecycle } from './mindMapAIPanelRequestLifecycle';
import { readMindMapEmptyState } from './mindMapEmptyState';
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { getViewportOverlayContainer } from '@/core/components/ui/viewportOverlayPortal';
import './MindMapAIPanel.css';

const { TextArea } = Input;

type AIMode = 'create' | 'expand' | 'refine' | 'tasks';

let aiNodeSeq = 0;

function createAINodeId(prefix = 'ai'): string {
    aiNodeSeq = (aiNodeSeq + 1) % Number.MAX_SAFE_INTEGER;
    return `${prefix}_${Date.now().toString(36)}_${aiNodeSeq.toString(36)}`;
}

function flattenNodes(root: NodeObj): NodeObj[] {
    const result: NodeObj[] = [];
    const walk = (node: NodeObj) => {
        result.push(node);
        (node.children ?? []).forEach(walk);
    };
    walk(root);
    return result;
}

function appendChildren(node: NodeObj, children: NodeObj[]) {
    node.children = [...(node.children ?? []), ...children];
    node.expanded = true;
}

function refreshCleanMindMap(mind: ReturnType<typeof getMindElixirInstance>) {
    if (!mind) return null;
    const cleaned = cleanMindMapData(mind.getData());
    refreshMindElixirWithSanitizedData(mind, cleaned);
    return cleaned.nodeData;
}

export function MindMapAIPanel() {
    const [open, setOpen] = useState(false);
    const [mind, setMind] = useState(getMindElixirInstance());
    const [mode, setMode] = useState<AIMode>('create');
    const [prompt, setPrompt] = useState('');
    const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
    const [targetNodeId, setTargetNodeId] = useState<string>('root');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [confirmingReplace, setConfirmingReplace] = useState(false);
    const [, setMapTick] = useState(0);
    const requestLifecycle = useMemo(() => createMindMapAIRequestLifecycle(), []);
    const panelOpenRef = useRef(false);
    const replaceConfirmRef = useRef<{ destroy: () => void } | null>(null);

    const invalidatePendingRequest = useCallback(() => {
        requestLifecycle.invalidate();
        setLoading(false);
    }, [requestLifecycle]);

    useEffect(() => subscribeAIPanel(nextOpen => {
        panelOpenRef.current = nextOpen;
        if (!nextOpen) {
            replaceConfirmRef.current?.destroy();
            replaceConfirmRef.current = null;
            setConfirmingReplace(false);
            invalidatePendingRequest();
            setSuggestions([]);
        }
        setOpen(nextOpen);
    }), [invalidatePendingRequest]);

    useEffect(() => subscribeMindElixir(nextMind => {
        replaceConfirmRef.current?.destroy();
        replaceConfirmRef.current = null;
        setConfirmingReplace(false);
        invalidatePendingRequest();
        setSuggestions([]);
        setMind(nextMind);
    }), [invalidatePendingRequest]);

    useEffect(() => {
        if (!mind) return;
        const handleSelect = (nodes: NodeObj[]) => {
            const id = nodes[0]?.id;
            if (id) {
                invalidatePendingRequest();
                setSuggestions([]);
                setSelectedNodeId(id);
                setTargetNodeId(id);
            }
        };
        const handleSelectNew = (node: NodeObj) => {
            if (node?.id) {
                invalidatePendingRequest();
                setSuggestions([]);
                setSelectedNodeId(node.id);
                setTargetNodeId(node.id);
            }
        };
        const handleOperation = () => setMapTick(tick => tick + 1);
        mind.bus.addListener('selectNodes', handleSelect);
        mind.bus.addListener('selectNewNode', handleSelectNew);
        mind.bus.addListener('operation', handleOperation);
        return () => {
            mind.bus.removeListener('selectNodes', handleSelect);
            mind.bus.removeListener('selectNewNode', handleSelectNew);
            mind.bus.removeListener('operation', handleOperation);
        };
    }, [invalidatePendingRequest, mind]);

    const data = mind?.getData();
    const nodeOptions = useMemo(() => {
        if (!data?.nodeData) return [];
        return flattenNodes(data.nodeData).map(node => ({
            label: node.id === data.nodeData.id ? `${node.topic}（根节点）` : node.topic,
            value: node.id,
        }));
    }, [data]);

    const targetNode = useMemo(() => {
        if (!data?.nodeData) return null;
        return findNodeById(data.nodeData, targetNodeId) ?? data.nodeData;
    }, [data, targetNodeId]);

    const taskCandidates = useMemo(() => {
        if (!data?.nodeData || !targetNode) return [];
        return collectTaskCandidates(data.nodeData, targetNode.id);
    }, [data, targetNode]);

    const applyOperation = useCallback((_name: string, node?: NodeObj) => {
        if (!mind) return;
        const changedNode = node ?? mind.getData().nodeData;
        mind.bus.fire('operation', { name: 'reshapeNode', obj: changedNode, origin: changedNode });
        setTimeout(() => mind.toCenter(), 80);
    }, [mind]);

    const beginRequest = useCallback(() => {
        const requestId = requestLifecycle.begin();
        setLoading(true);
        return requestId;
    }, [requestLifecycle]);

    const executeCreateMap = useCallback(async (requestedPrompt: string) => {
        if (!mind || !panelOpenRef.current || getMindElixirInstance() !== mind || loading) return;
        const requestId = beginRequest();
        setSuggestions([]);
        try {
            const result = await generateMindMapFromPrompt(requestedPrompt);
            if (!requestLifecycle.isCurrent(requestId)) return;
            if ('error' in result) {
                appMessage.error(result.error);
                return;
            }
            const current = mind.getData();
            refreshMindElixirWithSanitizedData(mind, cleanMindMapData({ ...current, nodeData: result.nodeData }));
            applyOperation('ai_generate_map', result.nodeData);
            appMessage.success(`已生成 ${countNodes(result.nodeData)} 个节点`);
            setPrompt('');
        } catch {
            if (requestLifecycle.isCurrent(requestId)) {
                appMessage.error('生成导图失败，请重试');
            }
        } finally {
            if (requestLifecycle.isCurrent(requestId)) setLoading(false);
        }
    }, [applyOperation, beginRequest, loading, mind, requestLifecycle]);

    const handleCreateMap = useCallback(() => {
        if (!mind || !prompt.trim() || loading || confirmingReplace) return;
        const requestedPrompt = prompt.trim();
        const generate = () => executeCreateMap(requestedPrompt);
        if (readMindMapEmptyState(mind)) {
            void generate();
            return;
        }
        setConfirmingReplace(true);
        replaceConfirmRef.current = appModal.confirm({
            title: '替换当前思维导图？',
            content: '生成完整导图会覆盖当前节点和分支。此操作可以通过撤销恢复。',
            okText: '确认替换并生成',
            cancelText: '取消',
            centered: true,
            keyboard: true,
            maskClosable: false,
            getContainer: getViewportOverlayContainer,
            onOk: generate,
            afterClose: () => {
                replaceConfirmRef.current = null;
                setConfirmingReplace(false);
            },
        });
    }, [confirmingReplace, executeCreateMap, loading, mind, prompt]);

    const handleExpand = useCallback(async () => {
        if (!mind || !targetNode || loading) return;
        const requestId = beginRequest();
        setSuggestions([]);
        try {
            const tree = mind.getData().nodeData;
            const result = await expandNodeWithAI({
                node: targetNode,
                ancestorPath: getAncestorPath(tree, targetNode.id),
                count: 6,
                mapTitle: tree.topic,
            });
            if (!requestLifecycle.isCurrent(requestId)) return;
            if (result.error) {
                appMessage.error(result.error);
                return;
            }
            setSuggestions([...new Set(result.topics.map(topic => cleanMindMapTopic(topic)).filter(Boolean))]);
        } catch {
            if (requestLifecycle.isCurrent(requestId)) {
                appMessage.error('生成子主题失败，请重试');
            }
        } finally {
            if (requestLifecycle.isCurrent(requestId)) setLoading(false);
        }
    }, [beginRequest, loading, mind, requestLifecycle, targetNode]);

    const addSuggestion = useCallback((topic: string) => {
        if (!mind || !targetNode || loading) return;
        const node = findNodeById(mind.getData().nodeData, targetNode.id);
        if (!node) return;
        const child: NodeObj = {
            id: createAINodeId(),
            topic: cleanMindMapTopic(topic),
            children: [],
        };
        appendChildren(node, [child]);
        refreshCleanMindMap(mind);
        applyOperation('ai_add_suggestion', node);
        setSuggestions(items => items.filter(item => item !== topic));
    }, [applyOperation, loading, mind, targetNode]);

    const addAllSuggestions = useCallback(() => {
        if (!mind || !targetNode || suggestions.length === 0 || loading) return;
        const node = findNodeById(mind.getData().nodeData, targetNode.id);
        if (!node) return;
        appendChildren(node, suggestions.map(topic => ({
            id: createAINodeId(),
            topic: cleanMindMapTopic(topic),
            children: [],
        })));
        refreshCleanMindMap(mind);
        applyOperation('ai_add_all_suggestions', node);
        setSuggestions([]);
    }, [applyOperation, loading, mind, suggestions, targetNode]);

    const handleSummarize = useCallback(async () => {
        if (!mind || !targetNode || !targetNode.children?.length || loading) return;
        const requestId = beginRequest();
        try {
            const result = await summarizeNodeWithAI(
                targetNode.topic,
                targetNode.children.map(child => child.topic)
            );
            if (!requestLifecycle.isCurrent(requestId)) return;
            if ('error' in result) {
                appMessage.error(result.error);
                return;
            }
            const node = findNodeById(mind.getData().nodeData, targetNode.id);
            if (!node) return;
            node.topic = cleanMindMapTopic(result.topic);
            refreshCleanMindMap(mind);
            applyOperation('ai_summarize_node', node);
            appMessage.success('已归纳当前节点');
        } catch {
            if (requestLifecycle.isCurrent(requestId)) {
                appMessage.error('归纳节点失败，请重试');
            }
        } finally {
            if (requestLifecycle.isCurrent(requestId)) setLoading(false);
        }
    }, [applyOperation, beginRequest, loading, mind, requestLifecycle, targetNode]);

    const handleRefine = useCallback(async () => {
        if (!mind || !targetNode || !prompt.trim() || loading) return;
        const requestId = beginRequest();
        try {
            const tree = mind.getData().nodeData;
            const result = await processNodeWithAICustomAction({
                node: targetNode,
                customPrompt: prompt.trim(),
                ancestorPath: getAncestorPath(tree, targetNode.id),
                mapTitle: tree.topic,
            });
            if (!requestLifecycle.isCurrent(requestId)) return;
            if (result.error) {
                appMessage.error(result.error);
                return;
            }

            const node = findNodeById(tree, targetNode.id);
            if (!node) return;
            const cleanPatch = cleanMindMapNodePatch({
                topic: result.topic,
                note: result.note,
                tags: result.tags,
                icons: result.icons,
            });
            if (cleanPatch.topic !== undefined) node.topic = cleanPatch.topic;
            if (result.note !== undefined) node.note = cleanPatch.note;
            if (result.tags !== undefined) node.tags = cleanPatch.tags;
            if (result.icons !== undefined) node.icons = cleanPatch.icons;
            if (result.newChildren?.length) appendChildren(node, result.newChildren);

            refreshCleanMindMap(mind);
            applyOperation('ai_refine_node', node);
            setPrompt('');
            appMessage.success('AI 处理已应用');
        } catch {
            if (requestLifecycle.isCurrent(requestId)) {
                appMessage.error('AI 处理失败，请重试');
            }
        } finally {
            if (requestLifecycle.isCurrent(requestId)) setLoading(false);
        }
    }, [applyOperation, beginRequest, loading, mind, prompt, requestLifecycle, targetNode]);

    const handleClassifyTasks = useCallback(async () => {
        if (!mind || !targetNode || loading) return;
        const tree = mind.getData().nodeData;
        if (taskCandidates.length === 0) {
            appMessage.info('当前分支没有可分类的叶子任务');
            return;
        }

        const requestId = beginRequest();
        try {
            const result = await classifyTasksWithAI(taskCandidates);
            if (!requestLifecycle.isCurrent(requestId)) return;
            if ('error' in result) {
                appMessage.error(result.error);
                return;
            }
            const applied = applyTaskClassifications(tree, result.classifications);
            refreshCleanMindMap(mind);
            applyOperation('ai_classify_tasks', tree);
            appMessage.success(`已规划 ${applied} 个任务`);
        } catch {
            if (requestLifecycle.isCurrent(requestId)) {
                appMessage.error('规划任务失败，请重试');
            }
        } finally {
            if (requestLifecycle.isCurrent(requestId)) setLoading(false);
        }
    }, [applyOperation, beginRequest, loading, mind, requestLifecycle, targetNode, taskCandidates]);

    const handleClassifyTasksLocally = useCallback(() => {
        if (!mind || !targetNode || loading) return;
        const tree = mind.getData().nodeData;
        if (taskCandidates.length === 0) {
            appMessage.info('当前分支没有可分类的叶子任务');
            return;
        }

        const applied = applyTaskClassifications(tree, classifyTaskCandidatesLocally(taskCandidates));
        refreshCleanMindMap(mind);
        applyOperation('local_classify_tasks', tree);
        appMessage.success(`已快速规划 ${applied} 个任务`);
    }, [applyOperation, loading, mind, targetNode, taskCandidates]);

    const handleClose = useCallback(() => {
        replaceConfirmRef.current?.destroy();
        replaceConfirmRef.current = null;
        setConfirmingReplace(false);
        panelOpenRef.current = false;
        invalidatePendingRequest();
        setSuggestions([]);
        toggleAIPanel(false);
    }, [invalidatePendingRequest]);

    const handleModeChange = useCallback((value: string | number) => {
        invalidatePendingRequest();
        setSuggestions([]);
        setMode(value as AIMode);
    }, [invalidatePendingRequest]);

    const handleTargetChange = useCallback((nodeId: string) => {
        invalidatePendingRequest();
        setSuggestions([]);
        setTargetNodeId(nodeId);
    }, [invalidatePendingRequest]);

    if (!open) return null;

    const isCreate = mode === 'create';
    const isExpand = mode === 'expand';
    const canSummarize = !!targetNode?.children?.length;

    return (
        <div
            aria-busy={loading}
            aria-label="AI 思维导图助手"
            className="mindmap-ai-panel"
            role="complementary"
        >
            <div style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RobotOutlined aria-hidden="true" style={{ color: '#8b5cf6', fontSize: 18 }} />
                    <span style={{ color: '#fff', fontWeight: 650 }}>AI 思维导图助手</span>
                </div>
                <Button aria-label="关闭 AI 思维导图助手" title="关闭 AI 思维导图助手" type="text" icon={<CloseOutlined />} onClick={handleClose} style={iconButtonStyle} />
            </div>

            <div style={bodyStyle}>
                <Segmented
                    aria-label="AI 思维导图操作模式"
                    block
                    disabled={loading}
                    value={mode}
                    onChange={handleModeChange}
                    options={[
                        { label: '建图', value: 'create', icon: <DeploymentUnitOutlined /> },
                        { label: '扩展', value: 'expand', icon: <BranchesOutlined /> },
                        { label: '处理', value: 'refine', icon: <BulbOutlined /> },
                        { label: '任务', value: 'tasks', icon: <CheckSquareOutlined /> },
                    ]}
                />

                {!isCreate && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>目标节点</label>
                        <Select
                            aria-label="AI 操作目标节点"
                            disabled={loading}
                            showSearch
                            value={targetNodeId || selectedNodeId}
                            onChange={handleTargetChange}
                            options={nodeOptions}
                            optionFilterProp="label"
                            style={{ width: '100%' }}
                        />
                    </div>
                )}

                {isCreate && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>输入主题或业务问题</label>
                        <TextArea
                            aria-label="AI 建图主题或业务问题"
                            disabled={loading}
                            value={prompt}
                            onChange={event => setPrompt(event.target.value)}
                            placeholder="例如：仓储系统产品规划、B2B 订单履约流程、AI 客服落地方案..."
                            autoSize={{ minRows: 4, maxRows: 7 }}
                        />
                        <Button
                            aria-label="生成完整导图"
                            type="primary"
                            icon={<DeploymentUnitOutlined />}
                            loading={loading}
                            disabled={!prompt.trim() || confirmingReplace}
                            onClick={handleCreateMap}
                            block
                        >
                            生成完整导图
                        </Button>
                    </div>
                )}

                {isExpand && (
                    <div style={fieldStyle}>
                        <div style={hintStyle}>
                            AI 会基于当前节点路径生成可选择的子主题，先预览再插入。
                        </div>
                        <Button
                            aria-label="生成子主题建议"
                            type="primary"
                            icon={<BranchesOutlined />}
                            loading={loading}
                            disabled={!targetNode}
                            onClick={handleExpand}
                            block
                        >
                            生成子主题建议
                        </Button>
                        {canSummarize && (
                            <Button aria-label="根据子节点归纳标题" icon={<FileTextOutlined />} loading={loading} onClick={handleSummarize} block>
                                根据子节点归纳标题
                            </Button>
                        )}
                    </div>
                )}

                {mode === 'refine' && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>处理指令</label>
                        <TextArea
                            aria-label="AI 思维导图处理指令"
                            disabled={loading}
                            value={prompt}
                            onChange={event => setPrompt(event.target.value)}
                            placeholder="例如：翻译成英文；补一段备注；扩写 5 个实施步骤；加上风险标签..."
                            autoSize={{ minRows: 4, maxRows: 8 }}
                        />
                        <Button
                            aria-label="应用到目标节点"
                            type="primary"
                            icon={<BulbOutlined />}
                            loading={loading}
                            disabled={!prompt.trim() || !targetNode}
                            onClick={handleRefine}
                            block
                        >
                            应用到目标节点
                        </Button>
                    </div>
                )}

                {mode === 'tasks' && (
                    <div style={fieldStyle}>
                        <div style={hintStyle}>
                            当前分支有 {taskCandidates.length} 个叶子任务。AI 会批量写入任务状态和优先级，并同步到看板与导出。
                        </div>
                        <Button
                            aria-label="规划当前分支任务"
                            type="primary"
                            icon={<CheckSquareOutlined />}
                            loading={loading}
                            disabled={!targetNode}
                            onClick={handleClassifyTasks}
                            block
                        >
                            规划当前分支任务
                        </Button>
                        <Button
                            aria-label="规则快速规划"
                            icon={<CheckSquareOutlined />}
                            disabled={!targetNode || taskCandidates.length === 0 || loading}
                            onClick={handleClassifyTasksLocally}
                            block
                        >
                            规则快速规划
                        </Button>
                    </div>
                )}

                {loading && (
                    <div aria-live="polite" role="status" style={loadingStyle}>
                        <Spin size="small" />
                        <span>AI 正在处理...</span>
                    </div>
                )}

                {suggestions.length > 0 && (
                    <div style={suggestionsStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={labelStyle}>建议子主题</span>
                            <Button aria-label="全部插入建议子主题" disabled={loading} size="small" type="link" onClick={addAllSuggestions}>全部插入</Button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {suggestions.map(topic => (
                                <Button
                                    key={topic}
                                    disabled={loading}
                                    onClick={() => addSuggestion(topic)}
                                    size="small"
                                    style={suggestionButtonStyle}
                                >
                                    + {topic}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const headerStyle: React.CSSProperties = {
    minHeight: 58,
    padding: '0 18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const bodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
};

const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
};

const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.62)',
    fontWeight: 600,
};

const hintStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.7,
    padding: '10px 12px',
    borderRadius: 8,
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid rgba(99,102,241,0.14)',
};

const loadingStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
};

const suggestionsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
};

const suggestionButtonStyle: React.CSSProperties = {
    minHeight: 32,
    height: 'auto',
    padding: '4px 8px',
    color: '#91caff',
    whiteSpace: 'normal',
    borderColor: 'rgba(22, 119, 255, 0.35)',
    background: 'rgba(22, 119, 255, 0.12)',
};

const iconButtonStyle: React.CSSProperties = {
    minWidth: 44,
    width: 44,
    height: 44,
    color: 'rgba(255,255,255,0.62)',
    border: 'none',
};
