import React from 'react';
import { Modal, theme } from 'antd';

interface KeyboardShortcutPanelProps {
    visible: boolean;
    onClose: () => void;
}

interface ShortcutItem {
    keys: string[];
    label: string;
}

interface ShortcutGroup {
    title: string;
    items: ShortcutItem[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        title: '通用操作',
        items: [
            { keys: ['Ctrl', 'Z'], label: '撤销' },
            { keys: ['Ctrl', 'Shift', 'Z'], label: '重做' },
            { keys: ['Ctrl', 'A'], label: '全选' },
            { keys: ['Ctrl', 'C'], label: '复制' },
            { keys: ['Ctrl', 'V'], label: '粘贴' },
            { keys: ['Ctrl', 'X'], label: '剪切' },
            { keys: ['Esc'], label: '取消 / 退出编辑' },
        ]
    },
    {
        title: '节点操作',
        items: [
            { keys: ['Delete'], label: '删除选中' },
            { keys: ['Backspace'], label: '删除选中' },
            { keys: ['Ctrl', 'D'], label: '创建副本' },
            { keys: ['Ctrl', 'G'], label: '成组' },
            { keys: ['Ctrl', 'Shift', 'G'], label: '取消成组' },
            { keys: ['↑ ↓ ← →'], label: '移动节点 (1px)' },
            { keys: ['Shift', '↑ ↓ ← →'], label: '移动节点 (10px)' },
        ]
    },
    {
        title: '视图操作',
        items: [
            { keys: ['Ctrl', '+'], label: '放大' },
            { keys: ['Ctrl', '-'], label: '缩小' },
            { keys: ['Ctrl', '0'], label: '适应屏幕' },
            { keys: ['Ctrl', '1'], label: '实际大小' },
            { keys: ['滚轮'], label: '缩放画布' },
        ]
    },
    {
        title: '高级功能',
        items: [
            { keys: ['Ctrl', 'K'], label: '命令面板' },
            { keys: ['Alt', '拖拽'], label: '拖拽复制节点' },
            { keys: ['Shift', '点击'], label: '多选节点' },
            { keys: ['?'], label: '显示快捷键面板' },
        ]
    },
];

const KeyBadge: React.FC<{ children: string; token: any }> = ({ children, token }) => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        height: 22,
        padding: '0 6px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'SF Mono, Menlo, Consolas, monospace',
        background: token.colorBgLayout,
        border: `1px solid ${token.colorBorderSecondary}`,
        color: token.colorText,
        boxShadow: '0 1px 0 rgba(0,0,0,0.08)',
    }}>
        {children}
    </span>
);

export const KeyboardShortcutPanel: React.FC<KeyboardShortcutPanelProps> = ({ visible, onClose }) => {
    const { token } = theme.useToken();

    return (
        <Modal
            title="⌨️ 键盘快捷键"
            open={visible}
            onCancel={onClose}
            footer={null}
            width={520}
            centered
            styles={{
                body: { maxHeight: '60vh', overflowY: 'auto', padding: '12px 0' },
            }}
        >
            {SHORTCUT_GROUPS.map((group, gi) => (
                <div key={gi} style={{ marginBottom: gi < SHORTCUT_GROUPS.length - 1 ? 16 : 0 }}>
                    <div style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: token.colorTextSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '4px 24px 6px',
                    }}>
                        {group.title}
                    </div>
                    {group.items.map((item, ii) => (
                        <div key={ii} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '5px 24px',
                            borderRadius: 4,
                            transition: 'background 0.15s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.background = token.colorBgTextHover}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <span style={{ fontSize: 13, color: token.colorText }}>
                                {item.label}
                            </span>
                            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                {item.keys.map((k, ki) => (
                                    <React.Fragment key={ki}>
                                        {ki > 0 && <span style={{ color: token.colorTextQuaternary, fontSize: 10 }}>+</span>}
                                        <KeyBadge token={token}>{k}</KeyBadge>
                                    </React.Fragment>
                                ))}
                            </span>
                        </div>
                    ))}
                </div>
            ))}

            <div style={{
                textAlign: 'center',
                padding: '12px 24px 4px',
                fontSize: 11,
                color: token.colorTextQuaternary,
            }}>
                按 <KeyBadge token={token}>?</KeyBadge> 或 <KeyBadge token={token}>Esc</KeyBadge> 关闭
            </div>
        </Modal>
    );
};
