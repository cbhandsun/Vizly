import React from 'react';
import {
    AlignCenterOutlined,
    AlignLeftOutlined,
    AlignRightOutlined,
    ApartmentOutlined,
    ColumnHeightOutlined,
    ColumnWidthOutlined,
    FullscreenOutlined,
    VerticalAlignBottomOutlined,
    VerticalAlignMiddleOutlined,
    VerticalAlignTopOutlined,
} from '@ant-design/icons';
import { Button, Divider, Tooltip } from 'antd';
import { FaCloud, FaShapes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

import { FlowchartShapesPanel } from '../components/diagrams/FlowchartShapesPanel';
import { IconExplorer } from '../components/diagrams/IconExplorer';
import { BaseDiagramPlugin } from '../sdk/BasePlugin';
import type { DiagramTypePlugin, PluginContext, SidebarPanel } from '../types/plugin';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const optionalString = (value: unknown): string | undefined => (
    typeof value === 'string' ? value : undefined
);

export class FlowchartPlugin extends BaseDiagramPlugin implements DiagramTypePlugin {
    id = 'flowchart';
    name = '通用画布';
    version = '1.1.0';
    description = 'Vizly 的核心画布引擎，支持自由布局、智能连线与全量基础形状。适用于大多数通用绘图场景。';
    author = 'Vizly Core';
    category = 'Core' as const;
    tags = ['General', 'Flowchart', 'Base'];
    brandColor = '#1890ff';

    async migrate<T>(data: T, fromVersion: string | undefined): Promise<T> {
        const migratedData = await super.migrate(data, fromVersion);

        if ((!fromVersion || fromVersion === '1.0') && isRecord(migratedData) && Array.isArray(migratedData.nodes)) {
            return {
                ...migratedData,
                nodes: migratedData.nodes.map((node) => {
                    if (!isRecord(node)) return node;
                    const metadata = isRecord(node.metadata) ? node.metadata : {};
                    return {
                        ...node,
                        metadata: {
                            ...metadata,
                            shape: optionalString(metadata.shape) || 'rectangle',
                        },
                    };
                }),
            } as T;
        }

        return migratedData;
    }

    contributeToolbar(ctx: PluginContext) {
        return <FlowchartToolbar ctx={ctx} />;
    }

    contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
        return [
            {
                id: 'shapes',
                title: '基础形状',
                icon: <FaShapes />,
                content: <FlowchartShapesPanel ctx={ctx} />,
            },
            {
                id: 'icons',
                title: '云端图标库',
                icon: <FaCloud />,
                content: <IconExplorer ctx={ctx} />,
            },
        ];
    }

    createNodeData(type: string): Record<string, unknown> {
        const categoryColors: Record<string, { main: string; border: string; text: string }> = {
            default: { main: '#4A90D9', border: '#3A78C2', text: '#fff' },
            decision: { main: '#F0B429', border: '#D9A21E', text: '#333' },
            process: { main: '#47B881', border: '#3AA06F', text: '#fff' },
            data: { main: '#7B61FF', border: '#6A4FE0', text: '#fff' },
            terminal: { main: '#E85D75', border: '#D14D65', text: '#fff' },
            group: { main: '#8492A6', border: '#707F94', text: '#fff' },
        };
        return {
            label: '新建节点',
            theme: categoryColors[type] || categoryColors.default,
        };
    }
}

const FlowchartToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { t } = useTranslation();
    if (!ctx) return null;

    const handleAlign = (direction: string) => {
        window.dispatchEvent(new CustomEvent('diagram:align', { detail: { direction } }));
    };
    const handleDistribute = (axis: 'horizontal' | 'vertical') => {
        window.dispatchEvent(new CustomEvent('diagram:distribute', { detail: { axis } }));
    };
    const handleFitView = () => {
        ctx.reactFlowInstance?.fitView({ duration: 600, padding: 0.25, minZoom: 0.55 });
    };
    const handleAutoLayout = () => {
        window.dispatchEvent(new CustomEvent('diagram:requestLayout', {
            detail: { strategy: 'DomainDagreLayout' },
        }));
    };
    const iconBtnStyle: React.CSSProperties = { fontSize: 13 };
    const actionButton = (
        label: string,
        icon: React.ReactNode,
        onClick: () => void,
    ) => (
        <Tooltip title={label}>
            <Button
                size="small"
                type="text"
                aria-label={label}
                icon={icon}
                onClick={onClick}
            />
        </Tooltip>
    );

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            {actionButton(t('designer.toolbar.alignL'), <AlignLeftOutlined style={iconBtnStyle} />, () => handleAlign('left'))}
            {actionButton(t('designer.toolbar.alignC'), <AlignCenterOutlined style={iconBtnStyle} />, () => handleAlign('center-h'))}
            {actionButton(t('designer.toolbar.alignR'), <AlignRightOutlined style={iconBtnStyle} />, () => handleAlign('right'))}
            {actionButton(t('designer.toolbar.alignT'), <VerticalAlignTopOutlined style={iconBtnStyle} />, () => handleAlign('top'))}
            {actionButton(t('designer.toolbar.alignM'), <VerticalAlignMiddleOutlined style={iconBtnStyle} />, () => handleAlign('center-v'))}
            {actionButton(t('designer.toolbar.alignB'), <VerticalAlignBottomOutlined style={iconBtnStyle} />, () => handleAlign('bottom'))}

            <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />
            {actionButton(t('designer.toolbar.distributeH'), <ColumnWidthOutlined style={iconBtnStyle} />, () => handleDistribute('horizontal'))}
            {actionButton(t('designer.toolbar.distributeV'), <ColumnHeightOutlined style={iconBtnStyle} />, () => handleDistribute('vertical'))}

            <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />
            {actionButton(t('designer.toolbar.autoLayout'), <ApartmentOutlined style={iconBtnStyle} />, handleAutoLayout)}
            {actionButton(t('designer.toolbar.fitView'), <FullscreenOutlined style={iconBtnStyle} />, handleFitView)}
        </div>
    );
};
