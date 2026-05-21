import React, { useEffect, useState, useCallback } from 'react';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir, subscribeKanban, toggleKanban } from './mindElixirStore';
import { classifyTasksWithAI, type TaskItemInput } from './mindmapAIService';
import { Spin, Button, Checkbox, Tooltip, message, Tag } from 'antd';
import {
    ProjectOutlined,
    CloseOutlined,
    CloudSyncOutlined,
    CopyOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    IssuesCloseOutlined,
} from '@ant-design/icons';

interface KanbanTask {
    id: string;
    topic: string;
    note?: string;
    status: 'todo' | 'doing' | 'done';
    priority: '高' | '中' | '低' | '无';
    ancestors: string[];
}

export const MindMapTaskKanban: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [mind, setMind] = useState(getMindElixirInstance());
    const [tasks, setTasks] = useState<KanbanTask[]>([]);
    const [aiClassifying, setAiClassifying] = useState(false);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    // 订阅实例和开闭状态
    useEffect(() => subscribeMindElixir(m => setMind(m)), []);
    useEffect(() => subscribeKanban(o => setOpen(o)), []);

    // 深度遍历，找出叶子节点及祖先路径
    const extractTasksFromTree = useCallback((node: NodeObj, ancestors: string[] = []): KanbanTask[] => {
        const currentAncestors = [...ancestors, node.topic];
        const isLeaf = !node.children || node.children.length === 0;

        if (isLeaf) {
            // 解析 tags 中的状态与优先级
            const tags = node.tags || [];
            let status: 'todo' | 'doing' | 'done' = 'todo';
            if (tags.includes('已完成') || tags.includes('done')) {
                status = 'done';
            } else if (tags.includes('进行中') || tags.includes('doing')) {
                status = 'doing';
            } else if (tags.includes('待办') || tags.includes('todo')) {
                status = 'todo';
            }

            let priority: '高' | '中' | '低' | '无' = '无';
            if (tags.includes('高') || tags.includes('高优先级')) {
                priority = '高';
            } else if (tags.includes('中') || tags.includes('中优先级')) {
                priority = '中';
            } else if (tags.includes('低') || tags.includes('低优先级')) {
                priority = '低';
            }

            return [{
                id: node.id,
                topic: node.topic || '(无标题)',
                note: node.note,
                status,
                priority,
                ancestors: ancestors
            }];
        }

        let result: KanbanTask[] = [];
        for (const child of node.children || []) {
            result = result.concat(extractTasksFromTree(child, currentAncestors));
        }
        return result;
    }, []);

    const refreshTasks = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const leafTasks = extractTasksFromTree(data.nodeData);
            setTasks(leafTasks);
        } catch (err) {
            console.error('[Kanban Refresh Error]', err);
        }
    }, [mind, extractTasksFromTree]);

    // 监听脑图变化，同步刷新看板
    useEffect(() => {
        if (!mind || !open) return;
        refreshTasks();

        const handleOp = () => {
            setTimeout(refreshTasks, 80);
        };

        mind.bus.addListener('operation', handleOp);
        return () => {
            mind?.bus?.removeListener('operation', handleOp);
        };
    }, [mind, open, refreshTasks]);

    // 更新节点 Tags 状态
    const updateTaskTags = useCallback((taskId: string, targetStatus: 'todo' | 'doing' | 'done', targetPriority?: '高' | '中' | '低' | '无') => {
        if (!mind) return;
        const tpcEl = mind.findEle(taskId);
        if (!tpcEl) return;

        const data = mind.getData();
        const node = mind.getObjById(taskId, data.nodeData);
        if (!node) return;

        const statusTags = ['待办', '进行中', '已完成', 'todo', 'doing', 'done'];
        const priorityTags = ['高', '中', '低', '高优先级', '中优先级', '低优先级'];
        
        let newTags = (node.tags || []).filter(t => !statusTags.includes(t) && !priorityTags.includes(t));

        if (targetStatus === 'done') {
            newTags.push('已完成');
        } else if (targetStatus === 'doing') {
            newTags.push('进行中');
        } else {
            newTags.push('待办');
        }

        const prio = targetPriority !== undefined ? targetPriority : (tasks.find(t => t.id === taskId)?.priority || '无');
        if (prio !== '无') {
            newTags.push(prio);
        }

        newTags = Array.from(new Set(newTags));

        mind.reshapeNode(tpcEl, { tags: newTags });
        mind.bus.fire('operation', {
            name: 'reshapeNode',
            obj: node,
        });

        refreshTasks();
    }, [mind, tasks, refreshTasks]);

    // ─── Drag and Drop ────────────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, colName: string) => {
        e.preventDefault();
        setDragOverColumn(colName);
    };

    const handleDrop = (e: React.DragEvent, colName: 'todo' | 'doing' | 'done') => {
        e.preventDefault();
        setDragOverColumn(null);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) {
            updateTaskTags(taskId, colName);
        }
    };

    const handleCheckboxChange = (taskId: string, checked: boolean) => {
        updateTaskTags(taskId, checked ? 'done' : 'todo');
    };

    // ─── AI 智能整理看板 ────────────────────────────────────────────────────────
    const handleAIClassify = async () => {
        if (!mind || tasks.length === 0) return;
        setAiClassifying(true);
        const hideLoading = message.loading('AI 正在对思维导图叶子节点进行敏捷逻辑规划...', 0);

        const taskInputs: TaskItemInput[] = tasks.map(t => ({
            id: t.id,
            topic: t.topic,
            context: t.ancestors.join(' > ')
        }));

        const result = await classifyTasksWithAI(taskInputs);
        hideLoading();

        if ('error' in result) {
            message.error(`规划失败：${result.error}`);
        } else {
            let updatedCount = 0;
            result.classifications.forEach(item => {
                const tpcEl = mind.findEle(item.id);
                if (tpcEl) {
                    const data = mind.getData();
                    const node = mind.getObjById(item.id, data.nodeData);
                    if (node) {
                        const statusTags = ['待办', '进行中', '已完成', 'todo', 'doing', 'done'];
                        const priorityTags = ['高', '中', '低', '高优先级', '中优先级', '低优先级'];
                        let newTags = (node.tags || []).filter(t => !statusTags.includes(t) && !priorityTags.includes(t));

                        if (item.status === 'done') newTags.push('已完成');
                        else if (item.status === 'doing') newTags.push('进行中');
                        else newTags.push('待办');

                        if (item.priority !== '无' && item.priority) {
                            newTags.push(item.priority);
                        }

                        newTags = Array.from(new Set(newTags));
                        mind.reshapeNode(tpcEl, { tags: newTags });
                        updatedCount++;
                    }
                }
            });

            if (updatedCount > 0) {
                const data = mind.getData();
                mind.bus.fire('operation', {
                    name: 'reshapeNode',
                    obj: data.nodeData,
                });
                refreshTasks();
                message.success(`AI 成功规划并同步了 ${updatedCount} 个敏捷任务！`);
            } else {
                message.warning('未找到符合条件的叶子节点进行规划');
            }
        }
        setAiClassifying(false);
    };

    const handleCopyMarkdown = () => {
        const todoList = tasks.filter(t => t.status === 'todo');
        const doingList = tasks.filter(t => t.status === 'doing');
        const doneList = tasks.filter(t => t.status === 'done');

        const formatTask = (t: KanbanTask) => {
            const prioStr = t.priority !== '无' ? ` [${t.priority}优先级]` : '';
            const pathStr = t.ancestors.length > 0 ? ` (来自: ${t.ancestors.join(' > ')})` : '';
            return `- [ ] ${t.topic}${prioStr}${pathStr}${t.note ? `\n  > 备注: ${t.note}` : ''}`;
        };

        const formatDoneTask = (t: KanbanTask) => {
            const pathStr = t.ancestors.length > 0 ? ` (来自: ${t.ancestors.join(' > ')})` : '';
            return `- [x] ${t.topic}${pathStr}`;
        };

        const mdText = [
            `# 敏捷任务看板 — ${document.title || '思维导图'}`,
            `更新时间: ${new Date().toLocaleString()}`,
            '',
            '## 📋 待办事项 (Todo)',
            todoList.length > 0 ? todoList.map(formatTask).join('\n') : '- 暂无任务',
            '',
            '## ⏳ 进行中 (Doing)',
            doingList.length > 0 ? doingList.map(formatTask).join('\n') : '- 暂无任务',
            '',
            '## ⬢ 已完成 (Done)',
            doneList.length > 0 ? doneList.map(formatDoneTask).join('\n') : '- 暂无任务',
        ].join('\n');

        navigator.clipboard.writeText(mdText).then(() => {
            message.success('📋 Markdown 看板大纲已复制到剪贴板！');
        }).catch(() => {
            message.error('复制失败，请重试');
        });
    };

    const renderColumn = (colName: 'todo' | 'doing' | 'done', title: string, icon: React.ReactNode, color: string) => {
        const filtered = tasks.filter(t => t.status === colName);
        const isOver = dragOverColumn === colName;

        return (
            <div
                style={{
                    ...columnStyle,
                    background: isOver ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    borderColor: isOver ? color : 'rgba(255,255,255,0.04)',
                }}
                onDragOver={(e) => handleDragOver(e, colName)}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, colName)}
            >
                <div style={columnHeaderStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
                        {icon}
                        <span style={columnTitleStyle}>{title}</span>
                    </div>
                    <span style={{ ...badgeStyle, backgroundColor: color }}>{filtered.length}</span>
                </div>

                <div style={columnBodyStyle}>
                    {filtered.length === 0 ? (
                        <div style={emptyColumnStyle}>拖拽卡片至此分类</div>
                    ) : (
                        filtered.map(t => (
                            <div
                                key={t.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, t.id)}
                                style={{
                                    ...cardStyle,
                                    borderLeft: t.priority === '高' ? '3px solid #f97316'
                                        : t.priority === '中' ? '3px solid #eab308'
                                        : t.priority === '低' ? '3px solid #3b82f6'
                                        : '3px solid rgba(255,255,255,0.1)',
                                    opacity: t.status === 'done' ? 0.65 : 1,
                                }}
                            >
                                <div style={cardHeaderStyle}>
                                    <Checkbox
                                        checked={t.status === 'done'}
                                        onChange={(e) => handleCheckboxChange(t.id, e.target.checked)}
                                        style={checkboxStyle}
                                    />
                                    <span style={{
                                        ...cardTopicStyle,
                                        textDecoration: t.status === 'done' ? 'line-through' : 'none',
                                        color: t.status === 'done' ? 'rgba(255,255,255,0.35)' : '#fff',
                                    }}>
                                        {t.topic}
                                    </span>
                                </div>

                                {t.note && (
                                    <div style={cardNoteStyle}>{t.note}</div>
                                )}

                                <div style={cardFooterStyle}>
                                    <span style={cardPathStyle}>
                                        {t.ancestors.slice(-2).join(' > ') || '根节点'}
                                    </span>
                                    {t.priority !== '无' && (
                                        <Tag color={
                                            t.priority === '高' ? 'error'
                                            : t.priority === '中' ? 'warning'
                                            : 'processing'
                                        } style={tagStyle}>
                                            {t.priority}
                                        </Tag>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    if (!open) return null;

    return (
        <div style={containerStyle}>
            {/* 头部 */}
            <div style={headerStyle}>
                <div style={titleWrapperStyle}>
                    <ProjectOutlined style={{ color: '#6366f1', fontSize: 18 }} />
                    <span style={titleStyle}>AI 敏捷任务看板</span>
                </div>
                <div style={actionsStyle}>
                    <Tooltip title="一键复制 Markdown">
                        <Button
                            type="text"
                            icon={<CopyOutlined />}
                            onClick={handleCopyMarkdown}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                    <Tooltip title="关闭看板">
                        <Button
                            type="text"
                            icon={<CloseOutlined />}
                            onClick={() => toggleKanban(false)}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* AI 规划栏 */}
            <div style={aiBarStyle}>
                <div style={aiBarDescStyle}>
                    <span>将思维导图的<b>叶子节点</b>自动提取并同步为任务项</span>
                </div>
                <Button
                    type="primary"
                    icon={<CloudSyncOutlined />}
                    loading={aiClassifying}
                    onClick={handleAIClassify}
                    style={aiButtonStyle}
                >
                    AI 智能规划
                </Button>
            </div>

            {/* 看板列网格 */}
            <div style={kanbanGridStyle}>
                {renderColumn('todo', '待办事项', <ClockCircleOutlined />, '#818cf8')}
                {renderColumn('doing', '进行中', <CheckCircleOutlined />, '#fbbf24')}
                {renderColumn('done', '已完成', <IssuesCloseOutlined />, '#34d399')}
            </div>
        </div>
    );
};

const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '0',
    right: '0',
    bottom: '0',
    width: '640px',
    zIndex: 9999,
    background: 'rgba(15, 18, 36, 0.85)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '-10px 0 50px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'slideInRight 0.38s cubic-bezier(0.16, 1, 0.3, 1)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '18px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
};

const titleWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const titleStyle: React.CSSProperties = {
    color: '#fff',
    fontWeight: 650,
    fontSize: '15px',
    letterSpacing: '0.5px',
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
};

const iconButtonStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.6)',
    background: 'transparent',
    border: 'none',
};

const aiBarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: 'rgba(99, 102, 241, 0.08)',
    borderBottom: '1px solid rgba(99, 102, 241, 0.15)',
};

const aiBarDescStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.6)',
};

const aiButtonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    borderColor: 'transparent',
    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '8px',
};

const kanbanGridStyle: React.CSSProperties = {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px',
    padding: '16px',
    overflow: 'hidden',
};

const columnStyle: React.CSSProperties = {
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.04)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'background-color 0.2s ease, border-color 0.2s ease',
};

const columnHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 10px 16px',
};

const columnTitleStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: '13px',
    letterSpacing: '0.4px',
};

const badgeStyle: React.CSSProperties = {
    color: '#fff',
    fontSize: '10px',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '10px',
};

const columnBodyStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
};

const emptyColumnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '80px',
    border: '1.5px dashed rgba(255,255,255,0.06)',
    borderRadius: '12px',
    color: 'rgba(255,255,255,0.25)',
    fontSize: '11px',
};

const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '12px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    cursor: 'grab',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
};

const checkboxStyle: React.CSSProperties = {
    marginTop: '3px',
};

const cardTopicStyle: React.CSSProperties = {
    fontSize: '12.5px',
    fontWeight: 500,
    lineHeight: '1.4',
    wordBreak: 'break-word',
};

const cardNoteStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.4)',
    background: 'rgba(0,0,0,0.15)',
    borderRadius: '6px',
    padding: '6px 8px',
    wordBreak: 'break-word',
    maxHeight: '48px',
    overflowY: 'auto',
};

const cardFooterStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '4px',
};

const cardPathStyle: React.CSSProperties = {
    fontSize: '10px',
    color: 'rgba(255,255,255,0.3)',
    maxWidth: '100px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const tagStyle: React.CSSProperties = {
    fontSize: '9px',
    margin: 0,
    padding: '0 4px',
    lineHeight: '1.5',
};

if (typeof document !== 'undefined') {
    const styleId = 'me-kanban-animation';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
            }
            .me-kanban-card-dragging {
                opacity: 0.4 !important;
            }
        `;
        document.head.appendChild(style);
    }
}
