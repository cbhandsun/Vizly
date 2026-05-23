import React, { useMemo, useState } from 'react';
import { Drawer, Card, Tag, Collapse, Typography, Avatar, Tooltip, Divider, Empty } from 'antd';
import { 
    TeamOutlined, 
    WarningOutlined, 
    CalendarOutlined, 
    _UserOutlined,
    _ClockCircleOutlined,
    QuestionCircleOutlined,
    EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { ProGanttTask, getWorkDaysSigned, useProTimelineEngine, isWeekend } from '../../../hooks/useProTimelineEngine';
import { useTheme } from '../../../themes/useCoreTheme';

const { Text, Title } = Typography;
const { Panel } = Collapse;

interface ProResourceDrawerProps {
    open: boolean;
    onClose: () => void;
    tasks: ProGanttTask[];
    onTaskClick: (taskId: string) => void;
}

interface ConflictPeriod {
    startDate: string;
    endDate: string;
    taskIds: string[];
    workDays: number;
}

interface ResourceStats {
    name: string;
    tasks: ProGanttTask[];
    totalWorkDays: number;
    overloadDays: number;
    conflicts: ConflictPeriod[];
}

export const ProResourceDrawer: React.FC<ProResourceDrawerProps> = ({
    open,
    onClose,
    tasks,
    onTaskClick
}) => {
    const { setPan, panY, dateToX } = useProTimelineEngine();
    const [theme] = useTheme();
    const isDark = theme?.mode === 'dark';

    // 颜色配置
    const glassBg = isDark ? 'rgba(28, 28, 28, 0.85)' : 'rgba(255, 255, 255, 0.9)';
    const borderColor = isDark ? '#303030' : 'rgba(0,0,0,0.06)';
    const cardBg = isDark ? '#1f1f1f' : '#ffffff';
    const subTextColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)';
    const primaryTextColor = isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)';

    // 基于名字生成好看的首字母头像渐变色背景
    const getAvatarBg = (name: string) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash % 360);
        return `linear-gradient(135deg, hsl(${h}, 70%, 65%) 0%, hsl(${(h + 120) % 360}, 75%, 55%) 100%)`;
    };

    // 资源负载深度分析算法
    const resourceStatsList = useMemo<ResourceStats[]>(() => {
        // 1. 提取所有非 Summary 且具有有效负责人的原子任务 (Milestone 不耗费工期，故也不算进超载，只统计 Phase 和 Event)
        const activeTasks = tasks.filter(t => 
            t.type !== 'summary' && 
            t.type !== 'milestone' && 
            t.startDate && 
            t.endDate
        );

        // 2. 收集所有负责人（包括未指派）
        const assignees = new Set<string>();
        activeTasks.forEach(t => {
            if (t.assignee && t.assignee.trim()) {
                assignees.add(t.assignee.trim());
            }
        });

        // 3. 计算每个负责人的统计信息
        const stats: ResourceStats[] = [];

        assignees.forEach(name => {
            const userTasks = activeTasks.filter(t => t.assignee?.trim() === name);
            
            // 计算总工时 (工作日之和)
            let totalWorkDays = 0;
            userTasks.forEach(t => {
                const wd = getWorkDaysSigned(t.startDate, t.endDate) + 1; // 包含首尾工作日
                totalWorkDays += wd > 0 ? wd : 0;
            });

            // 4. 统计每一天该负责人承担的任务数，构建负荷日历
            const dateToTaskIds = new Map<string, string[]>();
            userTasks.forEach(t => {
                let curr = dayjs(t.startDate);
                const end = dayjs(t.endDate);
                while (curr.isBefore(end) || curr.isSame(end, 'day')) {
                    const dateStr = curr.format('YYYY-MM-DD');
                    if (!isWeekend(dateStr)) {
                        const list = dateToTaskIds.get(dateStr) || [];
                        list.push(t.id);
                        dateToTaskIds.set(dateStr, list);
                    }
                    curr = curr.add(1, 'day');
                }
            });

            // 5. 提取超载工作日 (任务并行数 >= 2)
            const overloadDates = Array.from(dateToTaskIds.entries())
                .filter(([_, list]) => list.length >= 2)
                .map(([dateStr, _]) => dateStr)
                .sort();

            const overloadDays = overloadDates.length;

            // 6. 核心合并算法：基于工作日连续性将分散的超载日期合并为冲突区间
            const conflicts: ConflictPeriod[] = [];
            if (overloadDates.length > 0) {
                let currentPeriod: { startDate: string; endDate: string; taskIds: Set<string> } | null = null;
                
                for (let i = 0; i < overloadDates.length; i++) {
                    const date = overloadDates[i];
                    const taskIdsAtDate = dateToTaskIds.get(date) || [];
                    
                    if (!currentPeriod) {
                        currentPeriod = {
                            startDate: date,
                            endDate: date,
                            taskIds: new Set(taskIdsAtDate)
                        };
                    } else {
                        // getWorkDaysSigned 计算两个日期之间的工作日偏移量
                        // 若为 1，则代表它们在工作日维度上是连续相邻的
                        const workDaysGap = getWorkDaysSigned(currentPeriod.endDate, date);
                        if (workDaysGap === 1) {
                            currentPeriod.endDate = date;
                            taskIdsAtDate.forEach(id => currentPeriod!.taskIds.add(id));
                        } else {
                            conflicts.push({
                                startDate: currentPeriod.startDate,
                                endDate: currentPeriod.endDate,
                                taskIds: Array.from(currentPeriod.taskIds),
                                workDays: getWorkDaysSigned(currentPeriod.startDate, currentPeriod.endDate) + 1
                            });
                            currentPeriod = {
                                startDate: date,
                                endDate: date,
                                taskIds: new Set(taskIdsAtDate)
                            };
                        }
                    }
                }
                
                if (currentPeriod) {
                    conflicts.push({
                        startDate: currentPeriod.startDate,
                        endDate: currentPeriod.endDate,
                        taskIds: Array.from(currentPeriod.taskIds),
                        workDays: getWorkDaysSigned(currentPeriod.startDate, currentPeriod.endDate) + 1
                    });
                }
            }

            stats.push({
                name,
                tasks: userTasks,
                totalWorkDays,
                overloadDays,
                conflicts
            });
        });

        // 排序：将超载天数多的人排在最前面，无超载的人按名字拼音字母排序
        return stats.sort((a, b) => {
            if (b.overloadDays !== a.overloadDays) {
                return b.overloadDays - a.overloadDays;
            }
            return a.name.localeCompare(b.name, 'zh-CN');
        });
    }, [tasks]);

    // 未分配负责人的叶子任务
    const unassignedTasks = useMemo(() => {
        return tasks.filter(t => 
            t.type !== 'summary' && 
            (!t.assignee || !t.assignee.trim()) && 
            t.startDate && 
            t.endDate
        );
    }, [tasks]);

    // KPI 汇总数据
    const totalStaff = resourceStatsList.length;
    const overloadedCount = resourceStatsList.filter(s => s.overloadDays > 0).length;
    const unassignedCount = unassignedTasks.length;

    // 定位并聚焦任务条到画布中央
    const handleFocusTask = (task: ProGanttTask) => {
        onTaskClick(task.id);
        if (task.startDate) {
            const taskX = dateToX(task.startDate);
            setPan(-taskX + 120, panY); // 水平对齐到左侧 120px 处，提供舒服的视野
        }
    };

    return (
        <Drawer
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TeamOutlined style={{ color: '#1890ff' }} />
                    <Title level={5} style={{ margin: 0 }}>团队工时与资源负载分析</Title>
                </div>
            }
            placement="right"
            onClose={onClose}
            open={open}
            width={480}
            style={{
                background: glassBg,
                backdropFilter: 'blur(16px)',
                boxShadow: '-6px 0 24px rgba(0, 0, 0, 0.15)',
                borderLeft: `1px solid ${borderColor}`,
            }}
            bodyStyle={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
            {/* KPI 指标卡区块 */}
            <div style={{ display: 'flex', gap: 12 }}>
                <Card size="small" style={{ flex: 1, textAlign: 'center', background: cardBg, border: `1px solid ${borderColor}` }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>团队人员</Text>
                    <div style={{ fontSize: 20, fontWeight: 700, color: primaryTextColor }}>{totalStaff} <span style={{ fontSize: 12, fontWeight: 400 }}>人</span></div>
                </Card>
                <Card size="small" style={{ flex: 1, textAlign: 'center', background: cardBg, border: `1px solid ${borderColor}` }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>超负荷分配</Text>
                    <div style={{ fontSize: 20, fontWeight: 700, color: overloadedCount > 0 ? '#ff4d4f' : '#52c41a' }}>
                        {overloadedCount} <span style={{ fontSize: 12, fontWeight: 400, color: subTextColor }}>人</span>
                    </div>
                </Card>
                <Card size="small" style={{ flex: 1, textAlign: 'center', background: cardBg, border: `1px solid ${borderColor}` }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>未分配任务</Text>
                    <div style={{ fontSize: 20, fontWeight: 700, color: unassignedCount > 0 ? '#faad14' : primaryTextColor }}>
                        {unassignedCount} <span style={{ fontSize: 12, fontWeight: 400, color: subTextColor }}>个</span>
                    </div>
                </Card>
            </div>

            {/* 主列表 */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
                {totalStaff === 0 && unassignedCount === 0 ? (
                    <div style={{ padding: '60px 0', textAlign: 'center' }}>
                        <Empty description="画布暂无排期任务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    </div>
                ) : (
                    <>
                        {/* 资源分配统计列表 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {resourceStatsList.map(stats => {
                                const isOverloaded = stats.overloadDays > 0;
                                return (
                                    <div 
                                        key={stats.name}
                                        style={{
                                            border: `1px solid ${isOverloaded ? '#ff4d4f40' : borderColor}`,
                                            background: cardBg,
                                            borderRadius: 8,
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* 卡片头部 */}
                                        <div style={{
                                            padding: '12px 14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            borderBottom: `1px solid ${borderColor}`,
                                            background: isOverloaded ? (isDark ? 'rgba(255, 77, 79, 0.05)' : 'rgba(255, 77, 79, 0.02)') : 'transparent'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Avatar style={{ background: getAvatarBg(stats.name), verticalAlign: 'middle', fontWeight: 600 }} size="small">
                                                    {stats.name[0]}
                                                </Avatar>
                                                <Text strong style={{ fontSize: 13, color: primaryTextColor }}>{stats.name}</Text>
                                            </div>
                                            <div>
                                                {isOverloaded ? (
                                                    <Tag color="error" style={{ margin: 0, fontWeight: 600, borderRadius: 4 }}>
                                                        <WarningOutlined /> 超载 {stats.overloadDays} 天
                                                    </Tag>
                                                ) : (
                                                    <Tag color="success" style={{ margin: 0, borderRadius: 4 }}>正常</Tag>
                                                )}
                                            </div>
                                        </div>

                                        {/* 简要指标 */}
                                        <div style={{ padding: '10px 14px', display: 'flex', gap: 24, fontSize: 12 }}>
                                            <div>
                                                <span style={{ color: subTextColor }}>负责任务: </span>
                                                <Text strong style={{ color: primaryTextColor }}>{stats.tasks.length} 个</Text>
                                            </div>
                                            <div>
                                                <span style={{ color: subTextColor }}>投入总工时: </span>
                                                <Text strong style={{ color: primaryTextColor }}>{stats.totalWorkDays} 工作日</Text>
                                            </div>
                                        </div>

                                        {/* 负荷明细（手琴折叠） */}
                                        <Collapse ghost size="small" style={{ borderTop: `1px solid ${borderColor}` }}>
                                            <Panel header={<span style={{ fontSize: 11, color: '#1890ff', cursor: 'pointer' }}>展开负载明细</span>} key="detail">
                                                <div style={{ padding: '0 8px 8px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                    {/* 冲突期间看板 */}
                                                    {isOverloaded && (
                                                        <div>
                                                            <div style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 600, marginBottom: 6 }}>
                                                                <WarningOutlined /> 并行冲突区间 ({stats.conflicts.length} 处)
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                {stats.conflicts.map((c, idx) => (
                                                                    <div 
                                                                        key={idx}
                                                                        style={{
                                                                            padding: '8px 10px',
                                                                            borderRadius: 6,
                                                                            background: isDark ? 'rgba(255, 77, 79, 0.08)' : 'rgba(255, 77, 79, 0.03)',
                                                                            border: '1px solid rgba(255, 77, 79, 0.15)',
                                                                            fontSize: 11
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontWeight: 600 }}>
                                                                            <span style={{ color: '#ff4d4f' }}>{c.startDate} ~ {c.endDate}</span>
                                                                            <span style={{ color: subTextColor }}>工作日共 {c.workDays} 天</span>
                                                                        </div>
                                                                        <div style={{ color: subTextColor, fontSize: 10, marginBottom: 2 }}>重叠任务：</div>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                                            {c.taskIds.map(tid => {
                                                                                const task = tasks.find(t => t.id === tid);
                                                                                if (!task) return null;
                                                                                return (
                                                                                    <div 
                                                                                        key={tid}
                                                                                        onClick={() => handleFocusTask(task)}
                                                                                        style={{ 
                                                                                            display: 'flex', 
                                                                                            justifyContent: 'space-between', 
                                                                                            alignItems: 'center', 
                                                                                            color: '#1890ff', 
                                                                                            cursor: 'pointer',
                                                                                            padding: '2px 4px',
                                                                                            borderRadius: 4,
                                                                                            background: 'transparent',
                                                                                            transition: 'all 0.12s'
                                                                                        }}
                                                                                        className="focus-hover-item"
                                                                                    >
                                                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>• {task.name}</span>
                                                                                        <EyeOutlined style={{ fontSize: 10 }} />
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* 名下任务列表 */}
                                                    <div>
                                                        <div style={{ fontSize: 11, color: subTextColor, fontWeight: 600, marginBottom: 6 }}>
                                                            <CalendarOutlined /> 任务分配清单 ({stats.tasks.length})
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {stats.tasks.map(task => {
                                                                const duration = getWorkDaysSigned(task.startDate, task.endDate) + 1;
                                                                return (
                                                                    <div 
                                                                        key={task.id}
                                                                        onClick={() => handleFocusTask(task)}
                                                                        style={{
                                                                            padding: '6px 8px',
                                                                            borderRadius: 6,
                                                                            background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
                                                                            border: `1px solid ${borderColor}`,
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            cursor: 'pointer',
                                                                            fontSize: 11
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '80%' }}>
                                                                            <Text style={{ fontSize: 11, color: primaryTextColor }} ellipsis>{task.name}</Text>
                                                                            <span style={{ fontSize: 9, color: subTextColor }}>{task.startDate} ~ {task.endDate} ({duration} 工作日)</span>
                                                                        </div>
                                                                        <EyeOutlined style={{ color: '#1890ff', fontSize: 10 }} />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            </Panel>
                                        </Collapse>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 未分配任务面板 */}
                        {unassignedCount > 0 && (
                            <div>
                                <Divider style={{ margin: '16px 0 10px 0' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <QuestionCircleOutlined style={{ color: '#faad14' }} />
                                    <Text strong style={{ fontSize: 12, color: primaryTextColor }}>未分配人员的任务 ({unassignedCount})</Text>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {unassignedTasks.map(task => {
                                        const duration = getWorkDaysSigned(task.startDate, task.endDate) + 1;
                                        return (
                                            <div 
                                                key={task.id}
                                                onClick={() => handleFocusTask(task)}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: 8,
                                                    background: cardBg,
                                                    border: `1px solid ${borderColor}`,
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    cursor: 'pointer',
                                                    fontSize: 11
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: '85%' }}>
                                                    <Text style={{ fontSize: 11, color: primaryTextColor }} ellipsis>{task.name}</Text>
                                                    <span style={{ fontSize: 9, color: subTextColor }}>时间: {task.startDate} ~ {task.endDate} ({duration} 工作日)</span>
                                                </div>
                                                <Tag color="warning" style={{ fontSize: 9, margin: 0, borderRadius: 4 }}>待派发</Tag>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            
            {/* CSS hover styles for focus items */}
            <style dangerouslySetInnerHTML={{ __html: `
                .focus-hover-item:hover {
                    background: ${isDark ? 'rgba(24, 144, 255, 0.15)' : 'rgba(24, 144, 255, 0.05)'} !important;
                }
            `}} />
        </Drawer>
    );
};
