import React from 'react';
import { Node } from '@xyflow/react';
import {
    Input,
    ColorPicker,
    Space,
    Radio,
    Button
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined
} from '@ant-design/icons';
import { NodeDataUpdate } from '../../types/diagram-updates';

interface ArrowTimelineEventsEditorProps {
    selectedNodes: Node[];
    updateNodes: (partialData: NodeDataUpdate) => void;
    armSnapshot: () => void;
    disabled?: boolean;
}

const DEFAULT_ARROW_EVENTS = [
    { date: '2024.02.19', color: '#52c41a' },
    { date: '2024.04.07', color: '#a0d911' },
    { date: '2025.05.07', color: '#fadb14' },
    { date: '2025.05.22', color: '#fa8c16' },
    { date: '2025.06.05', color: '#f5222d' },
    { date: '2025.06.11', color: '#eb2f96' },
    { date: '2025.07.02', color: '#722ed1' },
    { date: '2025.07.10', label: '河南和山西生鲜中心', color: '#5936d5' },
    { date: '2025.07.17', color: '#1890ff' },
    { date: '2025.07.24', label: '黑龙江生鲜物流中心', color: '#13c2c2' }
];

export const ArrowTimelineEventsEditor: React.FC<ArrowTimelineEventsEditorProps> = ({
    selectedNodes,
    updateNodes,
    armSnapshot,
    disabled
}) => {
    if (selectedNodes.length === 0) return null;
    const node = selectedNodes[0];
    const events = (node.data as any).events && (node.data as any).events.length > 0
        ? (node.data as any).events
        : DEFAULT_ARROW_EVENTS;

    const onChangeEvent = (index: number, field: string, value: any) => {
        armSnapshot();
        const newEvents = [...events];
        newEvents[index] = { ...newEvents[index], [field]: value };
        updateNodes({ events: newEvents });
    };

    const onMoveEvent = (index: number, direction: number) => {
        armSnapshot();
        const newEvents = [...events];
        const temp = newEvents[index];
        newEvents[index] = newEvents[index + direction];
        newEvents[index + direction] = temp;
        updateNodes({ events: newEvents });
    };

    const onAddEvent = () => {
        armSnapshot();
        const lastEvent = events[events.length - 1];
        const newEvent = lastEvent
            ? { date: lastEvent.date + ' (新)', color: lastEvent.color, label: '' }
            : { date: 'New Date', color: '#1890ff', label: '' };
        const newEvents = [...events, newEvent];
        updateNodes({ events: newEvents });
    };

    const onRemoveEvent = (index: number) => {
        armSnapshot();
        const newEvents = events.filter((_: any, i: number) => i !== index);
        updateNodes({ events: newEvents });
    };

    const variant = (node.data as any).variant || 'arrow';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
            <Radio.Group
                value={variant}
                onChange={e => { armSnapshot(); updateNodes({ variant: e.target.value }); }}
                disabled={disabled}
                size="small"
                optionType="button"
                buttonStyle="solid"
                style={{ marginBottom: 4, display: 'flex' }}
            >
                <Radio.Button value="arrow" style={{ flex: 1, textAlign: 'center' }}>箭头序列</Radio.Button>
                <Radio.Button value="dot" style={{ flex: 1, textAlign: 'center' }}>极简原点</Radio.Button>
            </Radio.Group>
            {events.map((evt: any, i: number) => (
                <div key={i} style={{ border: '1px solid #f0f0f0', padding: 8, borderRadius: 6, position: 'relative' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                        <ColorPicker size="small" value={evt.color} onChange={(c) => onChangeEvent(i, 'color', c.toHexString())} disabled={disabled} />
                        <Input size="small" placeholder="日期/排期" value={evt.date} onChange={(e) => onChangeEvent(i, 'date', e.target.value)} disabled={disabled} style={{ flex: 1 }} />
                        <Space size={2}>
                            <Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={() => onMoveEvent(i, -1)} disabled={disabled || i === 0} style={{ padding: 4 }} />
                            <Button size="small" type="text" icon={<ArrowDownOutlined />} onClick={() => onMoveEvent(i, 1)} disabled={disabled || i === events.length - 1} style={{ padding: 4 }} />
                            <Button size="small" danger type="text" icon={<DeleteOutlined />} onClick={() => onRemoveEvent(i)} disabled={disabled} style={{ padding: 4 }} />
                        </Space>
                    </div>
                    <Input size="small" placeholder="事件说明 (可选)" value={evt.label || ''} onChange={(e) => onChangeEvent(i, 'label', e.target.value)} disabled={disabled} />
                </div>
            ))}
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onAddEvent} disabled={disabled} block>
                添加节点
            </Button>
        </div>
    );
};
