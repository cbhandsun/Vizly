// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from 'antd';
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
        <div className="flex flex-col relative w-full h-full p-0">
            {/* ===== 外观设置区 ===== */}
            <div className="flex flex-col gap-3 p-4 border-b border-gray-200/50 dark:border-gray-700/50">
                <div className="flex items-center gap-3 *:flex-1">
                    <EnhancedThemeSelector
                        showPresets={true}
                        showCustomThemes={true}
                        showImportExport={true}
                    />
                    <EnhancedStyleSwitcher size="sm" />
                </div>
            </div>

            {/* ===== 布局设置区 ===== */}
            <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 last:border-b-0">
                <div className="grid grid-cols-[100px_1fr] max-[480px]:grid-cols-1 max-[480px]:gap-2.5 gap-[14px_16px] items-center">
                    {/* 连线模式 */}
                    <span className="text-[13px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap max-[480px]:mb-1">{t('designer.settings.edgeMode')}</span>
                    <div className="w-full">
                        <Select
                            className="top-action-select-antd"
                            value={(edgeMode as string) === 'smart' ? 'advanced-smart' : edgeMode}
                            onChange={(val) => onEdgeModeChange(val as 'advanced-smart' | 'native')}
                            style={{ width: '100%' }}
                            popupMatchSelectWidth={false}
                            getPopupContainer={(triggerNode) => (triggerNode.closest('.ant-popover') as HTMLElement) || document.getElementById(`diagram-${selectedDiagramId}`) || document.body}
                        >
                            <Select.Option value="advanced-smart">{t('designer.settings.smart')}</Select.Option>
                            <Select.Option value="native">{t('designer.settings.native')}</Select.Option>
                        </Select>
                    </div>

                    {/* 布局策略 */}
                    <span className="text-[13px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap max-[480px]:mb-1">{t('designer.settings.layoutStrategy')}</span>
                    <div className="w-full">
                        <Select
                            value={layoutStrategy}
                            disabled={!isLayoutSwitchSupported}
                            onChange={async (val) => {
                                const next = val as string;
                                await onLayoutStrategyChange(next);
                                try {
                                    const manager = LayoutStrategyManager.getShared();
                                    const autoNode = manager.getPreferredNodeStrategyForHierarchy(next);
                                    const selectable = manager.isNodeLayoutExternallySelectable(next);
                                    const norm = String(next).trim().toLowerCase().replace(/\s+/g, '').replace(/[+_-]/g, '');

                                    if (linkOrientationEnabled) {
                                        if (norm === 'domainhorizontallayout' || norm === 'domainhorizontal') {
                                            await onNodeLayoutStrategyChange('DagreLayout');
                                            onRefreshRequest();
                                        } else if (norm === 'domainverticallayout' || norm === 'domainvertical') {
                                            await onNodeLayoutStrategyChange('DagreLayout');
                                            onRefreshRequest();
                                        }
                                    }

                                    if (!selectable && autoNode) {
                                        await onNodeLayoutStrategyChange(autoNode);
                                        onRefreshRequest();
                                    }
                                } catch { }
                            }}
                            style={{ width: '100%' }}
                            popupMatchSelectWidth={false}
                            getPopupContainer={(triggerNode) => (triggerNode.closest('.ant-popover') as HTMLElement) || document.getElementById(`diagram-${selectedDiagramId}`) || document.body}
                            optionLabelProp="label"
                        >
                            {LayoutStrategyManager.getShared().getAvailableHierarchyStrategies().map(({ type, strategy }: { type: string, strategy: any }) => (
                                <Select.Option key={type} value={type} label={strategy.getName?.() ?? type}>
                                    {renderStrategyOptionContent(strategy)}
                                </Select.Option>
                            ))}
                        </Select>
                    </div>

                    {/* 节点布局/ELK算法 */}
                    <span className="text-[13px] text-gray-500 dark:text-gray-400 font-medium whitespace-nowrap max-[480px]:mb-1">{(() => {
                        const norm = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                        const isDomainElk = norm === 'domainelk' || norm === 'domainelklayout';
                        return isDomainElk ? t('designer.settings.elkAlgorithm') : t('designer.settings.nodeLayout');
                    })()}</span>
                    <div className="w-full">
                        {(() => {
                            const norm = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                            const isDomainElk = norm === 'domainelk' || norm === 'domainelklayout';
                            if (isDomainElk) {
                                return (
                                    <Select
                                        value={elkAlgorithm}
                                        onChange={(val) => onElkAlgorithmChange(String(val || 'layered'))}
                                        style={{ width: '100%' }}
                                        popupMatchSelectWidth={false}
                                        optionLabelProp="label"
                                        getPopupContainer={(triggerNode) => (triggerNode.closest('.ant-popover') as HTMLElement) || document.getElementById(`diagram-${selectedDiagramId}`) || document.body}
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
                            // 非域ELK：节点布局下拉
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
                                        value={currentPreset}
                                        onChange={(val) => {
                                            const [cont, rank] = String(val).split('+');
                                            try {
                                                layered.set('diagram.layout.CONTAINMENT_POLICY', cont, ConfigLayer.USER);
                                                layered.set('diagram.layout.RANK_MODE', rank, ConfigLayer.USER);
                                                onRefreshRequest();
                                            } catch { }
                                        }}
                                        style={{ width: '100%' }}
                                        popupMatchSelectWidth={false}
                                        getPopupContainer={(triggerNode) => (triggerNode.closest('.ant-popover') as HTMLElement) || document.getElementById(`diagram-${selectedDiagramId}`) || document.body}
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
                            // 普通节点布局选择
                            return (
                                <Select
                                    value={nodeLayoutStrategy}
                                    onChange={async (val) => {
                                        await onNodeLayoutStrategyChange(val as string);
                                        onRefreshRequest();
                                    }}
                                    style={{ width: '100%' }}
                                    disabled={!selectable}
                                    popupMatchSelectWidth={false}
                                    getPopupContainer={(triggerNode) => (triggerNode.closest('.ant-popover') as HTMLElement) || document.getElementById(`diagram-${selectedDiagramId}`) || document.body}
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
                </div >
            </div >

            {/* ===== 选项区 ===== */}
            <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 last:border-b-0">
                <label
                    className={`flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50/80 dark:bg-gray-800/50 rounded-lg cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-indigo-500 ${isMainFlowToggleSupported ? 'hover:bg-gray-100 dark:hover:bg-gray-700/50' : 'opacity-50 cursor-not-allowed'}`}
                >
                    <input
                        type="checkbox"
                        className="w-[18px] h-[18px] accent-indigo-500 cursor-inherit"
                        checked={showOnlyMainFlow}
                        onChange={(e) => onShowOnlyMainFlowChange(e.target.checked)}
                        disabled={!isMainFlowToggleSupported}
                    />
                    <span className="text-[13px] text-gray-700 dark:text-gray-200 font-medium">{t('designer.settings.showMainFlow')}</span>
                </label>
            </div>

            {/* ===== 底部操作区 ===== */}
            <div className="flex gap-2.5 px-4 py-3.5 bg-gray-50/80 dark:bg-gray-800/50 border-t border-gray-200/50 dark:border-gray-700/50">
                <button 
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-[13px] font-medium text-gray-700 dark:text-gray-200 cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-2"
                  onClick={() => setIsPanelOpen(true)}>
                    <FaCog />
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
