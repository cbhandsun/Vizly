import React from 'react';
import type { MenuProps } from 'antd';
import { FaObjectGroup, FaRegObjectGroup } from 'react-icons/fa';
import type { FlowchartLayoutDirection } from './flowchartLayoutStrategyMode';

type ToolbarMenuItem = Extract<
    NonNullable<NonNullable<MenuProps['items']>[number]>,
    { type?: 'item' }
>;

type LayoutRadioMenuItem = ToolbarMenuItem & React.AriaAttributes & {
    role: 'menuitemradio';
};

type DomainItemFactory = (
    key: string,
    label: string,
    onClick: () => void,
    icon?: React.ReactNode,
) => LayoutRadioMenuItem;

type StrategyLayoutHandler = (
    strategyName: string,
    nodeLayout?: string,
    direction?: FlowchartLayoutDirection,
) => void;

interface DomainPreservingScenarioLabels {
    standardProcessGroup: string;
    complexProcessGroup: string;
    swimlaneProcessGroup: string;
    domainDagreTb: string;
    domainDagreBt: string;
    domainDagreLr: string;
    domainDagreRl: string;
    domainCompoundElkTb: string;
    domainCompoundElkBt: string;
    domainCompoundElkLr: string;
    domainCompoundElkRl: string;
    domainLanesTb: string;
    domainLanesBt: string;
    domainLanesLr: string;
    domainLanesRl: string;
}

interface BuildDomainPreservingScenarioItemsOptions {
    labels: DomainPreservingScenarioLabels;
    domainItem: DomainItemFactory;
    onStrategyLayout?: StrategyLayoutHandler;
}

export const layoutSubmenuPopupClassName = 'flowchart-layout-submenu-popup';

export const buildDomainPreservingScenarioItems = ({
    labels,
    domainItem,
    onStrategyLayout,
}: BuildDomainPreservingScenarioItemsOptions): NonNullable<MenuProps['items']> => {
    const standardProcessItems: NonNullable<MenuProps['items']> = [
        domainItem(
            'domain-dagre-tb',
            labels.domainDagreTb,
            () => onStrategyLayout?.('domain-dagre', undefined, 'TB'),
            <FaRegObjectGroup />,
        ),
        domainItem(
            'domain-dagre-bt',
            labels.domainDagreBt,
            () => onStrategyLayout?.('domain-dagre', undefined, 'BT'),
            <FaRegObjectGroup style={{ transform: 'rotate(180deg)' }} />,
        ),
        domainItem(
            'domain-dagre-lr',
            labels.domainDagreLr,
            () => onStrategyLayout?.('domain-dagre', undefined, 'LR'),
            <FaRegObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
        ),
        domainItem(
            'domain-dagre-rl',
            labels.domainDagreRl,
            () => onStrategyLayout?.('domain-dagre', undefined, 'RL'),
            <FaRegObjectGroup style={{ transform: 'rotate(90deg)' }} />,
        ),
    ];
    const complexProcessItems: NonNullable<MenuProps['items']> = [
        domainItem(
            'domain-compound-elk-tb',
            labels.domainCompoundElkTb,
            () => onStrategyLayout?.('domain-compound-elk', undefined, 'TB'),
            <FaObjectGroup />,
        ),
        domainItem(
            'domain-compound-elk-bt',
            labels.domainCompoundElkBt,
            () => onStrategyLayout?.('domain-compound-elk', undefined, 'BT'),
            <FaObjectGroup style={{ transform: 'rotate(180deg)' }} />,
        ),
        domainItem(
            'domain-compound-elk-lr',
            labels.domainCompoundElkLr,
            () => onStrategyLayout?.('domain-compound-elk', undefined, 'LR'),
            <FaObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
        ),
        domainItem(
            'domain-compound-elk-rl',
            labels.domainCompoundElkRl,
            () => onStrategyLayout?.('domain-compound-elk', undefined, 'RL'),
            <FaObjectGroup style={{ transform: 'rotate(90deg)' }} />,
        ),
    ];
    const swimlaneProcessItems: NonNullable<MenuProps['items']> = [
        domainItem(
            'domain-lanes-tb',
            labels.domainLanesTb,
            () => onStrategyLayout?.('domain-lanes', 'dagre', 'TB'),
            <FaRegObjectGroup />,
        ),
        domainItem(
            'domain-lanes-bt',
            labels.domainLanesBt,
            () => onStrategyLayout?.('domain-lanes', 'dagre', 'BT'),
            <FaRegObjectGroup style={{ transform: 'rotate(180deg)' }} />,
        ),
        domainItem(
            'domain-lanes-lr',
            labels.domainLanesLr,
            () => onStrategyLayout?.('domain-lanes', 'dagre', 'LR'),
            <FaRegObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
        ),
        domainItem(
            'domain-lanes-rl',
            labels.domainLanesRl,
            () => onStrategyLayout?.('domain-lanes', 'dagre', 'RL'),
            <FaRegObjectGroup style={{ transform: 'rotate(90deg)' }} />,
        ),
    ];

    return [
        {
            key: 'group-standard-process',
            label: labels.standardProcessGroup,
            icon: <FaRegObjectGroup />,
            popupClassName: layoutSubmenuPopupClassName,
            children: standardProcessItems,
        },
        {
            key: 'group-complex-process',
            label: labels.complexProcessGroup,
            icon: <FaObjectGroup />,
            popupClassName: layoutSubmenuPopupClassName,
            children: complexProcessItems,
        },
        {
            key: 'group-swimlane-process',
            label: labels.swimlaneProcessGroup,
            icon: <FaRegObjectGroup />,
            popupClassName: layoutSubmenuPopupClassName,
            children: swimlaneProcessItems,
        },
    ];
};
