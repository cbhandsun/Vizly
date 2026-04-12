import React, { useMemo, useState } from 'react';
import { Modal, Divider, List, Tag, Space, Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface ShortcutAction {
    keys: string[];
    description: string;
    category: string;
}

interface ShortcutHelpModalProps {
    visible: boolean;
    onClose: () => void;
}

// 快捷键列表定义
const SHORTCUTS: ShortcutAction[] = [
    // 基础操作
    { keys: ['Delete'], description: '删除选中元素', category: '基础操作' },
    { keys: ['Ctrl', 'C'], description: '复制', category: '基础操作' },
    { keys: ['Ctrl', 'V'], description: '粘贴', category: '基础操作' },
    { keys: ['Ctrl', 'X'], description: '剪切', category: '基础操作' },
    { keys: ['Ctrl', 'D'], description: '复制节点', category: '基础操作' },
    { keys: ['Ctrl', 'A'], description: '全选', category: '基础操作' },
    { keys: ['Esc'], description: '取消选择', category: '基础操作' },

    // 撤销重做
    { keys: ['Ctrl', 'Z'], description: '撤销', category: '历史操作' },
    { keys: ['Ctrl', 'Y'], description: '重做', category: '历史操作' },
    { keys: ['Ctrl', 'Shift', 'Z'], description: '重做（备用）', category: '历史操作' },

    // 画布控制
    { keys: ['Space', '+', '拖拽'], description: '平移画布', category: '画布控制' },
    { keys: ['Ctrl', '+', '滚轮'], description: '缩放画布', category: '画布控制' },
    { keys: ['Ctrl', '0'], description: '重置缩放（100%）', category: '画布控制' },
    { keys: ['Shift', '1'], description: '适配所有节点', category: '画布控制' },
    { keys: ['+', '/', '='], description: '放大', category: '画布控制' },
    { keys: ['-'], description: '缩小', category: '画布控制' },

    // 图层管理
    { keys: ['Ctrl', '1'], description: '切换到图层1', category: '图层管理' },
    { keys: ['Ctrl', '2'], description: '切换到图层2', category: '图层管理' },
    { keys: ['Ctrl', '3'], description: '切换到图层3', category: '图层管理' },
    { keys: ['Ctrl', '4'], description: '切换到图层4', category: '图层管理' },
    { keys: ['Ctrl', '5'], description: '切换到图层5', category: '图层管理' },
    { keys: ['Ctrl', 'Shift', '1'], description: '切换图层1可见性', category: '图层管理' },
    { keys: ['Ctrl', 'Shift', '2'], description: '切换图层2可见性', category: '图层管理' },
    { keys: ['Ctrl', 'L'], description: '锁定/解锁选中节点', category: '图层管理' },

    // 对齐工具
    { keys: ['Ctrl', 'Shift', 'L'], description: '左对齐', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'C'], description: '水平居中对齐', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'R'], description: '右对齐', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'T'], description: '顶部对齐', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'M'], description: '垂直居中对齐', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'B'], description: '底部对齐', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'H'], description: '水平分布', category: '对齐工具' },
    { keys: ['Ctrl', 'Shift', 'V'], description: '垂直分布', category: '对齐工具' },

    // 搜索与样式
    { keys: ['Ctrl', 'F'], description: '画布节点搜索', category: '搜索与样式' },
    { keys: ['Ctrl', 'Alt', 'C'], description: '复制选中节点样式', category: '搜索与样式' },
    { keys: ['Ctrl', 'Alt', 'V'], description: '将样式粘贴到选中节点', category: '搜索与样式' },
    { keys: ['Ctrl', 'Alt', 'S'], description: '保存选中节点为模板', category: '搜索与样式' },

    // 分组
    { keys: ['Ctrl', 'G'], description: '将选中节点编组', category: '分组' },
    { keys: ['Ctrl', 'Shift', 'G'], description: '取消编组', category: '分组' },

    // 帮助
    { keys: ['?'], description: '显示此帮助面板', category: '帮助' },
    { keys: ['F1'], description: '显示此帮助面板（备用）', category: '帮助' },
];

export const ShortcutHelpModal: React.FC<ShortcutHelpModalProps> = ({ visible, onClose }) => {
    const [searchText, setSearchText] = useState('');

    // 按类别分组快捷键
    const groupedShortcuts = useMemo(() => {
        const filtered = searchText
            ? SHORTCUTS.filter(s =>
                s.description.toLowerCase().includes(searchText.toLowerCase()) ||
                s.keys.some(k => k.toLowerCase().includes(searchText.toLowerCase()))
            )
            : SHORTCUTS;

        return filtered.reduce((acc, shortcut) => {
            if (!acc[shortcut.category]) {
                acc[shortcut.category] = [];
            }
            acc[shortcut.category].push(shortcut);
            return acc;
        }, {} as Record<string, ShortcutAction[]>);
    }, [searchText]);

    return (
        <Modal
            title={
                <Space orientation="vertical" style={{ width: '100%' }} size={8}>
                    <Title level={4} style={{ margin: 0 }}>快捷键帮助</Title>
                    <Input
                        placeholder="搜索快捷键..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        allowClear
                    />
                </Space>
            }
            open={visible}
            onCancel={onClose}
            footer={null}
            width={700}
            style={{ top: 40 }}
            styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
        >
            {Object.entries(groupedShortcuts).map(([category, actions]) => (
                <div key={category} style={{ marginBottom: 16 }}>
                    <Divider style={{ margin: '12px 0' }}>
                        <Text strong>{category}</Text>
                    </Divider>
                    <List
                        size="small"
                        dataSource={actions}
                        renderItem={action => (
                            <List.Item style={{ padding: '8px 0', border: 'none' }}>
                                <List.Item.Meta
                                    avatar={
                                        <Space>
                                            {action.keys.map((key, idx) => (
                                                <React.Fragment key={idx}>
                                                    <Tag color="blue" style={{ margin: 0 }}>
                                                        {key}
                                                    </Tag>
                                                    {idx < action.keys.length - 1 && (
                                                        <span style={{ color: '#999' }}>+</span>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                        </Space>
                                    }
                                    description={action.description}
                                    style={{ alignItems: 'center' }}
                                />
                            </List.Item>
                        )}
                    />
                </div>
            ))}
            {Object.keys(groupedShortcuts).length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                    未找到匹配的快捷键
                </div>
            )}
        </Modal>
    );
};
