import React, { useEffect, useMemo, useState } from 'react';
import { Input, Modal, Space, theme } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { FaKeyboard } from 'react-icons/fa';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';
import './KeyboardShortcutPanel.css';

interface KeyboardShortcutPanelProps {
    visible: boolean;
    onClose: () => void;
}

type ThemeToken = ReturnType<typeof theme.useToken>['token'];

interface ShortcutItem {
    keys: string[];
    label: string;
}

interface ShortcutGroup {
    title: string;
    items: ShortcutItem[];
}

const createShortcutGroups = (isMac: boolean): ShortcutGroup[] => [
    {
        title: '通用操作',
        items: [
            { keys: [isMac ? '⌘' : 'Ctrl', 'Z'], label: '撤销' },
            { keys: isMac ? ['⌘', 'Shift', 'Z'] : ['Ctrl', 'Y'], label: '重做' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'A'], label: '全选' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'C'], label: '复制' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'V'], label: '粘贴' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'X'], label: '剪切' },
            { keys: ['Esc'], label: '取消 / 退出编辑' },
        ]
    },
    {
        title: '节点操作',
        items: [
            { keys: ['Delete'], label: '删除选中' },
            { keys: ['Backspace'], label: '删除选中' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'D'], label: '创建副本' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'G'], label: '成组' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'Shift', 'G'], label: '取消成组' },
            { keys: ['↑ ↓ ← →'], label: '移动节点 (1px)' },
            { keys: ['Shift', '↑ ↓ ← →'], label: '移动节点 (10px)' },
        ]
    },
    {
        title: '视图操作',
        items: [
            { keys: [isMac ? '⌘' : 'Ctrl', '+'], label: '放大' },
            { keys: [isMac ? '⌘' : 'Ctrl', '-'], label: '缩小' },
            { keys: [isMac ? '⌘' : 'Ctrl', '0'], label: '适应屏幕' },
            { keys: [isMac ? '⌘' : 'Ctrl', '1'], label: '实际大小' },
            { keys: ['滚轮'], label: '缩放画布' },
        ]
    },
    {
        title: '高级功能',
        items: [
            { keys: ['Ctrl', 'K'], label: '命令面板' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'F'], label: '搜索画布节点' },
            { keys: [isMac ? '⌘' : 'Ctrl', 'H'], label: '查找并替换节点文本' },
            { keys: ['Alt', '拖拽'], label: '拖拽复制节点' },
            { keys: ['Shift', '点击'], label: '多选节点' },
            { keys: ['?'], label: '显示快捷键面板' },
        ]
    },
];

const KeyBadge: React.FC<{ children: string; token: ThemeToken }> = ({ children, token }) => (
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
    const [searchText, setSearchText] = useState('');
    const shortcutGroups = useMemo(() => createShortcutGroups(
        typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform),
    ), []);
    const filteredGroups = useMemo(() => {
        const normalizedSearch = searchText.trim().toLocaleLowerCase();
        if (!normalizedSearch) return shortcutGroups;

        return shortcutGroups
            .map((group) => ({
                ...group,
                items: group.items.filter((item) => (
                    item.label.toLocaleLowerCase().includes(normalizedSearch)
                    || item.keys.join('+').toLocaleLowerCase().includes(normalizedSearch)
                )),
            }))
            .filter((group) => group.items.length > 0);
    }, [searchText, shortcutGroups]);

    useEffect(() => {
        if (!visible) return;

        let canCloseFromShortcut = false;
        queueMicrotask(() => {
            canCloseFromShortcut = true;
        });

        const handleShortcutPanelToggle = (event: KeyboardEvent) => {
            const isHelpShortcut = event.key === '?' || (event.key === '/' && event.shiftKey);
            if (!canCloseFromShortcut || !isHelpShortcut) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onClose();
        };

        window.addEventListener('keydown', handleShortcutPanelToggle, { capture: true });
        return () => window.removeEventListener('keydown', handleShortcutPanelToggle, { capture: true });
    }, [onClose, visible]);

    return (
        <Modal
            title={<Space><FaKeyboard aria-hidden="true" />键盘快捷键</Space>}
            open={visible}
            onCancel={onClose}
            footer={null}
            width={520}
            centered
            afterClose={() => setSearchText('')}
            rootClassName="keyboard-shortcut-panel"
            styles={{
                body: { maxHeight: '60vh', overflowY: 'auto', padding: '12px 0' },
            }}
        >
            <Input
                aria-label="搜索快捷键或动作"
                placeholder="搜索快捷键或动作..."
                prefix={<SearchOutlined aria-hidden="true" />}
                allowClear={{
                    clearIcon: <AccessibleInputClearIcon label="清除快捷键搜索" />,
                }}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                style={{ margin: '0 24px 12px', width: 'calc(100% - 48px)' }}
            />

            {filteredGroups.map((group, gi) => (
                <div key={group.title} style={{ marginBottom: gi < filteredGroups.length - 1 ? 16 : 0 }}>
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
                    {group.items.map((item) => (
                        <div key={`${item.label}-${item.keys.join('-')}`} style={{
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

            {filteredGroups.length === 0 && (
                <div role="status" style={{ padding: '28px 24px', textAlign: 'center', color: token.colorTextSecondary }}>
                    未找到匹配的快捷键
                </div>
            )}

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
