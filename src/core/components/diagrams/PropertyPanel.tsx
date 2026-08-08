import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Node, Edge, MarkerType } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { NodeDataUpdate, EdgeDataUpdate } from '../../types/diagram-updates';
import { FlowchartNodeData } from '../custom-nodes/FlowchartNode';
import {
    Collapse,
    Typography,
} from 'antd';
import {
    SettingOutlined,
    RightOutlined,
} from '@ant-design/icons';
import type { Color } from 'antd/es/color-picker';
import { useNodePropertyItems } from './NodePropertyEditor';
import { useEdgePropertyItems } from './EdgePropertyEditor';
import { ThemeSwitcherPanel } from '../ui/ThemeSwitcherPanel';
import { IconExplorer } from '../shared/IconExplorer';
import { normalizeNodeDescriptionForEditing } from './nodeDescriptionText';
import {
    coerceFlowchartReplaceText,
    getFlowchartEdgeVisibleLabel,
} from './flowchartSearchReplace';
import './PropertyPanel.css';

const { Text } = Typography;

interface PropertyPanelProps {
    selectedNodes: Node[];
    selectedEdges: Edge[];
    onUpdateNodes: (ids: string[], data: NodeDataUpdate) => void;
    onUpdateEdges: (ids: string[], data: EdgeDataUpdate) => void;
    onBeforeUpdate?: () => void;
    disabled?: boolean;
    disabledReason?: string;
    docked?: boolean;
}

// Debounce实用函数
function useDebouncedCallback<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay: number
): (...args: TArgs) => void {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    const debouncedCallback = useCallback((...args: TArgs) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    }, [delay]);

    useEffect(() => () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }, []);

    return debouncedCallback;
}

const PropertyPanel: React.FC<PropertyPanelProps> = ({
    selectedNodes, selectedEdges, onUpdateNodes, onUpdateEdges,
    onBeforeUpdate, disabled = false, disabledReason, docked = false
}) => {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState(false);
    const isActuallyCollapsed = docked ? false : collapsed;

    const nodeCount = selectedNodes.length;
    const edgeCount = selectedEdges.length;
    const hasSelection = nodeCount > 0 || edgeCount > 0;
    const mixedLabel = t('propertyPanel.mixed');
    const selectLabel = t('propertyPanel.select');

    // --- Snapshot ---
    const snapshotArmedRef = useRef(true);
    useEffect(() => { snapshotArmedRef.current = true; }, [selectedNodes, selectedEdges]);

    const armSnapshot = useCallback(() => {
        if (!onBeforeUpdate || !snapshotArmedRef.current) return;
        snapshotArmedRef.current = false;
        onBeforeUpdate();
    }, [onBeforeUpdate]);

    const getNodeData = (node: Node) => node.data as FlowchartNodeData;
    const getCommonValue = <T, V>(items: T[], getter: (item: T) => V): V | undefined => {
        if (items.length === 0) return undefined;
        const first = getter(items[0]);
        return items.every(item => getter(item) === first) ? first : undefined;
    };
    const commonNodeLabel = getCommonValue(selectedNodes, (n) => getNodeData(n)?.label);
    const commonNodeDesc = getCommonValue(selectedNodes, (n) => getNodeData(n)?.description);
    const commonDomain = getCommonValue(selectedNodes, (n) => getNodeData(n)?.domain);
    const commonEdgeLabel = getCommonValue(selectedEdges, getFlowchartEdgeVisibleLabel);

    const externalFieldValues = {
        label: commonNodeLabel ?? '',
        description: normalizeNodeDescriptionForEditing(commonNodeDesc),
        domain: commonDomain ?? '',
        edgeLabel: coerceFlowchartReplaceText(commonEdgeLabel),
    };

    // --- 本地状态 ---
    const [localLabel, setLocalLabel] = useState(externalFieldValues.label);
    const [localDesc, setLocalDesc] = useState(externalFieldValues.description);
    const [localDomain, setLocalDomain] = useState(externalFieldValues.domain);
    const [localEdgeLabel, setLocalEdgeLabel] = useState(externalFieldValues.edgeLabel);
    const [iconExplorerVisible, setIconExplorerVisible] = useState(false);
    const [syncedExternalFieldValues, setSyncedExternalFieldValues] = useState(externalFieldValues);
    if (
        syncedExternalFieldValues.label !== externalFieldValues.label
        || syncedExternalFieldValues.description !== externalFieldValues.description
        || syncedExternalFieldValues.domain !== externalFieldValues.domain
        || syncedExternalFieldValues.edgeLabel !== externalFieldValues.edgeLabel
    ) {
        setSyncedExternalFieldValues(externalFieldValues);
        setLocalLabel(externalFieldValues.label);
        setLocalDesc(externalFieldValues.description);
        setLocalDomain(externalFieldValues.domain);
        setLocalEdgeLabel(externalFieldValues.edgeLabel);
    }

    // --- Update 回调 ---
    const updateNodes = useCallback((partialData: NodeDataUpdate) => {
        onUpdateNodes(selectedNodes.map(n => n.id), partialData);
    }, [selectedNodes, onUpdateNodes]);

    const updateEdges = useCallback((partialData: EdgeDataUpdate) => {
        onUpdateEdges(selectedEdges.map(e => e.id), partialData);
    }, [selectedEdges, onUpdateEdges]);

    const debouncedUpdateLabel = useDebouncedCallback((value: string) => updateNodes({ label: value }), 300);
    const debouncedUpdateDesc = useDebouncedCallback((value: string) => updateNodes({ description: value }), 300);
    const debouncedUpdateDomain = useDebouncedCallback((value: string) => updateNodes({ domain: value }), 300);
    const debouncedUpdateEdgeLabel = useDebouncedCallback((value: string) => updateEdges({ label: value, data: { label: value } }), 300);

    // --- 颜色变更 ---
    const commonEdgeArrow = getCommonValue(selectedEdges, (e) => {
        const me = e.markerEnd; const ms = e.markerStart;
        if (!!ms && !!me) return 'bidirectional';
        if (!me) return 'none';
        if (typeof me === 'object' && me.type === MarkerType.Arrow) return 'open-arrow';
        return 'arrow';
    });
    const _commonEdgeColor = getCommonValue(selectedEdges, (e) => e.style?.stroke);

    const handleNodeColorChange = useCallback((color: Color, field: string) => {
        armSnapshot();
        const hex = color.toHexString();
        if (field === 'themeColor') updateNodes({ themeColor: hex });
        else updateNodes({ theme: { [field]: hex } });
    }, [armSnapshot, updateNodes]);

    const handleEdgeColorChange = useCallback((color: Color, field: string) => {
        armSnapshot();
        const hex = color.toHexString();
        if (field === 'stroke') {
            const markerPatch = commonEdgeArrow === 'arrow' ? { type: MarkerType.ArrowClosed, color: hex } : undefined;
            if (markerPatch) updateEdges({ style: { stroke: hex }, markerEnd: markerPatch });
            else updateEdges({ style: { stroke: hex } });
        }
    }, [armSnapshot, commonEdgeArrow, updateEdges]);

    // --- Collapse items via hooks ---
    const nodeItems = useNodePropertyItems({
        selectedNodes, updateNodes, armSnapshot, disabled, mixedLabel, selectLabel,
        onColorChange: handleNodeColorChange,
        localLabel, setLocalLabel, localDesc, setLocalDesc, localDomain, setLocalDomain,
        debouncedUpdateLabel, debouncedUpdateDesc, debouncedUpdateDomain,
        onShowIconExplorer: () => setIconExplorerVisible(true),
    });

    const edgeItems = useEdgePropertyItems({
        selectedEdges, updateEdges, armSnapshot, disabled, mixedLabel, selectLabel,
        localEdgeLabel, setLocalEdgeLabel, debouncedUpdateEdgeLabel,
        onColorChange: handleEdgeColorChange,
    });

    const collapseItems = useMemo(() => {
        const result = [];
        if (nodeCount > 0 && nodeItems) result.push(...nodeItems);
        if (edgeCount > 0 && edgeItems) result.push(...edgeItems);
        return result;
    }, [nodeCount, edgeCount, nodeItems, edgeItems]);

    // --- Collapse keys ---
    const isAllGroups = selectedNodes.length > 0 && selectedNodes.every(n => n.type === 'titleGroup' || n.type === 'subGroup');
    const isAllArchitecture = selectedNodes.length > 0 && selectedNodes.every(n => n.type === 'architectureNode');

    const initialActiveKeys = useMemo<string[]>(() => {
        if (!hasSelection) return [];
        if (nodeCount > 0 && edgeCount === 0) {
            if (isAllGroups) return ['styling'];
            if (isAllArchitecture) return ['info', 'architectureSettings', 'layout'];
            return ['info', 'layout'];
        }
        if (edgeCount > 0 && nodeCount === 0) return ['connection', 'lineStyle'];
        return ['info'];
    }, [edgeCount, hasSelection, isAllGroups, isAllArchitecture, nodeCount]);

    const [activeKeys, setActiveKeys] = useState<string[]>(() => initialActiveKeys);
    const activeKeyPreset = initialActiveKeys.join('\u0000');
    const [syncedActiveKeyPreset, setSyncedActiveKeyPreset] = useState(activeKeyPreset);
    if (syncedActiveKeyPreset !== activeKeyPreset) {
        setSyncedActiveKeyPreset(activeKeyPreset);
        setActiveKeys(initialActiveKeys);
    }

    const title = hasSelection
        ? `${t('propertyPanel.title')} (${nodeCount + edgeCount})`
        : t('propertyPanel.title');

    const containerClassName = `property-panel-container ${hasSelection ? 'visible' : ''} ${isActuallyCollapsed ? 'collapsed' : ''} ${disabled ? 'disabled' : ''} ${docked ? 'docked' : ''}`;

    if (!hasSelection) {
        return (
            <div className={containerClassName}>
                {!docked && (
                    <div className={`property-panel-toggle ${isActuallyCollapsed ? 'collapsed' : ''}`}
                        onClick={() => setCollapsed(!collapsed)} title={isActuallyCollapsed ? t('propertyPanel.expand') : t('propertyPanel.collapse')}>
                        <RightOutlined />
                    </div>
                )}
                <div className="property-panel-wrapper">
                    {!docked && (
                        <div className="property-panel-header">
                            <SettingOutlined /> {t('propertyPanel.settings')}
                        </div>
                    )}
                    <div className="property-panel-empty" style={{ padding: 0, height: '100%', overflowY: 'auto' }}>
                        <ThemeSwitcherPanel />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <aside className={containerClassName} aria-label={t('propertyPanel.title')}>
            {!docked && (
                <div className={`property-panel-toggle ${isActuallyCollapsed ? 'collapsed' : ''}`}
                    onClick={() => setCollapsed(!collapsed)} title={isActuallyCollapsed ? t('propertyPanel.expand') : t('propertyPanel.collapse')}>
                    <RightOutlined />
                </div>
            )}
            <div className="property-panel-wrapper" aria-disabled={disabled}>
                {!docked && (
                    <div className="property-panel-header">
                        <SettingOutlined />
                        <Text strong>{title}</Text>
                        {disabled && <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>{disabledReason || '拖动中...'}</Text>}
                    </div>
                )}

                {docked && disabledReason && (
                    <div role="status" style={{ padding: '10px 16px 0' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{disabledReason}</Text>
                    </div>
                )}

                <div className="property-panel-content" style={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
                    {(nodeCount === 1 && edgeCount === 0) && (
                        <div style={{ padding: '0 16px 16px', marginTop: docked ? 16 : 0 }}>
                            <Text type="secondary" style={{ fontSize: 10 }} copyable={{ text: selectedNodes[0].id }}>
                                {t('propertyPanel.id')}: {selectedNodes[0].id}
                            </Text>
                        </div>
                    )}
                    {(edgeCount === 1 && nodeCount === 0) && (
                        <div style={{ padding: '0 16px 16px', marginTop: docked ? 16 : 0 }}>
                            <Text type="secondary" style={{ fontSize: 10 }} copyable={{ text: selectedEdges[0].id }}>
                                {t('propertyPanel.id')}: {selectedEdges[0].id}
                            </Text>
                        </div>
                    )}

                    <Collapse
                        activeKey={activeKeys}
                        onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
                        ghost expandIconPlacement="end" size="small" className="property-collapse"
                        items={collapseItems}
                    />
                </div>
            </div>

            <IconExplorer
                visible={iconExplorerVisible}
                onClose={() => setIconExplorerVisible(false)}
                onSelect={(iconName) => {
                    armSnapshot();
                    updateNodes({ icon: iconName });
                }}
                initialValue={getCommonValue(selectedNodes, (n) => {
                    const icon = getNodeData(n)?.icon;
                    return typeof icon === 'string' ? icon : undefined;
                })}
            />
        </aside>
    );
};

export default React.memo(PropertyPanel);
