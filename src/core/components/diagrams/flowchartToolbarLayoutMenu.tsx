import React from 'react';
import type { MenuProps } from 'antd';
import { FaObjectGroup, FaRegObjectGroup, FaSitemap } from 'react-icons/fa';

type ToolbarMenuItem = Extract<
    NonNullable<NonNullable<MenuProps['items']>[number]>,
    { type?: 'item' }
>;

type LayoutRadioMenuItem = ToolbarMenuItem & React.AriaAttributes & {
    role: 'menuitemradio';
};

type TranslateLayoutLabel = (key: string, fallback: string) => string;

interface BuildFlowchartLayoutMenuModelOptions {
    lastDomainDirection?: 'TB' | 'LR';
    lastDomainStrategy?: string;
    lastNodeLayout?: string;
    onStrategyLayout?: (strategyName: string, nodeLayout?: string, direction?: 'TB' | 'LR') => void;
    translate: TranslateLayoutLabel;
}

export interface FlowchartLayoutMenuModel {
    items: NonNullable<MenuProps['items']>;
    selectedKeys: string[];
    statusText?: string;
}

const radioMenuItem = (item: LayoutRadioMenuItem): LayoutRadioMenuItem => item;

const stripDecorativePrefix = (label: string): string => (
    label.replace(/^[^\p{L}\p{N}]+/u, '').trim()
);

export const resolveActiveDomainLayoutKey = (
    lastDomainStrategy?: string,
    lastDomainDirection?: 'TB' | 'LR',
): string | undefined => {
    if (!lastDomainStrategy) return undefined;
    if (lastDomainStrategy === 'force') return 'force';
    if (lastDomainStrategy === 'domain-vertical') return 'domain-vertical';
    if (lastDomainStrategy === 'domain-horizontal') return 'domain-horizontal';
    if (lastDomainDirection) {
        return `${lastDomainStrategy}-${lastDomainDirection.toLowerCase()}`;
    }
    return lastDomainStrategy;
};

export const buildFlowchartLayoutMenuModel = ({
    lastDomainDirection,
    lastDomainStrategy,
    lastNodeLayout,
    onStrategyLayout,
    translate,
}: BuildFlowchartLayoutMenuModelOptions): FlowchartLayoutMenuModel => {
    const activeDomainKey = resolveActiveDomainLayoutKey(lastDomainStrategy, lastDomainDirection);
    const activeNodeKey = lastNodeLayout ? `node-${lastNodeLayout}` : undefined;

    const labels = {
        treeGroup: translate('designer.flowchart.layout.treeGroup', '树形布局'),
        treeTb: translate('designer.flowchart.layout.treeTB', '↕ 树形 (上→下)'),
        treeLr: translate('designer.flowchart.layout.treeLR', '↔ 树形 (左→右)'),
        forceGroup: translate('designer.flowchart.layout.forceGroup', '力导向'),
        force: translate('designer.flowchart.layout.force', '⊙ 力导向'),
        domainGroup: translate('designer.flowchart.layout.domainGroup', '域感知布局'),
        domainDagreLr: translate('designer.flowchart.layout.domainDagreLR', '◈ DomainDagre (左→右)'),
        domainDagreTb: translate('designer.flowchart.layout.domainDagreTB', '◈ DomainDagre (上→下) (默认)'),
        domainDagreSubHorizontalTb: translate(
            'designer.flowchart.layout.domainDagreSubHorizontalTB',
            '◈ DomainDagre (子域水平)',
        ),
        domainVertical: translate('designer.flowchart.layout.domainVertical', '▥ DomainVertical (上→下)'),
        domainHorizontal: translate('designer.flowchart.layout.domainHorizontal', '▦ DomainHorizontal (左→右)'),
        nodeGroup: translate('designer.flowchart.layout.nodeLayoutGroup', '域内节点排布'),
        nodeFlow: translate('designer.flowchart.layout.nodeFlow', '▷ 流式'),
        nodeGrid: translate('designer.flowchart.layout.nodeGrid', '⊞ 网格'),
        nodeHorizontal: translate('designer.flowchart.layout.nodeHorizontal', '⊟ 水平'),
        nodeVertical: translate('designer.flowchart.layout.nodeVertical', '⊞ 垂直'),
        nodeDagre: translate('designer.flowchart.layout.nodeDagre', '◈ Dagre分层 (默认)'),
    };

    const domainItem = (
        key: string,
        label: string,
        onClick: () => void,
        icon?: React.ReactNode,
    ): LayoutRadioMenuItem => radioMenuItem({
        key,
        label,
        icon,
        onClick,
        role: 'menuitemradio',
        'aria-checked': activeDomainKey === key,
    });

    const nodeItem = (
        key: string,
        label: string,
        nodeLayout: string,
    ): LayoutRadioMenuItem => radioMenuItem({
        key,
        label,
        onClick: () => onStrategyLayout?.(
            lastDomainStrategy || 'domain-dagre',
            nodeLayout,
            lastDomainDirection || 'TB',
        ),
        role: 'menuitemradio',
        'aria-checked': activeNodeKey === key,
    });

    const labelByKey: Record<string, string> = {
        'tree-tb': labels.treeTb,
        'tree-lr': labels.treeLr,
        force: labels.force,
        'domain-dagre-lr': labels.domainDagreLr,
        'domain-dagre-tb': labels.domainDagreTb,
        'domain-dagre-sub-horizontal-tb': labels.domainDagreSubHorizontalTb,
        'domain-vertical': labels.domainVertical,
        'domain-horizontal': labels.domainHorizontal,
        'node-flow': labels.nodeFlow,
        'node-grid': labels.nodeGrid,
        'node-horizontal': labels.nodeHorizontal,
        'node-vertical': labels.nodeVertical,
        'node-dagre': labels.nodeDagre,
    };

    const selectedKeys = [activeDomainKey, activeNodeKey].filter(Boolean) as string[];
    const statusParts = selectedKeys
        .map((key) => labelByKey[key])
        .filter((label): label is string => Boolean(label))
        .map(stripDecorativePrefix);

    const items: NonNullable<MenuProps['items']> = [
        {
            key: 'group-tree',
            label: labels.treeGroup,
            type: 'group' as const,
            children: [
                domainItem(
                    'tree-tb',
                    labels.treeTb,
                    () => onStrategyLayout?.('tree', undefined, 'TB'),
                    <FaSitemap />,
                ),
                domainItem(
                    'tree-lr',
                    labels.treeLr,
                    () => onStrategyLayout?.('tree', undefined, 'LR'),
                    <FaSitemap style={{ transform: 'rotate(-90deg)' }} />,
                ),
            ],
        },
        { type: 'divider' as const },
        {
            key: 'group-force',
            label: labels.forceGroup,
            type: 'group' as const,
            children: [
                domainItem('force', labels.force, () => onStrategyLayout?.('force', undefined, 'TB')),
            ],
        },
        ...(onStrategyLayout ? [
            { type: 'divider' as const },
            {
                key: 'group-domain',
                label: labels.domainGroup,
                type: 'group' as const,
                children: [
                    domainItem(
                        'domain-dagre-lr',
                        labels.domainDagreLr,
                        () => onStrategyLayout('domain-dagre', lastNodeLayout, 'LR'),
                        <FaRegObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                    ),
                    domainItem(
                        'domain-dagre-tb',
                        labels.domainDagreTb,
                        () => onStrategyLayout('domain-dagre', lastNodeLayout, 'TB'),
                        <FaRegObjectGroup />,
                    ),
                    domainItem(
                        'domain-dagre-sub-horizontal-tb',
                        labels.domainDagreSubHorizontalTb,
                        () => onStrategyLayout('domain-dagre-sub-horizontal', 'dagre', 'TB'),
                        <FaRegObjectGroup />,
                    ),
                    { type: 'divider' as const },
                    domainItem(
                        'domain-vertical',
                        labels.domainVertical,
                        () => onStrategyLayout('domain-vertical', lastNodeLayout, 'TB'),
                        <FaObjectGroup />,
                    ),
                    domainItem(
                        'domain-horizontal',
                        labels.domainHorizontal,
                        () => onStrategyLayout('domain-horizontal', lastNodeLayout, 'LR'),
                        <FaObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                    ),
                ],
            },
            { type: 'divider' as const },
            {
                key: 'group-node-layout',
                label: labels.nodeGroup,
                type: 'group' as const,
                children: [
                    nodeItem('node-flow', labels.nodeFlow, 'flow'),
                    nodeItem('node-grid', labels.nodeGrid, 'grid'),
                    nodeItem('node-horizontal', labels.nodeHorizontal, 'horizontal'),
                    nodeItem('node-vertical', labels.nodeVertical, 'vertical'),
                    nodeItem('node-dagre', labels.nodeDagre, 'dagre'),
                ],
            },
        ] : []),
    ];

    return {
        items,
        selectedKeys,
        statusText: statusParts.length > 0 ? statusParts.join(' + ') : undefined,
    };
};
