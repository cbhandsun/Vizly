import React from 'react';
import type { MenuProps } from 'antd';
import { BoldOutlined, FontSizeOutlined, BgColorsOutlined, UndoOutlined } from '@ant-design/icons';

interface EdgeLabelStyleMenuProps {
    edgeId: string;
    currentStyle?: {
        fontWeight?: string;
        color?: string;
        fontSize?: number;
    };
    onStyleChange: (edgeId: string, style: EdgeLabelStyle) => void;
    onResetPosition: () => void;
}

export type EdgeLabelStyle = NonNullable<EdgeLabelStyleMenuProps['currentStyle']>;

export const getEdgeLabelStyleMenuItems = (props: EdgeLabelStyleMenuProps): MenuProps['items'] => {
    const { edgeId, currentStyle = {}, onStyleChange, onResetPosition } = props;

    return [
        {
            key: 'bold',
            icon: <BoldOutlined />,
            label: currentStyle.fontWeight === 'bold' ? '取消粗体' : '粗体',
            onClick: () => {
                onStyleChange(edgeId, {
                    ...currentStyle,
                    fontWeight: currentStyle.fontWeight === 'bold' ? 'normal' : 'bold'
                });
            }
        },
        { type: 'divider' },
        {
            key: 'color',
            icon: <BgColorsOutlined />,
            label: '颜色',
            children: [
                {
                    key: 'black',
                    label: '黑色',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, color: '#000' })
                },
                {
                    key: 'red',
                    label: '红色',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, color: '#ff4d4f' })
                },
                {
                    key: 'blue',
                    label: '蓝色',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, color: '#1890ff' })
                },
                {
                    key: 'green',
                    label: '绿色',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, color: '#52c41a' })
                },
                {
                    key: 'orange',
                    label: '橙色',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, color: '#fa8c16' })
                },
                {
                    key: 'purple',
                    label: '紫色',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, color: '#722ed1' })
                },
            ]
        },
        {
            key: 'fontSize',
            icon: <FontSizeOutlined />,
            label: '字号',
            children: [
                {
                    key: '12',
                    label: currentStyle.fontSize === 12 ? '✓ 12px' : '12px',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, fontSize: 12 })
                },
                {
                    key: '14',
                    label: currentStyle.fontSize === 14 ? '✓ 14px' : '14px',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, fontSize: 14 })
                },
                {
                    key: '16',
                    label: currentStyle.fontSize === 16 ? '✓ 16px' : '16px',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, fontSize: 16 })
                },
                {
                    key: '18',
                    label: currentStyle.fontSize === 18 ? '✓ 18px' : '18px',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, fontSize: 18 })
                },
                {
                    key: '20',
                    label: currentStyle.fontSize === 20 ? '✓ 20px' : '20px',
                    onClick: () => onStyleChange(edgeId, { ...currentStyle, fontSize: 20 })
                },
            ]
        },
        { type: 'divider' },
        {
            key: 'reset',
            icon: <UndoOutlined />,
            label: '重置位置',
            onClick: onResetPosition
        }
    ];
};
