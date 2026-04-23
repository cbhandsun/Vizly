/**
 * MindMapShortcutsModal.tsx — 键盘快捷键速查面板
 *
 * 触发方式：Toolbar "?" 按钮 / 未来可加 ? 快捷键
 */

import React from 'react';
import { Modal } from 'antd';
import { KeyOutlined } from '@ant-design/icons';

// ─── Shortcut data ────────────────────────────────────────────────────────────

const GROUPS = [
    {
        title: '节点操作',
        icon: '🌿',
        items: [
            { keys: ['Tab'],          desc: '添加子节点' },
            { keys: ['Enter'],        desc: '添加同级节点' },
            { keys: ['F2'],           desc: '编辑节点文本' },
            { keys: ['Del'],          desc: '删除选中节点' },
            { keys: ['↑ ↓ ← →'],     desc: '导航节点' },
            { keys: ['Ctrl', 'C'],   desc: '复制节点' },
            { keys: ['Ctrl', 'V'],   desc: '粘贴节点' },
        ],
    },
    {
        title: '视图 / 画布',
        icon: '🔭',
        items: [
            { keys: ['Ctrl', '+'],    desc: '放大' },
            { keys: ['Ctrl', '-'],    desc: '缩小' },
            { keys: ['/'],            desc: '居中视图' },
            { keys: ['Ctrl', 'F'],   desc: '搜索节点' },
        ],
    },
    {
        title: '历史',
        icon: '🕹️',
        items: [
            { keys: ['Ctrl', 'Z'],   desc: '撤销' },
            { keys: ['Ctrl', 'Y'],   desc: '重做' },
            { keys: ['Ctrl', 'Shift', 'Z'], desc: '重做（备选）' },
        ],
    },
    {
        title: '演示模式',
        icon: '🎬',
        items: [
            { keys: ['→', 'Space'],   desc: '下一节点' },
            { keys: ['←'],            desc: '上一节点' },
            { keys: ['Esc'],          desc: '退出演示' },
        ],
    },
    {
        title: '超级功能',
        icon: '⚡',
        items: [
            { keys: ['Ctrl', 'F'],   desc: '全局搜索节点' },
            { keys: ['Ctrl', 'Click'], desc: '打开节点超链接' },
            { keys: ['拖拽文件'],       desc: '导入 .md / .opml 文件' },
        ],
    },
];

// ─── Key Badge ───────────────────────────────────────────────────────────────

const KeyBadge: React.FC<{ label: string }> = ({ label }) => (
    <kbd style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 7px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderBottomWidth: 2,
        fontSize: 11,
        fontFamily: 'monospace',
        fontWeight: 600,
        color: 'rgba(255,255,255,0.85)',
        whiteSpace: 'nowrap',
        lineHeight: '18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
    }}>
        {label}
    </kbd>
);

// ─── Component ────────────────────────────────────────────────────────────────

interface MindMapShortcutsModalProps {
    open: boolean;
    onClose: () => void;
}

const MindMapShortcutsModal: React.FC<MindMapShortcutsModalProps> = ({ open, onClose }) => {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            width={720}
            centered
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <KeyOutlined style={{ color: '#6366f1' }} />
                    <span style={{ fontWeight: 700 }}>键盘快捷键</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
                        MindMap 快速参考
                    </span>
                </div>
            }
            styles={{
                content: {
                    background: 'rgba(15,15,22,0.95)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 20,
                },
                header: {
                    background: 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    paddingBottom: 12,
                },
                body: { paddingTop: 16 },
                mask: { backdropFilter: 'blur(4px)' },
            }}
        >
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
            }}>
                {GROUPS.map(group => (
                    <div key={group.title} style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12,
                        padding: '12px 14px',
                    }}>
                        <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'rgba(255,255,255,0.5)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}>
                            <span>{group.icon}</span>
                            <span>{group.title}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {group.items.map((item, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                }}>
                                    <span style={{
                                        fontSize: 12,
                                        color: 'rgba(255,255,255,0.65)',
                                        flex: 1,
                                    }}>
                                        {item.desc}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                        {item.keys.map((k, j) => (
                                            <React.Fragment key={j}>
                                                {j > 0 && (
                                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', margin: '0 1px' }}>
                                                        {k === '→' || k === '←' || k === 'Space' ? '+' : '+'}
                                                    </span>
                                                )}
                                                <KeyBadge label={k} />
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div style={{
                marginTop: 16,
                padding: '10px 14px',
                background: 'rgba(99,102,241,0.05)',
                border: '1px solid rgba(99,102,241,0.12)',
                borderRadius: 10,
                fontSize: 11,
                color: 'rgba(255,255,255,0.35)',
                textAlign: 'center',
            }}>
                💡 更多快捷键请参考 mind-elixir 文档 ·
                Ctrl+Click 节点可直接打开超链接 ·
                拖入 .md/.opml 文件快速导入
            </div>
        </Modal>
    );
};

export default MindMapShortcutsModal;
