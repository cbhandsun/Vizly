/**
 * MindMapTemplates.tsx — 节点模板系统
 *
 * 在当前选中节点下插入预设子树结构
 * 模板库：SWOT分析、会议记录、项目计划、读书笔记、问题分析
 */
import React, { useCallback, useState } from 'react';
import { Dropdown } from 'antd';
import {
    AppstoreAddOutlined,
    BulbOutlined,
    FileTextOutlined,
    ReadOutlined,
    RocketOutlined,
    SearchOutlined,
    SlidersOutlined,
} from '@ant-design/icons';
import MindElixir from 'mind-elixir';
import { getMindElixirInstance } from './mindElixirStore';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { templateToNodeObj, type TemplateNode } from './mindmapTemplateModel';
import { logMindmapTemplateInsertFailure } from './mindmapPanelLogging';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import { getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import type { MindElixirInstance, NodeObj } from 'mind-elixir';


// ─── Template definitions ─────────────────────────────────────────────────────

interface Template {
    key: string;
    icon: React.ReactNode;
    label: string;
    desc: string;
    mode: 'replace' | 'insert';  // replace = new map, insert = add under selection
    tree: TemplateNode;
}
type RootNodeObj = NodeObj & { root?: boolean };
type MindWithHistory = MindElixirInstance & { clearHistory?: () => void };

const TEMPLATES: Template[] = [
    {
        key: 'swot',
        icon: <SlidersOutlined />,
        label: 'SWOT 分析',
        desc: '优势/劣势/机会/威胁 四象限分析',
        mode: 'replace',
        tree: {
            topic: 'SWOT 分析',
            children: [
                { topic: '💪 优势 Strengths', children: [{ topic: '优势点 1' }, { topic: '优势点 2' }] },
                { topic: '⚠️ 劣势 Weaknesses', children: [{ topic: '劣势点 1' }, { topic: '劣势点 2' }] },
                { topic: '🌟 机会 Opportunities', children: [{ topic: '机会点 1' }, { topic: '机会点 2' }] },
                { topic: '🚧 威胁 Threats', children: [{ topic: '威胁点 1' }, { topic: '威胁点 2' }] },
            ],
        },
    },
    {
        key: 'meeting',
        icon: <FileTextOutlined />,
        label: '会议记录',
        desc: '议题/决策/行动项/跟进',
        mode: 'replace',
        tree: {
            topic: '会议记录',
            children: [
                { topic: '📅 基本信息', children: [{ topic: '日期' }, { topic: '参会人员' }, { topic: '主持人' }] },
                { topic: '📌 议题', children: [{ topic: '议题 1' }, { topic: '议题 2' }] },
                { topic: '✅ 决策', children: [{ topic: '决策 1' }, { topic: '决策 2' }] },
                { topic: '🎯 行动项', children: [{ topic: '负责人 → 任务 → 截止日' }] },
                { topic: '🔄 跟进事项', children: [{ topic: '下次会议议题' }] },
            ],
        },
    },
    {
        key: 'project',
        icon: <RocketOutlined />,
        label: '项目计划',
        desc: '目标/里程碑/风险/资源',
        mode: 'replace',
        tree: {
            topic: '项目计划',
            children: [
                { topic: '🎯 项目目标', children: [{ topic: '核心目标' }, { topic: '成功指标 KPI' }] },
                { topic: '📅 里程碑', children: [
                    { topic: 'Phase 1 — 需求分析' },
                    { topic: 'Phase 2 — 设计开发' },
                    { topic: 'Phase 3 — 测试上线' },
                ] },
                { topic: '⚠️ 风险评估', children: [{ topic: '风险 1（高）' }, { topic: '风险 2（中）' }] },
                { topic: '👥 资源分配', children: [{ topic: '人力' }, { topic: '预算' }, { topic: '工具' }] },
                { topic: '📊 进度追踪', children: [{ topic: '本周完成' }, { topic: '下周计划' }] },
            ],
        },
    },
    {
        key: 'reading',
        icon: <ReadOutlined />,
        label: '读书笔记',
        desc: '主题/要点/感悟/应用',
        mode: 'replace',
        tree: {
            topic: '读书笔记',
            children: [
                { topic: '📖 书名/作者', children: [{ topic: '书名' }, { topic: '作者' }, { topic: '评分 ★★★★☆' }] },
                { topic: '🔑 核心观点', children: [{ topic: '观点 1' }, { topic: '观点 2' }, { topic: '观点 3' }] },
                { topic: '💡 精彩摘录', children: [{ topic: '摘录 1' }, { topic: '摘录 2' }] },
                { topic: '🤔 个人感悟', children: [{ topic: '感悟与思考' }] },
                { topic: '⚡ 行动应用', children: [{ topic: '如何付诸实践' }] },
            ],
        },
    },
    {
        key: 'problem',
        icon: <SearchOutlined />,
        label: '问题分析',
        desc: '5W1H 问题根因分析',
        mode: 'replace',
        tree: {
            topic: '问题分析',
            children: [
                { topic: '❓ What 问题是什么', children: [{ topic: '问题现象描述' }] },
                { topic: '🤔 Why 为什么发生', children: [{ topic: '根因 1' }, { topic: '根因 2' }, { topic: '根因 3' }] },
                { topic: '📍 Where 在哪里', children: [{ topic: '影响范围' }] },
                { topic: '⏰ When 何时发生', children: [{ topic: '时间线' }] },
                { topic: '👤 Who 谁受影响', children: [{ topic: '相关人员' }] },
                { topic: '🛠️ How 如何解决', children: [{ topic: '方案 1' }, { topic: '方案 2' }] },
            ],
        },
    },
    {
        key: 'brainstorm',
        icon: <BulbOutlined />,
        label: '头脑风暴',
        desc: '在当前选中节点下插入发散结构',
        mode: 'insert',
        tree: {
            topic: '(插入在选中节点下)',
            children: [
                { topic: '想法 A', children: [{ topic: '细化 A1' }, { topic: '细化 A2' }] },
                { topic: '想法 B', children: [{ topic: '细化 B1' }, { topic: '细化 B2' }] },
                { topic: '想法 C', children: [{ topic: '细化 C1' }] },
                { topic: '想法 D' },
            ],
        },
    },
];

// ─── Component ────────────────────────────────────────────────────────────────

const MindMapTemplates: React.FC = () => {
    const mind = getMindElixirInstance();
    const [open, setOpen] = useState(false);

    const applyTemplate = useCallback((tpl: Template) => {
        if (!mind) { appMessage.warning('思维导图未加载'); return; }

        if (tpl.mode === 'replace') {
            // Replace entire map with template structure
            const nodeData = templateToNodeObj(tpl.tree);
            nodeData.id = 'root';
            (nodeData as RootNodeObj).root = true;
            mind.refresh({ nodeData, direction: MindElixir.SIDE as 0 | 1 | 2 });
            mind.toCenter();
            (mind as MindWithHistory).clearHistory?.();
            appMessage.success(`已载入模板：${tpl.label}`);
        } else {
            // Insert template subtree under currently selected node
            const selId = mind.currentNode?.id ?? mind.currentNodes?.[0]?.id;
            if (!selId) { appMessage.info('请先选中一个节点再插入模板'); return; }
            try {
                const parentTpc = mind.findEle(selId);
                const children = tpl.tree.children ?? [];
                for (const child of children) {
                    const nodeData = templateToNodeObj(child);
                    mind.addChild(parentTpc, nodeData);
                }
                appMessage.success(`已插入 ${children.length} 个子节点`);
            } catch (e) {
                appMessage.error('插入失败');
                logMindmapTemplateInsertFailure(e);
            }
        }
    }, [mind]);

    const menuItems = TEMPLATES.map(tpl => ({
        key: tpl.key,
        label: (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 0' }}>
                <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1.2, flexShrink: 0 }}>{tpl.icon}</span>
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{tpl.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{tpl.desc}</div>
                </div>
                {tpl.mode === 'insert' && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6366f1',
                        background: 'rgba(99,102,241,0.1)', padding: '1px 5px',
                        borderRadius: 4, flexShrink: 0, alignSelf: 'center' }}>插入</span>
                )}
            </div>
        ),
        onClick: () => applyTemplate(tpl),
    }));

    return (
        <Dropdown
            open={open}
            onOpenChange={setOpen}
            menu={{ items: menuItems, 'aria-label': '思维导图节点模板' }}
            placement="bottomRight"
            getPopupContainer={getViewportPopupContainer}
            trigger={['click']}
        >
            <MindMapToolbarIconButton
                aria-expanded={open}
                aria-haspopup="menu"
                label="打开节点模板"
                icon={<AppstoreAddOutlined />}
                disabled={!mind}
                suppressTooltip={open}
                style={{ color: 'rgba(255,255,255,0.55)' }}
            />
        </Dropdown>
    );
};

export default MindMapTemplates;
