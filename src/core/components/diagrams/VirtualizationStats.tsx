import React from 'react';
import { Tag, Tooltip } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation();

    if (!enabled || stats.totalNodes === 0) {
        return null;
    }

    // 根据优化率选择颜色
    const getRateColor = (rate: number): string => {
        if (rate >= 50) return 'success';   // 绿色：优化率>=50%
        if (rate >= 20) return 'processing'; // 蓝色：优化率20-50%
        return 'default';                    // 灰色：优化率<20%
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px'
        }}>
            <Tooltip title={t('designer.virtualization.enabled')}>
                <Tag icon={<EyeOutlined />} color="blue">
                    {t('designer.virtualization.tag')}
                </Tag>
            </Tooltip>

            <Tooltip title={t('designer.virtualization.total', { count: stats.totalNodes })}>
                <span style={{ color: '#666' }}>
                    {t('designer.virtualization.totalLabel')}: <strong>{stats.totalNodes}</strong>
                </span>
            </Tooltip>

            <Tooltip title={t('designer.virtualization.visible', { count: stats.visibleNodes })}>
                <span style={{ color: '#52c41a' }}>
                    <EyeOutlined /> <strong>{stats.visibleNodes}</strong>
                </span>
            </Tooltip>

            <Tooltip title={t('designer.virtualization.hidden', { count: stats.hiddenNodes })}>
                <span style={{ color: '#999' }}>
                    <EyeInvisibleOutlined /> <strong>{stats.hiddenNodes}</strong>
                </span>
            </Tooltip>

            <Tooltip title={t('designer.virtualization.optimizationRateTooltip')}>
                <Tag color={getRateColor(stats.optimizationRate)}>
                    {t('designer.virtualization.optimizationRate', { rate: stats.optimizationRate })}
                </Tag>
            </Tooltip>
        </div>
    );
});

VirtualizationStats.displayName = 'VirtualizationStats';
