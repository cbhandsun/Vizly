import React from 'react';
import type { MenuProps } from 'antd';
import { FaMagic, FaObjectGroup, FaRegObjectGroup, FaSitemap, FaSlidersH } from 'react-icons/fa';
import {
    coerceFlowchartDomainNodeArrangement,
    createCustomDomainLayoutCommand,
    resolveCustomDomainLayoutDirection,
    usesSelectableDomainNodeArrangement,
    type FlowchartLayoutDirection,
} from './flowchartLayoutStrategyMode';

type ToolbarMenuItem = Extract<
    NonNullable<NonNullable<MenuProps['items']>[number]>,
    { type?: 'item' }
>;

type LayoutRadioMenuItem = ToolbarMenuItem & React.AriaAttributes & {
    role: 'menuitemradio';
};

type TranslateLayoutLabel = (key: string, fallback: string) => string;

interface BuildFlowchartLayoutMenuModelOptions {
    customDomainLayoutAvailable?: boolean;
    lastDomainDirection?: FlowchartLayoutDirection;
    lastDomainStrategy?: string;
    lastNodeLayout?: string;
    onSmartLayout?: () => void | Promise<void>;
    onStrategyLayout?: (
        strategyName: string,
        nodeLayout?: string,
        direction?: FlowchartLayoutDirection,
    ) => void;
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
    lastDomainDirection?: FlowchartLayoutDirection,
): string | undefined => {
    if (!lastDomainStrategy) return undefined;
    if (lastDomainStrategy === 'force') return 'force';
    if (lastDomainStrategy === 'domain-vertical') return 'custom-domain-tb';
    if (lastDomainStrategy === 'domain-horizontal') return 'custom-domain-lr';
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
    lastDomainDirection?: FlowchartLayoutDirection,
): 'domain-vertical' | 'domain-horizontal' | 'domain-lanes' => (
    lastDomainStrategy === 'domain-lanes'
        ? 'domain-lanes'
        : createCustomDomainLayoutCommand(
            resolveCustomDomainLayoutDirection(lastDomainStrategy, lastDomainDirection),
            undefined,
        ).strategyName
);

export const buildFlowchartLayoutMenuModel = ({
    customDomainLayoutAvailable = true,
    lastDomainDirection,
    lastDomainStrategy,
    lastNodeLayout,
    onSmartLayout,
    onStrategyLayout,
    translate,
}: BuildFlowchartLayoutMenuModelOptions): FlowchartLayoutMenuModel => {
    const activeDomainKey = resolveActiveDomainLayoutKey(lastDomainStrategy, lastDomainDirection);
    const customDomainLayoutActive = usesSelectableDomainNodeArrangement(lastDomainStrategy);
    const activeNodeKey = customDomainLayoutActive
        ? `node-${createCustomDomainLayoutCommand(
            resolveCustomDomainLayoutDirection(lastDomainStrategy, lastDomainDirection),
            lastNodeLayout,
        ).nodeLayout}`
        : undefined;
    const customDomainDirection = resolveCustomDomainLayoutDirection(
        lastDomainStrategy,
        lastDomainDirection,
    );

    const labels = {
        recommendedGroup: translate('designer.flowchart.layout.recommendedGroup', '常用场景'),
        smart: translate('designer.flowchart.layout.smartRecommendation', '智能推荐'),
        customCombination: translate('designer.flowchart.layout.customCombination', '布局组合'),
        customCombinationGroup: translate(
            'designer.flowchart.layout.customCombinationGroup',
            '布局组合',
        ),
        customUnavailable: translate(
            'designer.flowchart.layout.customUnavailable',
            '当前图含合流或循环，请使用常用场景',
        ),
        moreEngines: translate('designer.flowchart.layout.moreEngines', '更多布局引擎'),
        treeGroup: translate('designer.flowchart.layout.advancedGlobalGroup', '全图布局（隐藏域容器）'),
        treeTb: translate('designer.flowchart.layout.treeTB', '↕ 树形 (上→下)'),
        treeBt: translate('designer.flowchart.layout.treeBT', '↥ 树形 (下→上)'),
        treeLr: translate('designer.flowchart.layout.treeLR', '↔ 树形 (左→右)'),
        treeRl: translate('designer.flowchart.layout.treeRL', '↔ 树形 (右→左)'),
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
        domainCompoundElkBt: translate(
            'designer.flowchart.layout.complexProcessBT',
            '复杂流程（保留域·下→上）',
        ),
        domainCompoundElkLr: translate(
            'designer.flowchart.layout.complexProcessLR',
            '复杂流程（保留域·左→右）',
        ),
        domainCompoundElkRl: translate(
            'designer.flowchart.layout.complexProcessRL',
            '复杂流程（保留域·右→左）',
        ),
        domainLanesTb: translate(
            'designer.flowchart.layout.cyclicLanesTB',
            '泳道 · 域左右并列（域内上→下）',
        ),
        domainLanesBt: translate(
            'designer.flowchart.layout.cyclicLanesBT',
            '泳道 · 域左右并列（域内下→上）',
        ),
        domainLanesLr: translate(
            'designer.flowchart.layout.cyclicLanesLR',
            '泳道 · 域上下堆叠（域内左→右）',
        ),
        domainLanesRl: translate(
            'designer.flowchart.layout.cyclicLanesRL',
            '泳道 · 域上下堆叠（域内右→左）',
        ),
        domainElkTb: translate('designer.flowchart.layout.globalOrthogonalTB', '全图正交分层（上→下）'),
        domainElkBt: translate('designer.flowchart.layout.globalOrthogonalBT', '全图正交分层（下→上）'),
        domainElkLr: translate('designer.flowchart.layout.globalOrthogonalLR', '全图正交分层（左→右）'),
        domainElkRl: translate('designer.flowchart.layout.globalOrthogonalRL', '全图正交分层（右→左）'),
        domainDirectionGroup: translate('designer.flowchart.layout.domainDirectionGroup', '域排列方向'),
        domainVertical: translate('designer.flowchart.layout.freeDomainTB', '域纵向排列（上→下）'),
        domainHorizontal: translate('designer.flowchart.layout.freeDomainLR', '域横向排列（左→右）'),
        nodeGroup: translate(
            'designer.flowchart.layout.advancedNodeArrangementGroup',
            '域／子域内节点排布',
        ),
        nodeFlow: translate('designer.flowchart.layout.nodeFlow', '流式换行'),
        nodeGrid: translate('designer.flowchart.layout.nodeGrid', '网格排列'),
        nodeHorizontal: translate('designer.flowchart.layout.nodeHorizontal', '水平排列'),
        nodeVertical: translate('designer.flowchart.layout.nodeVertical', '垂直排列'),
        nodeDagre: translate('designer.flowchart.layout.nodeDagre', '自动分层（推荐）'),
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
        onClick: () => {
            const normalizedNodeLayout = coerceFlowchartDomainNodeArrangement(nodeLayout);
            if (lastDomainStrategy === 'domain-lanes') {
                onStrategyLayout?.('domain-lanes', normalizedNodeLayout, lastDomainDirection ?? 'LR');
                return;
            }
            const command = createCustomDomainLayoutCommand(customDomainDirection, normalizedNodeLayout);
            onStrategyLayout?.(command.strategyName, command.nodeLayout, command.direction);
        },
        role: 'menuitemradio',
        'aria-checked': activeNodeKey === key,
    });

    const customDirectionItem = (
        key: string,
        label: string,
        direction: 'TB' | 'LR',
    ): LayoutRadioMenuItem => domainItem(key, label, () => {
        const command = createCustomDomainLayoutCommand(direction, lastNodeLayout);
        onStrategyLayout?.(command.strategyName, command.nodeLayout, command.direction);
    }, direction === 'LR'
        ? <FaObjectGroup style={{ transform: 'rotate(-90deg)' }} />
        : <FaObjectGroup />);

    const labelByKey: Record<string, string> = {
        'tree-tb': labels.treeTb,
        'tree-bt': labels.treeBt,
        'tree-lr': labels.treeLr,
        'tree-rl': labels.treeRl,
        force: labels.force,
        'domain-dagre-tb': labels.domainDagreTb,
        'domain-dagre-sub-horizontal-tb': labels.domainDagreSubHorizontalTb,
        'domain-compound-elk-tb': labels.domainCompoundElkTb,
        'domain-compound-elk-bt': labels.domainCompoundElkBt,
        'domain-compound-elk-lr': labels.domainCompoundElkLr,
        'domain-compound-elk-rl': labels.domainCompoundElkRl,
        'domain-lanes-tb': labels.domainLanesTb,
        'domain-lanes-bt': labels.domainLanesBt,
        'domain-lanes-lr': labels.domainLanesLr,
        'domain-lanes-rl': labels.domainLanesRl,
        'domain-elk-tb': labels.domainElkTb,
        'domain-elk-bt': labels.domainElkBt,
        'domain-elk-lr': labels.domainElkLr,
        'domain-elk-rl': labels.domainElkRl,
        'custom-domain-tb': labels.domainVertical,
        'custom-domain-lr': labels.domainHorizontal,
        'node-flow': labels.nodeFlow,
        'node-grid': labels.nodeGrid,
        'node-horizontal': labels.nodeHorizontal,
        'node-vertical': labels.nodeVertical,
        'node-dagre': labels.nodeDagre,
    };

    const selectedKeys = customDomainLayoutActive
        ? [activeDomainKey, activeNodeKey].filter(Boolean) as string[]
        : [activeDomainKey].filter(Boolean) as string[];
    const statusParts = selectedKeys
        .map((key) => labelByKey[key])
        .filter((label): label is string => Boolean(label))
        .map(stripDecorativePrefix);

    const customDirectionItems: NonNullable<MenuProps['items']> = [
        customDirectionItem('custom-domain-tb', labels.domainVertical, 'TB'),
        customDirectionItem('custom-domain-lr', labels.domainHorizontal, 'LR'),
    ];
    const customNodeItems: NonNullable<MenuProps['items']> = [
        nodeItem('node-dagre', labels.nodeDagre, 'dagre'),
        nodeItem('node-flow', labels.nodeFlow, 'flow'),
        nodeItem('node-grid', labels.nodeGrid, 'grid'),
        nodeItem('node-horizontal', labels.nodeHorizontal, 'horizontal'),
        nodeItem('node-vertical', labels.nodeVertical, 'vertical'),
    ];

    const primaryTopBottomItem = customDomainLayoutAvailable
        ? domainItem(
            'domain-dagre-tb',
            labels.domainDagreTb,
            () => onStrategyLayout?.('domain-dagre', undefined, 'TB'),
            <FaRegObjectGroup />,
        )
        : domainItem(
            'domain-compound-elk-tb',
            labels.domainCompoundElkTb,
            () => onStrategyLayout?.('domain-compound-elk', undefined, 'TB'),
            <FaObjectGroup />,
        );

    const moreEngineItems: NonNullable<MenuProps['items']> = [
        ...(onStrategyLayout ? [{
            key: 'group-domain',
            label: labels.domainGroup,
            type: 'group' as const,
            children: [
                ...(customDomainLayoutAvailable ? [
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
                ] : []),
                domainItem(
                    'domain-compound-elk-bt',
                    labels.domainCompoundElkBt,
                    () => onStrategyLayout('domain-compound-elk', undefined, 'BT'),
                    <FaObjectGroup style={{ transform: 'rotate(180deg)' }} />,
                ),
                domainItem(
                    'domain-compound-elk-rl',
                    labels.domainCompoundElkRl,
                    () => onStrategyLayout('domain-compound-elk', undefined, 'RL'),
                    <FaObjectGroup style={{ transform: 'rotate(90deg)' }} />,
                ),
                domainItem(
                    'domain-lanes-bt',
                    labels.domainLanesBt,
                    () => onStrategyLayout('domain-lanes', 'flow', 'BT'),
                    <FaRegObjectGroup style={{ transform: 'rotate(180deg)' }} />,
                ),
                domainItem(
                    'domain-lanes-rl',
                    labels.domainLanesRl,
                    () => onStrategyLayout('domain-lanes', 'flow', 'RL'),
                    <FaRegObjectGroup style={{ transform: 'rotate(90deg)' }} />,
                ),
            ],
        }, { type: 'divider' as const }] : []),
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
                    'tree-bt',
                    labels.treeBt,
                    () => onStrategyLayout?.('tree', undefined, 'BT'),
                    <FaSitemap style={{ transform: 'rotate(180deg)' }} />,
                ),
                domainItem(
                    'tree-lr',
                    labels.treeLr,
                    () => onStrategyLayout?.('tree', undefined, 'LR'),
                    <FaSitemap style={{ transform: 'rotate(-90deg)' }} />,
                ),
                domainItem(
                    'tree-rl',
                    labels.treeRl,
                    () => onStrategyLayout?.('tree', undefined, 'RL'),
                    <FaSitemap style={{ transform: 'rotate(90deg)' }} />,
                ),
                domainItem('force', labels.force, () => onStrategyLayout?.('force', undefined, 'TB')),
                domainItem(
                    'domain-elk-tb',
                    labels.domainElkTb,
                    () => onStrategyLayout?.('domain-elk', 'elk-layered', 'TB'),
                    <FaSitemap />,
                ),
                domainItem(
                    'domain-elk-bt',
                    labels.domainElkBt,
                    () => onStrategyLayout?.('domain-elk', 'elk-layered', 'BT'),
                    <FaSitemap style={{ transform: 'rotate(180deg)' }} />,
                ),
                domainItem(
                    'domain-elk-lr',
                    labels.domainElkLr,
                    () => onStrategyLayout?.('domain-elk', 'elk-layered', 'LR'),
                    <FaSitemap style={{ transform: 'rotate(-90deg)' }} />,
                ),
                domainItem(
                    'domain-elk-rl',
                    labels.domainElkRl,
                    () => onStrategyLayout?.('domain-elk', 'elk-layered', 'RL'),
                    <FaSitemap style={{ transform: 'rotate(90deg)' }} />,
                ),
            ],
        },
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
                primaryTopBottomItem,
                domainItem(
                    'domain-compound-elk-lr',
                    labels.domainCompoundElkLr,
                    () => onStrategyLayout?.('domain-compound-elk', undefined, 'LR'),
                    <FaObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                ),
                domainItem(
                    'domain-lanes-tb',
                    labels.domainLanesTb,
                    () => onStrategyLayout?.('domain-lanes', 'dagre', 'TB'),
                    <FaRegObjectGroup />,
                ),
                domainItem(
                    'domain-lanes-lr',
                    labels.domainLanesLr,
                    () => onStrategyLayout?.('domain-lanes', 'dagre', 'LR'),
                    <FaRegObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                ),
            ],
        },
        { type: 'divider' as const },
        {
            key: 'group-custom-combination',
            label: customDomainLayoutAvailable || lastDomainStrategy === 'domain-lanes'
                ? labels.customCombinationGroup
                : `${labels.customCombinationGroup} · ${labels.customUnavailable}`,
            type: 'group' as const,
            children: [
                {
                    key: 'custom-domain-direction',
                    label: labels.domainDirectionGroup,
                    icon: <FaObjectGroup />,
                    disabled: !customDomainLayoutAvailable,
                    children: customDirectionItems,
                },
                {
                    key: 'custom-node-arrangement',
                    label: labels.nodeGroup,
                    icon: <FaSlidersH />,
                    disabled: !customDomainLayoutAvailable && lastDomainStrategy !== 'domain-lanes',
                    children: customNodeItems,
                },
            ],
        },
        { type: 'divider' as const },
        {
            key: 'more-layout-engines',
            label: labels.moreEngines,
            icon: <FaSitemap />,
            children: moreEngineItems,
        },
    ];

    return {
        items,
        selectedKeys,
        statusText: statusParts.length > 0
            ? `${customDomainLayoutActive ? `${labels.customCombination}：` : ''}${statusParts.join(' + ')}`
            : undefined,
    };
};
