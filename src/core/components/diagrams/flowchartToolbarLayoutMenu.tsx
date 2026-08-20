import React from 'react';
import type { MenuProps } from 'antd';
import { FaMagic, FaObjectGroup, FaRegObjectGroup, FaSitemap, FaSlidersH } from 'react-icons/fa';
import { usesSelectableDomainNodeArrangement } from './flowchartLayoutStrategyMode';

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
    onSmartLayout?: () => void | Promise<void>;
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

/**
 * Domain-internal node layouts are implemented by the vertical/horizontal
 * domain engines. Tree, force, ELK, and DomainDagre commands have their own
 * fixed ranking models, so replaying one of them from the node-layout menu
 * would silently ignore the selected node arrangement.
 */
export const resolveNodeLayoutHostStrategy = (
    lastDomainStrategy?: string,
    lastDomainDirection?: 'TB' | 'LR',
): 'domain-vertical' | 'domain-horizontal' => (
    lastDomainStrategy === 'domain-horizontal' || lastDomainDirection === 'LR'
        ? 'domain-horizontal'
        : 'domain-vertical'
);

export const buildFlowchartLayoutMenuModel = ({
    lastDomainDirection,
    lastDomainStrategy,
    lastNodeLayout,
    onSmartLayout,
    onStrategyLayout,
    translate,
}: BuildFlowchartLayoutMenuModelOptions): FlowchartLayoutMenuModel => {
    const activeDomainKey = resolveActiveDomainLayoutKey(lastDomainStrategy, lastDomainDirection);
    const activeNodeKey = lastNodeLayout && usesSelectableDomainNodeArrangement(lastDomainStrategy)
        ? `node-${lastNodeLayout}`
        : undefined;
    const nodeLayoutHostStrategy = resolveNodeLayoutHostStrategy(
        lastDomainStrategy,
        lastDomainDirection,
    );

    const labels = {
        recommendedGroup: translate('designer.flowchart.layout.recommendedGroup', '常用场景'),
        smart: translate('designer.flowchart.layout.smartRecommendation', '智能推荐'),
        advanced: translate('designer.flowchart.layout.advancedGroup', '高级布局'),
        treeGroup: translate('designer.flowchart.layout.advancedGlobalGroup', '全图布局（隐藏域容器）'),
        treeTb: translate('designer.flowchart.layout.treeTB', '↕ 树形 (上→下)'),
        treeLr: translate('designer.flowchart.layout.treeLR', '↔ 树形 (左→右)'),
        force: translate('designer.flowchart.layout.forceExplore', '⊙ 关系探索（力导向）'),
        domainGroup: translate('designer.flowchart.layout.advancedDomainGroup', '保留域的布局'),
        domainDagreTb: translate('designer.flowchart.layout.standardProcessTB', '标准流程（保留域·上→下）'),
        domainDagreSubHorizontalTb: translate(
            'designer.flowchart.layout.standardProcessSubHorizontalTB',
            '标准流程（子域横排）',
        ),
        domainCompoundElkTb: translate(
            'designer.flowchart.layout.complexProcessTB',
            '复杂流程（保留域·上→下）',
        ),
        domainCompoundElkLr: translate(
            'designer.flowchart.layout.complexProcessLR',
            '复杂流程（保留域·左→右）',
        ),
        domainLanesTb: translate(
            'designer.flowchart.layout.cyclicLanesTB',
            '循环流程泳道（上→下）',
        ),
        domainLanesLr: translate(
            'designer.flowchart.layout.cyclicLanesLR',
            '循环流程泳道（左→右）',
        ),
        domainElkTb: translate('designer.flowchart.layout.globalOrthogonalTB', '全图正交分层（上→下）'),
        domainElkLr: translate('designer.flowchart.layout.globalOrthogonalLR', '全图正交分层（左→右）'),
        domainVertical: translate('designer.flowchart.layout.freeDomainTB', '▥ 自由域布局（上→下）'),
        domainHorizontal: translate('designer.flowchart.layout.freeDomainLR', '▦ 自由域布局（左→右）'),
        nodeGroup: translate(
            'designer.flowchart.layout.advancedNodeArrangementGroup',
            '域内排布（切换为自由域布局）',
        ),
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
            nodeLayoutHostStrategy,
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
        'domain-dagre-tb': labels.domainDagreTb,
        'domain-dagre-sub-horizontal-tb': labels.domainDagreSubHorizontalTb,
        'domain-compound-elk-tb': labels.domainCompoundElkTb,
        'domain-compound-elk-lr': labels.domainCompoundElkLr,
        'domain-lanes-tb': labels.domainLanesTb,
        'domain-lanes-lr': labels.domainLanesLr,
        'domain-elk-tb': labels.domainElkTb,
        'domain-elk-lr': labels.domainElkLr,
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

    const advancedItems: NonNullable<MenuProps['items']> = [
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
                domainItem('force', labels.force, () => onStrategyLayout?.('force', undefined, 'TB')),
                domainItem(
                    'domain-elk-tb',
                    labels.domainElkTb,
                    () => onStrategyLayout?.('domain-elk', 'elk-layered', 'TB'),
                    <FaSitemap />,
                ),
                domainItem(
                    'domain-elk-lr',
                    labels.domainElkLr,
                    () => onStrategyLayout?.('domain-elk', 'elk-layered', 'LR'),
                    <FaSitemap style={{ transform: 'rotate(-90deg)' }} />,
                ),
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
                        'domain-dagre-sub-horizontal-tb',
                        labels.domainDagreSubHorizontalTb,
                        () => onStrategyLayout('domain-dagre-sub-horizontal', 'dagre', 'TB'),
                        <FaRegObjectGroup />,
                    ),
                    domainItem(
                        'domain-compound-elk-tb',
                        labels.domainCompoundElkTb,
                        () => onStrategyLayout('domain-compound-elk', undefined, 'TB'),
                        <FaObjectGroup />,
                    ),
                    domainItem(
                        'domain-lanes-tb',
                        labels.domainLanesTb,
                        () => onStrategyLayout('domain-lanes', undefined, 'TB'),
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

    const items: NonNullable<MenuProps['items']> = [
        {
            key: 'group-recommended',
            label: labels.recommendedGroup,
            type: 'group' as const,
            children: [
                ...(onSmartLayout ? [{
                    key: 'smart-recommendation',
                    label: labels.smart,
                    icon: <FaMagic />,
                    onClick: () => { void onSmartLayout(); },
                }] : []),
                domainItem(
                    'domain-dagre-tb',
                    labels.domainDagreTb,
                    () => onStrategyLayout?.('domain-dagre', lastNodeLayout, 'TB'),
                    <FaRegObjectGroup />,
                ),
                domainItem(
                    'domain-compound-elk-lr',
                    labels.domainCompoundElkLr,
                    () => onStrategyLayout?.('domain-compound-elk', undefined, 'LR'),
                    <FaObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                ),
                domainItem(
                    'domain-lanes-lr',
                    labels.domainLanesLr,
                    () => onStrategyLayout?.('domain-lanes', undefined, 'LR'),
                    <FaRegObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                ),
            ],
        },
        { type: 'divider' as const },
        {
            key: 'advanced-layouts',
            label: labels.advanced,
            icon: <FaSlidersH />,
            children: advancedItems,
        },
    ];

    return {
        items,
        selectedKeys,
        statusText: statusParts.length > 0 ? statusParts.join(' + ') : undefined,
    };
};
