import React from 'react';
import { Tag, Tooltip } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';

interface VirtualizationStatsProps {
    stats: {
        totalNodes: number;
        visibleNodes: number;
        hiddenNodes: number;
        optimizationRate: number;
    };
    enabled: boolean;
}

/**
 * 虚拟化统计信息组件
 * 显示节点可见性统计和优化率
 */
export const VirtualizationStats: React.FC<VirtualizationStatsProps> = React.memo(({
    stats,
    enabled
}) => {
    if (!enabled || stats.totalNodes === 0) {
        return null;
    }

    // 根据优化率选择颜色
    const getRateColor = (rate: number): string => {
        if (rate >= 50) return 'success';  // 绿色：优化率>=50%
        if (rate >= 20) return 'processing'; // 蓝色：优化率20-50%
        return 'default';  // 灰色：优化率<20%
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px'
        }}>
            <Tooltip title="虚拟化已启用">
                <Tag icon={<EyeOutlined />} color="blue">
                    虚拟化
                </Tag>
            </Tooltip>

            <Tooltip title={`总节点数: ${stats.totalNodes}`}>
                <span style={{ color: '#666' }}>
                    总计: <strong>{stats.totalNodes}</strong>
                </span>
            </Tooltip>

            <Tooltip title={`可见节点数: ${stats.visibleNodes}`}>
                <span style={{ color: '#52c41a' }}>
                    <EyeOutlined /> <strong>{stats.visibleNodes}</strong>
                </span>
            </Tooltip>

            <Tooltip title={`隐藏节点数: ${stats.hiddenNodes}`}>
                <span style={{ color: '#999' }}>
                    <EyeInvisibleOutlined /> <strong>{stats.hiddenNodes}</strong>
                </span>
            </Tooltip>

            <Tooltip title="优化率：隐藏节点占总节点的百分比">
                <Tag color={getRateColor(stats.optimizationRate)}>
                    优化率: {stats.optimizationRate}%
                </Tag>
            </Tooltip>
        </div>
    );
});

VirtualizationStats.displayName = 'VirtualizationStats';
