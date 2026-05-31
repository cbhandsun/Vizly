import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, message, Segmented, Select, Spin, Tag } from 'antd';
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

export function MindMapAIPanel() {
    const [open, setOpen] = useState(false);
    const [mind, setMind] = useState(getMindElixirInstance());
    const [mode, setMode] = useState<AIMode>('create');
    const [prompt, setPrompt] = useState('');
    const [selectedNodeId, setSelectedNodeId] = useState<string>('root');
    const [targetNodeId, setTargetNodeId] = useState<string>('root');
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [, setMapTick] = useState(0);

    useEffect(() => subscribeAIPanel(setOpen), []);
    useEffect(() => subscribeMindElixir(setMind), []);

    useEffect(() => {
        if (!mind) return;
        const handleSelect = (nodes: NodeObj[]) => {
            const id = nodes[0]?.id;
            if (id) {
                setSelectedNodeId(id);
                setTargetNodeId(id);
            }
        };
        const handleSelectNew = (node: NodeObj) => {
            if (node?.id) {
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
    }, [mind]);

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

    const applyOperation = useCallback((name: string, node?: NodeObj) => {
        if (!mind) return;
        mind.bus.fire('operation', { name, obj: node ?? mind.getData().nodeData });
        setTimeout(() => mind.toCenter(), 80);
    }, [mind]);

    const handleCreateMap = useCallback(async () => {
        if (!mind || !prompt.trim() || loading) return;
        setLoading(true);
        setSuggestions([]);
        try {
            const result = await generateMindMapFromPrompt(prompt.trim());
            if ('error' in result) {
                message.error(result.error);
                return;
            }
            const current = mind.getData();
            mind.refresh({ ...current, nodeData: result.nodeData });
            applyOperation('ai_generate_map', result.nodeData);
            message.success(`已生成 ${countNodes(result.nodeData)} 个节点`);
            setPrompt('');
        } finally {
            setLoading(false);
        }
    }, [applyOperation, loading, mind, prompt]);

    const handleExpand = useCallback(async () => {
        if (!mind || !targetNode || loading) return;
        setLoading(true);
        setSuggestions([]);
        try {
            const tree = mind.getData().nodeData;
            const result = await expandNodeWithAI({
                node: targetNode,
                ancestorPath: getAncestorPath(tree, targetNode.id),
                count: 6,
                mapTitle: tree.topic,
            });
            if (result.error) {
                message.error(result.error);
                return;
            }
            setSuggestions(result.topics);
        } finally {
            setLoading(false);
        }
    }, [loading, mind, targetNode]);

    const addSuggestion = useCallback((topic: string) => {
        if (!mind || !targetNode) return;
        const node = findNodeById(mind.getData().nodeData, targetNode.id);
        if (!node) return;
        const child: NodeObj = {
            id: createAINodeId(),
            topic,
            children: [],
        };
        appendChildren(node, [child]);
        mind.refresh(mind.getData());
        applyOperation('ai_add_suggestion', node);
        setSuggestions(items => items.filter(item => item !== topic));
    }, [applyOperation, mind, targetNode]);

    const addAllSuggestions = useCallback(() => {
        if (!mind || !targetNode || suggestions.length === 0) return;
        const node = findNodeById(mind.getData().nodeData, targetNode.id);
        if (!node) return;
        appendChildren(node, suggestions.map(topic => ({
            id: createAINodeId(),
            topic,
            children: [],
        })));
        mind.refresh(mind.getData());
        applyOperation('ai_add_all_suggestions', node);
        setSuggestions([]);
    }, [applyOperation, mind, suggestions, targetNode]);

    const handleSummarize = useCallback(async () => {
        if (!mind || !targetNode || !targetNode.children?.length || loading) return;
        setLoading(true);
        try {
            const result = await summarizeNodeWithAI(
                targetNode.topic,
                targetNode.children.map(child => child.topic)
            );
            if ('error' in result) {
                message.error(result.error);
                return;
            }
            const node = findNodeById(mind.getData().nodeData, targetNode.id);
            if (!node) return;
            node.topic = result.topic;
            mind.refresh(mind.getData());
            applyOperation('ai_summarize_node', node);
            message.success('已归纳当前节点');
        } finally {
            setLoading(false);
        }
    }, [applyOperation, loading, mind, targetNode]);

    const handleRefine = useCallback(async () => {
        if (!mind || !targetNode || !prompt.trim() || loading) return;
        setLoading(true);
        try {
            const tree = mind.getData().nodeData;
            const result = await processNodeWithAICustomAction({
                node: targetNode,
                customPrompt: prompt.trim(),
                ancestorPath: getAncestorPath(tree, targetNode.id),
                mapTitle: tree.topic,
            });
            if (result.error) {
                message.error(result.error);
                return;
            }

            const node = findNodeById(tree, targetNode.id);
            if (!node) return;
            if (result.topic !== undefined) node.topic = result.topic;
            if (result.note !== undefined) node.note = result.note;
            if (result.tags !== undefined) node.tags = result.tags;
            if (result.icons !== undefined) node.icons = result.icons;
            if (result.newChildren?.length) appendChildren(node, result.newChildren);

            mind.refresh(mind.getData());
            applyOperation('ai_refine_node', node);
            setPrompt('');
            message.success('AI 处理已应用');
        } finally {
            setLoading(false);
        }
    }, [applyOperation, loading, mind, prompt, targetNode]);

    const handleClassifyTasks = useCallback(async () => {
        if (!mind || !targetNode || loading) return;
        const tree = mind.getData().nodeData;
        if (taskCandidates.length === 0) {
            message.info('当前分支没有可分类的叶子任务');
            return;
        }

        setLoading(true);
        try {
            const result = await classifyTasksWithAI(taskCandidates);
            if ('error' in result) {
                message.error(result.error);
                return;
            }
            const applied = applyTaskClassifications(tree, result.classifications);
            mind.refresh(mind.getData());
            applyOperation('ai_classify_tasks', tree);
            message.success(`已规划 ${applied} 个任务`);
        } finally {
            setLoading(false);
        }
    }, [applyOperation, loading, mind, targetNode, taskCandidates]);

    const handleClassifyTasksLocally = useCallback(() => {
        if (!mind || !targetNode) return;
        const tree = mind.getData().nodeData;
        if (taskCandidates.length === 0) {
            message.info('当前分支没有可分类的叶子任务');
            return;
        }

        const applied = applyTaskClassifications(tree, classifyTaskCandidatesLocally(taskCandidates));
        mind.refresh(mind.getData());
        applyOperation('local_classify_tasks', tree);
        message.success(`已快速规划 ${applied} 个任务`);
    }, [applyOperation, mind, targetNode, taskCandidates]);

    if (!open) return null;

    const isCreate = mode === 'create';
    const isExpand = mode === 'expand';
    const canSummarize = !!targetNode?.children?.length;

    return (
        <div style={panelStyle}>
            <div style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RobotOutlined style={{ color: '#8b5cf6', fontSize: 18 }} />
                    <span style={{ color: '#fff', fontWeight: 650 }}>AI 思维导图助手</span>
                </div>
                <Button type="text" icon={<CloseOutlined />} onClick={() => toggleAIPanel(false)} style={iconButtonStyle} />
            </div>

            <div style={bodyStyle}>
                <Segmented
                    block
                    value={mode}
                    onChange={value => {
                        setMode(value as AIMode);
                        setSuggestions([]);
                    }}
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
                            showSearch
                            value={targetNodeId || selectedNodeId}
                            onChange={setTargetNodeId}
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
                            value={prompt}
                            onChange={event => setPrompt(event.target.value)}
                            placeholder="例如：仓储系统产品规划、B2B 订单履约流程、AI 客服落地方案..."
                            autoSize={{ minRows: 4, maxRows: 7 }}
                        />
                        <Button
                            type="primary"
                            icon={<DeploymentUnitOutlined />}
                            loading={loading}
                            disabled={!prompt.trim()}
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
                            <Button icon={<FileTextOutlined />} loading={loading} onClick={handleSummarize} block>
                                根据子节点归纳标题
                            </Button>
                        )}
                    </div>
                )}

                {mode === 'refine' && (
                    <div style={fieldStyle}>
                        <label style={labelStyle}>处理指令</label>
                        <TextArea
                            value={prompt}
                            onChange={event => setPrompt(event.target.value)}
                            placeholder="例如：翻译成英文；补一段备注；扩写 5 个实施步骤；加上风险标签..."
                            autoSize={{ minRows: 4, maxRows: 8 }}
                        />
                        <Button
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
                            icon={<CheckSquareOutlined />}
                            disabled={!targetNode || taskCandidates.length === 0}
                            onClick={handleClassifyTasksLocally}
                            block
                        >
                            规则快速规划
                        </Button>
                    </div>
                )}

                {loading && (
                    <div style={loadingStyle}>
                        <Spin size="small" />
                        <span>AI 正在处理...</span>
                    </div>
                )}

                {suggestions.length > 0 && (
                    <div style={suggestionsStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={labelStyle}>建议子主题</span>
                            <Button size="small" type="link" onClick={addAllSuggestions}>全部插入</Button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {suggestions.map(topic => (
                                <Tag
                                    key={topic}
                                    color="processing"
                                    style={{ cursor: 'pointer', padding: '4px 8px', margin: 0 }}
                                    onClick={() => addSuggestion(topic)}
                                >
                                    + {topic}
                                </Tag>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 380,
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(15, 18, 36, 0.92)',
    backdropFilter: 'blur(24px) saturate(180%)',
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '-10px 0 50px rgba(0,0,0,0.42)',
};

const headerStyle: React.CSSProperties = {
    height: 58,
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

const iconButtonStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.62)',
    border: 'none',
};
