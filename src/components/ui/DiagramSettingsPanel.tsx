// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Switch } from 'antd';
import { FaCog } from 'react-icons/fa';
import EnhancedStyleSwitcher from '@/components/shared/EnhancedStyleSwitcher';
import { EnhancedThemeSelector } from './EnhancedThemeSelector';
import { LayoutStrategyManager } from '@/core';
import { LayeredConfigManager, ConfigLayer } from '@/core';
import { DiagramDefinition } from '@/core';
import { ConfigurationPanel } from './ConfigurationPanel';

interface DiagramSettingsPanelProps {
    selectedDiagram?: DiagramDefinition;
    selectedDiagramId: string;
    edgeMode: string;
    onEdgeModeChange: (val: 'advanced-smart' | 'native') => Promise<void>;
    layoutStrategy: string;
    onLayoutStrategyChange: (val: string) => Promise<void>;
    nodeLayoutStrategy: string;
    onNodeLayoutStrategyChange: (val: string) => Promise<void>;
    elkAlgorithm: string;
    onElkAlgorithmChange: (val: string) => Promise<void>;
    linkOrientationEnabled: boolean;
    showOnlyMainFlow: boolean;
    onShowOnlyMainFlowChange: (val: boolean) => void;
    onRefreshRequest: () => void;
}

export const DiagramSettingsPanel: React.FC<DiagramSettingsPanelProps> = ({
    selectedDiagram,
    selectedDiagramId,
    edgeMode,
    onEdgeModeChange,
    layoutStrategy,
    onLayoutStrategyChange,
    nodeLayoutStrategy,
    onNodeLayoutStrategyChange,
    elkAlgorithm,
    onElkAlgorithmChange,
    linkOrientationEnabled,
    showOnlyMainFlow,
    onShowOnlyMainFlowChange,
    onRefreshRequest
}) => {
    const { t } = useTranslation();
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const isLayoutSwitchSupported = !selectedDiagram || !!selectedDiagram.supportsLayoutSwitch;
    const isMainFlowToggleSupported = !selectedDiagram || !!selectedDiagram.supportsMainFlowToggle;

    // 节点布局策略自动修正逻辑
    useEffect(() => {
        const checkStrategies = async () => {
            const selectable = LayoutStrategyManager.getShared().isNodeLayoutExternallySelectable(layoutStrategy);
            const all = LayoutStrategyManager.getShared().getAvailableNodeStrategies();
            const normLayout = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
            const isDomainVert = (normLayout === 'domainvertical' || normLayout === 'domainverticallayout');
            const isDomainHoriz = (normLayout === 'domainhorizontal' || normLayout === 'domainhorizontallayout');

            const isCytoscape = (s: any) => {
                const name = String(s?.getName?.() ?? '').toLowerCase();
                return name.includes('cytoscapefcose') || name.includes('cytoscapeconcentric');
            };

            const allowed = (!selectable)
                ? []
                : (isDomainVert || isDomainHoriz)
                    ? all.filter(({ strategy }) => !isCytoscape(strategy))
                    : all;

            if (allowed.length > 0) {
                const allowedSet = new Set(allowed.map(a => a.type));
                if (!allowedSet.has(nodeLayoutStrategy)) {
                    const first = allowed[0]?.type || 'HorizontalLayout';
                    await onNodeLayoutStrategyChange(first);
                    onRefreshRequest();
                }
            }
        };
        checkStrategies();
    }, [layoutStrategy, nodeLayoutStrategy, onNodeLayoutStrategyChange, onRefreshRequest]); // 监听布局变化

    const renderStrategyOptionContent = (s: { getName?: () => string; getDescription?: () => string }) => {
        const name = s?.getName?.() ?? '';
        const desc = s?.getDescription?.() ?? name;
        return (
            <div title={desc} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 12, color: '#666' }}>{desc}</span>
            </div>
        );
    };

    return (
        <div className="flex flex-col relative w-full h-full p-0 bg-transparent text-gray-800 dark:text-gray-200">
            {/* 统一卡片设置区 */}
            <div style={{ padding: '16px 16px 12px 16px' }}>
                <div className="flex flex-col rounded-[10px] border border-black/[0.06] dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-sm">

                    {/* ===== 颜色主题 ===== */}
                    <div className="flex items-center justify-between gap-3 py-2.5 px-4 border-b border-black/[0.05] dark:border-white/[0.05] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('designer.settings.theme', '颜色主题')}</span>
                        <div className="w-[150px] flex-shrink-0">
                            <EnhancedThemeSelector
                                showPresets={true}
                                showCustomThemes={true}
                                showImportExport={true}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* ===== 线条风格 ===== */}
                    <div className="flex items-center justify-between gap-3 py-2.5 px-4 border-b border-black/[0.05] dark:border-white/[0.05] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('designer.settings.style', '线条风格')}</span>
                        <div className="w-[150px] flex-shrink-0">
                            <EnhancedStyleSwitcher size="sm" className="w-full" />
                        </div>
                    </div>

                    {/* ===== 连线模式 ===== */}
                    <div className="flex items-center justify-between gap-3 py-2.5 px-4 border-b border-black/[0.05] dark:border-white/[0.05] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('designer.settings.edgeMode')}</span>
                        <div className="w-[150px] flex-shrink-0">
                            <Select
                                className="top-action-select-antd w-full"
                                value={(edgeMode as string) === 'smart' ? 'advanced-smart' : edgeMode}
                                onChange={(val) => onEdgeModeChange(val as 'advanced-smart' | 'native')}
                                popupMatchSelectWidth={false}
                            >
                                <Select.Option value="advanced-smart">{t('designer.settings.smart')}</Select.Option>
                                <Select.Option value="native">{t('designer.settings.native')}</Select.Option>
                            </Select>
                        </div>
                    </div>

                    {/* ===== 布局策略 ===== */}
                    <div className="flex items-center justify-between gap-3 py-2.5 px-4 border-b border-black/[0.05] dark:border-white/[0.05] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{t('designer.settings.layoutStrategy')}</span>
                        <div className="w-[150px] flex-shrink-0">
                            <Select
                                className="w-full"
                                value={layoutStrategy}
                                disabled={!isLayoutSwitchSupported}
                                onChange={async (val) => {
                                    const next = val as string;
                                    await onLayoutStrategyChange(next);
                                    let resolvedNodeLayout: string | undefined;
                                    try {
                                        const manager = LayoutStrategyManager.getShared();
                                        const autoNode = manager.getPreferredNodeStrategyForHierarchy(next);
                                        const selectable = manager.isNodeLayoutExternallySelectable(next);
                                        const norm = String(next).trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');

                                        if (linkOrientationEnabled) {
                                            if (norm === 'domainhorizontallayout' || norm === 'domainhorizontal') {
                                                await onNodeLayoutStrategyChange('DagreLayout');
                                                resolvedNodeLayout = 'dagre';
                                            } else if (norm === 'domainverticallayout' || norm === 'domainvertical') {
                                                await onNodeLayoutStrategyChange('DagreLayout');
                                                resolvedNodeLayout = 'dagre';
                                            }
                                        }

                                        if (!selectable && autoNode) {
                                            await onNodeLayoutStrategyChange(autoNode);
                                        }
                                    } catch { }
                                    // 触发 FlowchartDesigner 用新策略重新计算布局
                                    window.dispatchEvent(new CustomEvent('editor:command', {
                                        detail: { action: 'apply-layout', strategy: next, nodeLayout: resolvedNodeLayout }
                                    }));
                                }}
                                popupMatchSelectWidth={false}
                                optionLabelProp="label"
                            >
                                {LayoutStrategyManager.getShared().getAvailableHierarchyStrategies().map(({ type, strategy }: { type: string, strategy: any }) => (
                                    <Select.Option key={type} value={type} label={strategy.getName?.() ?? type}>
                                        {renderStrategyOptionContent(strategy)}
                                    </Select.Option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    {/* ===== 节点布局/ELK算法 ===== */}
                    <div className="flex items-center justify-between gap-3 py-2.5 px-4 border-b border-black/[0.05] dark:border-white/[0.05] hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                        <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {(() => {
                                const norm = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                                const isDomainElk = norm === 'domainelk' || norm === 'domainelklayout';
                                return isDomainElk ? t('designer.settings.elkAlgorithm') : t('designer.settings.nodeLayout');
                            })()}
                        </span>
                        <div className="w-[150px] flex-shrink-0">
                            {(() => {
                                const norm = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                                const isDomainElk = norm === 'domainelk' || norm === 'domainelklayout';
                                if (isDomainElk) {
                                    return (
                                        <Select
                                            className="w-full"
                                            value={elkAlgorithm}
                                            onChange={(val) => onElkAlgorithmChange(String(val || 'layered'))}
                                            popupMatchSelectWidth={false}
                                            optionLabelProp="label"
                                        >
                                            <Select.Option key={'elk-layered'} value={'layered'} label={t('designer.settings.elk.layered.title')}>
                                                <div title={t('designer.settings.elk.layered.desc')} style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600 }}>{t('designer.settings.elk.layered.title')}</span>
                                                    <span style={{ fontSize: 12, color: '#666' }}>{t('designer.settings.elk.layered.desc')}</span>
                                                </div>
                                            </Select.Option>
                                            <Select.Option key={'elk-mrtree'} value={'mrtree'} label={t('designer.settings.elk.mrtree.title')}>
                                                <div title={t('designer.settings.elk.mrtree.desc')} style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600 }}>{t('designer.settings.elk.mrtree.title')}</span>
                                                    <span style={{ fontSize: 12, color: '#666' }}>{t('designer.settings.elk.mrtree.desc')}</span>
                                                </div>
                                            </Select.Option>
                                            <Select.Option key={'elk-force'} value={'force'} label={t('designer.settings.elk.force.title')}>
                                                <div title={t('designer.settings.elk.force.desc')} style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600 }}>{t('designer.settings.elk.force.title')}</span>
                                                    <span style={{ fontSize: 12, color: '#666' }}>{t('designer.settings.elk.force.desc')}</span>
                                                </div>
                                            </Select.Option>
                                        </Select>
                                    );
                                }
                                const isDomainElkCompound = (norm === 'domainelkcompoundlayout' || norm === 'domainelkcompound');
                                const selectable = LayoutStrategyManager.getShared().isNodeLayoutExternallySelectable(String(layoutStrategy || ''));
                                if (!selectable && isDomainElkCompound) {
                                    const layered = LayeredConfigManager.getInstance();
                                    const currentContainment = String(layered.get<string>('diagram.layout.CONTAINMENT_POLICY', 'elastic') || 'elastic');
                                    const currentRank = String(layered.get<string>('diagram.layout.RANK_MODE', 'elk') || 'elk');
                                    const currentPreset = `${currentContainment}+${currentRank}`;
                                    const presets = [
                                        { key: 'elastic+elk', label: t('designer.settings.preset.elastic.label'), desc: t('designer.settings.preset.elastic.desc') },
                                        { key: 'soft+elk', label: t('designer.settings.preset.soft.label'), desc: t('designer.settings.preset.soft.desc') },
                                        { key: 'strict+elk', label: t('designer.settings.preset.strict.label'), desc: t('designer.settings.preset.strict.desc') },
                                    ];
                                    return (
                                        <Select
                                            className="w-full"
                                            value={currentPreset}
                                            onChange={(val) => {
                                                const [cont, rank] = String(val).split('+');
                                                try {
                                                    layered.set('diagram.layout.CONTAINMENT_POLICY', cont, ConfigLayer.USER);
                                                    layered.set('diagram.layout.RANK_MODE', rank, ConfigLayer.USER);
                                                    onRefreshRequest();
                                                } catch { }
                                            }}
                                            popupMatchSelectWidth={false}
                                            optionLabelProp="label"
                                        >
                                            {presets.map(p => (
                                                <Select.Option key={p.key} value={p.key} label={p.label}>
                                                    <div title={p.desc} style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 600 }}>{p.label}</span>
                                                        <span style={{ fontSize: 12, color: '#666' }}>{p.desc}</span>
                                                    </div>
                                                </Select.Option>
                                            ))}
                                        </Select>
                                    );
                                }
                                return (
                                    <Select
                                        className="w-full"
                                        value={nodeLayoutStrategy}
                                        onChange={async (val) => {
                                            await onNodeLayoutStrategyChange(val as string);
                                            onRefreshRequest();
                                        }}
                                        disabled={!selectable}
                                        popupMatchSelectWidth={false}
                                        optionLabelProp="label"
                                    >
                                        {(() => {
                                            const all = LayoutStrategyManager.getShared().getAvailableNodeStrategies();
                                            const norm2 = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                                            const isDomainVert = (norm2 === 'domainvertical' || norm2 === 'domainverticallayout');
                                            const isDomainHoriz = (norm2 === 'domainhorizontal' || norm2 === 'domainhorizontallayout');
                                            const isCytoscape = (s: any) => {
                                                const name = String(s?.getName?.() ?? '').toLowerCase();
                                                return name.includes('cytoscapefcose') || name.includes('cytoscapeconcentric');
                                            };
                                            const allowed = (!selectable)
                                                ? []
                                                : (isDomainVert || isDomainHoriz)
                                                    ? all.filter(({ strategy }) => !isCytoscape(strategy))
                                                    : all;

                                            const options: React.ReactNode[] = [];
                                            for (const { type, strategy } of allowed) {
                                                options.push(
                                                    <Select.Option key={type} value={type} label={strategy.getName?.() ?? type}>
                                                        {renderStrategyOptionContent(strategy)}
                                                    </Select.Option>
                                                );
                                            }
                                            if (!options.length) {
                                                return [
                                                    <Select.Option key={'auto-disabled'} value={nodeLayoutStrategy} label={t('designer.settings.autoDisabled')}>
                                                        <div title={t('designer.settings.autoDisabledDesc')} style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <span style={{ fontWeight: 600 }}>{t('designer.settings.autoDisabled')}</span>
                                                            <span style={{ fontSize: 12, color: '#666' }}>{t('designer.settings.autoDisabledDesc')}</span>
                                                        </div>
                                                    </Select.Option>
                                                ];
                                            }
                                            return options;
                                        })()}
                                    </Select>
                                );
                            })()}
                        </div>
                    </div>

                    {/* ===== 仅显示主分支 ===== */}
                    <div className={`flex items-center justify-between gap-3 py-2.5 px-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${isMainFlowToggleSupported ? '' : 'opacity-50'}`}>
                        <span
                            className="text-[13px] font-medium text-gray-700 dark:text-gray-300 cursor-pointer whitespace-nowrap"
                            onClick={() => { if (isMainFlowToggleSupported) onShowOnlyMainFlowChange(!showOnlyMainFlow); }}
                        >
                            {t('designer.settings.showMainFlow')}
                        </span>
                        <Switch
                            checked={showOnlyMainFlow}
                            onChange={(checked) => onShowOnlyMainFlowChange(checked)}
                            disabled={!isMainFlowToggleSupported}
                        />
                    </div>

                </div>
            </div>

            {/* ===== 底部操作区 ===== */}
            <div style={{ padding: '0 16px 16px 16px' }}>
                <button
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-black/[0.06] dark:border-white/[0.06] rounded-[8px] bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-[13px] font-medium text-gray-600 dark:text-gray-400 cursor-pointer transition-all active:scale-[0.98]"
                  onClick={() => setIsPanelOpen(true)}>
                    <FaCog className="text-gray-400 dark:text-gray-500 text-[12px]" />
                    {t('designer.settings.advancedConfig')}
                </button>
            </div>

            <ConfigurationPanel
                isOpen={isPanelOpen}
                onClose={() => setIsPanelOpen(false)}
            />
        </div>
    );
};
