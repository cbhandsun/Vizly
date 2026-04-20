import React from 'react';
import { Card, Table, Tag, Typography, Space, Divider } from 'antd';
import { 
    ControlOutlined, 
    RocketOutlined, 
    LayoutOutlined, 
    PlusSquareOutlined,
    ExportOutlined,
    QuestionCircleOutlined,
    GlobalOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const { Text, Title, Paragraph } = Typography;

const ShortcutsGuide: React.FC = () => {
    const { t } = useTranslation();
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
    const mod = isMac ? '⌘' : 'Ctrl';

    const columns = [
        {
            title: '操作 / Action',
            dataIndex: 'action',
            key: 'action',
            render: (text: string) => <Text strong>{text}</Text>,
        },
        {
            title: '快捷键 / Shortcut',
            dataIndex: 'shortcut',
            key: 'shortcut',
            render: (keys: string[]) => (
                <Space size={4}>
                    {keys.map(key => (
                        <Tag key={key} color="blue" style={{ borderRadius: '4px', margin: 0 }}>
                            {key.replace('Mod', mod)}
                        </Tag>
                    ))}
                </Space>
            ),
        },
    ];

    const data = [
        {
            key: '1',
            action: '打开 AI 助手',
            shortcut: ['Mod', 'J'],
            icon: <RocketOutlined />,
        },
        {
            key: '2',
            action: '打开命令面板',
            shortcut: ['Mod', 'K'],
            icon: <ControlOutlined />,
        },
        {
            key: '3',
            action: '折叠/展开 AI 面板',
            shortcut: ['Alt', '/'],
            icon: <ControlOutlined />,
        },
        {
            key: '4',
            action: '智能布局',
            shortcut: ['Mod', 'Shift', 'L'],
            icon: <LayoutOutlined />,
        },
        {
            key: '5',
            action: '快速添加节点',
            shortcut: ['Alt', 'N'],
            icon: <PlusSquareOutlined />,
        },
        {
            key: '6',
            action: '快速导出图片',
            shortcut: ['Mod', 'Shift', 'E'],
            icon: <ExportOutlined />,
        },
        {
            key: '7',
            action: '切换主题',
            shortcut: ['Mod', 'Shift', 'T'],
            icon: <GlobalOutlined />,
        },
        {
            key: '8',
            action: '打开全局设置',
            shortcut: ['Mod', ','],
            icon: <ControlOutlined />,
        },
    ];

    return (
        <Card 
            className="shortcuts-guide-card"
            style={{ 
                background: 'rgba(255, 255, 255, 0.7)', 
                backdropFilter: 'blur(10px)',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.06)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                margin: '8px 0',
                overflow: 'hidden'
            }}
            styles={{ body: { padding: '16px' } }}
        >
            <Title level={5} style={{ marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QuestionCircleOutlined /> 
                Vizly 快捷键指南
            </Title>
            <Paragraph type="secondary" style={{ fontSize: '12px', marginBottom: 16 }}>
                使用快捷键可以成倍提升您的绘图效率。
            </Paragraph>
            
            <Table 
                columns={columns} 
                dataSource={data} 
                pagination={false} 
                size="small"
                bordered={false}
                style={{ background: 'transparent' }}
                rowClassName={() => 'shortcut-row'}
            />
            
            <Divider style={{ margin: '12px 0' }} />
            
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Text style={{ fontSize: '11px' }} type="secondary">
                    💡 提示：在画布中，您也可以直接通过鼠标右键唤起上下文菜单。
                </Text>
            </Space>
        </Card>
    );
};

export default ShortcutsGuide;
