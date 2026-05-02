// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Switch } from 'antd';
import { 
    Palette, 
    Zap, 
    Layers, 
    Settings2, 
    LineChart, 
    Filter, 
    ChevronRight,
    Cpu,
    Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
    }, [layoutStrategy, nodeLayoutStrategy, onNodeLayoutStrategyChange, onRefreshRequest]);

    const renderStrategyOptionContent = (s: { getName?: () => string; getDescription?: () => string }) => {
        const name = s?.getName?.() ?? '';
        const desc = s?.getDescription?.() ?? name;
        return (
            <div title={desc} className="flex flex-col py-1">
                <span className="font-semibold text-gray-800 dark:text-gray-100 text-[13px]">{name}</span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{desc}</span>
            </div>
        );
    };

    const SettingRow = ({ icon: Icon, label, children, description, disabled = false }: any) => (
        <div className={`group flex items-start justify-between gap-4 px-5 py-3.5 transition-all duration-300 ${disabled ? 'opacity-40 pointer-events-none' : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.02]'}`}>
            <div className="flex items-start gap-4 min-w-0 flex-1">
                <div className="flex-shrink-0 mt-0 w-9 h-9 rounded-[6px] bg-black/[0.03] dark:bg-white/5 border border-black/[0.04] dark:border-white/[0.04] flex items-center justify-center group-hover:scale-105 group-hover:shadow-sm group-hover:bg-white dark:group-hover:bg-white/10 transition-all duration-300">
                    <Icon size={18} className="text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white" />
                </div>
                <div className="flex flex-col min-w-0 flex-1 justify-center min-h-[36px]">
                    <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-100 leading-tight">{label}</span>
                    {description && (
                        <span className="text-[12px] text-gray-500 dark:text-gray-400 leading-relaxed pr-4">
                            {description}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex-shrink-0 flex items-center justify-end pt-1">
                {children}
            </div>
        </div>
    );

    const SectionHeader = ({ title, first }: { title: string, first?: boolean }) => (
        <div className={`px-2 pb-2 ${first ? 'pt-0' : 'pt-4'}`}>
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400/80">{title}</span>
        </div>
    );

    return (
        <div className="flex flex-col w-full h-full bg-slate-100/80 dark:bg-black/30 overflow-hidden">
            {/* 遵循全局令牌系统的响应式滚动容器 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-7 py-5">
                <div className="w-full max-w-full sm:max-w-2xl lg:max-w-5xl mx-auto flex flex-col gap-1.5">
                
                {/* 视觉风格组 */}
                <SectionHeader title={t('designer.settings.group.visual', '外观视觉')} first={true} />
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-[#1A1A1C]/60 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.08] rounded-[var(--glass-radius)] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
                    <SettingRow 
                        icon={Palette} 
                        label={t('designer.settings.theme', '颜色主题')}
                        description={t('designer.settings.themeDesc', '定义图表的全局配色方案')}
                    >
                        <div className="min-w-[120px]">
                            <EnhancedThemeSelector
                                borderless={true}
                                showPresets={true}
                                showCustomThemes={true}
                                showImportExport={true}
                                className="w-full text-right font-semibold"
                            />
                        </div>
                    </SettingRow>
                    
                    <div className="h-[1px] ml-[68px] bg-black/[0.04] dark:bg-white/[0.06]" />
                    
                    <SettingRow 
                        icon={Sparkles} 
                        label={t('designer.settings.style', '线条风格')}
                        description={t('designer.settings.styleDesc', '调整节点与连线的艺术形式')}
                    >
                        <div className="min-w-[120px]">
                            <EnhancedStyleSwitcher borderless={true} size="sm" className="w-full text-right font-semibold" />
                        </div>
                    </SettingRow>
                </motion.div>

                {/* 引擎策略组 */}
                <SectionHeader title={t('designer.settings.group.engine', '引擎策略')} />
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white dark:bg-[#1A1A1C]/60 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.08] rounded-[var(--glass-radius)] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
                    <SettingRow 
                        icon={Zap} 
                        label={t('designer.settings.edgeMode')}
                        description={t('designer.settings.edgeModeDesc', '决定连线的避障与寻路逻辑')}
                    >
                        <Select
                            variant="borderless"
                            className="text-right font-bold text-indigo-600 dark:text-indigo-400 min-w-[140px]"
                            value={(edgeMode as string) === 'smart' ? 'advanced-smart' : edgeMode}
                            onChange={(val) => onEdgeModeChange(val as 'advanced-smart' | 'native')}
                            popupMatchSelectWidth={false}
                        >
                            <Select.Option value="advanced-smart">{t('designer.settings.smart')}</Select.Option>
                            <Select.Option value="native">{t('designer.settings.native')}</Select.Option>
                        </Select>
                    </SettingRow>

                    <div className="h-[1px] ml-[68px] bg-black/[0.04] dark:bg-white/[0.06]" />

                    <SettingRow 
                        icon={Layers} 
                        label={t('designer.settings.layoutStrategy')}
                        description={t('designer.settings.layoutStrategyDesc', '全局拓扑排列的核心算法')}
                        disabled={!isLayoutSwitchSupported}
                    >
                        <Select
                            variant="borderless"
                            className="text-right font-bold text-gray-700 dark:text-gray-300 min-w-[140px]"
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
                    </SettingRow>

                    <div className="h-[1px] ml-[68px] bg-black/[0.04] dark:bg-white/[0.06]" />

                    <SettingRow 
                        icon={Cpu} 
                        label={(() => {
                            const norm = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                            const isDomainElk = norm === 'domainelk' || norm === 'domainelklayout';
                            return isDomainElk ? t('designer.settings.elkAlgorithm') : t('designer.settings.nodeLayout');
                        })()}
                        description={t('designer.settings.nodeLayoutDesc', '子域内节点的排布微调')}
                    >
                        {(() => {
                            const norm = String(layoutStrategy || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[+_\-]/g, '');
                            const isDomainElk = norm === 'domainelk' || norm === 'domainelklayout';
                            if (isDomainElk) {
                                return (
                                    <Select
                                        variant="borderless"
                                        className="text-right font-bold text-gray-700 dark:text-gray-300 min-w-[140px]"
                                        value={elkAlgorithm}
                                        onChange={(val) => onElkAlgorithmChange(String(val || 'layered'))}
                                        popupMatchSelectWidth={false}
                                        optionLabelProp="label"
                                    >
                                        <Select.Option key={'elk-layered'} value={'layered'} label={t('designer.settings.elk.layered.title')}>
                                            {renderStrategyOptionContent({ getName: () => t('designer.settings.elk.layered.title'), getDescription: () => t('designer.settings.elk.layered.desc') })}
                                        </Select.Option>
                                        <Select.Option key={'elk-mrtree'} value={'mrtree'} label={t('designer.settings.elk.mrtree.title')}>
                                            {renderStrategyOptionContent({ getName: () => t('designer.settings.elk.mrtree.title'), getDescription: () => t('designer.settings.elk.mrtree.desc') })}
                                        </Select.Option>
                                        <Select.Option key={'elk-force'} value={'force'} label={t('designer.settings.elk.force.title')}>
                                            {renderStrategyOptionContent({ getName: () => t('designer.settings.elk.force.title'), getDescription: () => t('designer.settings.elk.force.desc') })}
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
                                        variant="borderless"
                                        className="text-right font-bold text-gray-700 dark:text-gray-300 min-w-[140px]"
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
                                                {renderStrategyOptionContent({ getName: () => p.label, getDescription: () => p.desc })}
                                            </Select.Option>
                                        ))}
                                    </Select>
                                );
                            }
                            return (
                                <Select
                                    variant="borderless"
                                    className="text-right font-bold text-gray-700 dark:text-gray-300 min-w-[140px]"
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
                                                    {renderStrategyOptionContent({ getName: () => t('designer.settings.autoDisabled'), getDescription: () => t('designer.settings.autoDisabledDesc') })}
                                                </Select.Option>
                                            ];
                                        }
                                        return options;
                                    })()}
                                </Select>
                            );
                        })()}
                    </SettingRow>
                </motion.div>

                {/* 视图控制组 */}
                <SectionHeader title={t('designer.settings.group.view', '视图控制')} />
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white dark:bg-[#1A1A1C]/60 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.08] rounded-[var(--glass-radius)] overflow-hidden shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]">
                    <SettingRow 
                        icon={Filter} 
                        label={t('designer.settings.showMainFlow')}
                        description={t('designer.settings.showMainFlowDesc', '过滤辅助分支，仅展示核心业务动线')}
                        disabled={!isMainFlowToggleSupported}
                    >
                        <Switch
                            checked={showOnlyMainFlow}
                            onChange={(checked) => onShowOnlyMainFlowChange(checked)}
                            disabled={!isMainFlowToggleSupported}
                        />
                    </SettingRow>
                </motion.div>

                {/* 高级配置入口 */}
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mt-6 mb-2">
                    <button
                        className="w-full group relative flex items-center justify-between p-4 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 border border-black/[0.08] dark:border-white/10 rounded-[var(--glass-radius)] cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-300 active:scale-[0.99]"
                        onClick={() => setIsPanelOpen(true)}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-[6px] bg-gradient-to-b from-gray-800 to-black hover:from-gray-700 hover:to-gray-900 dark:from-gray-200 dark:to-white flex items-center justify-center text-white dark:text-black shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] transition-transform duration-300">
                                <Settings2 size={18} />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">{t('designer.settings.advancedConfig')}</span>
                                <span className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight pr-2">{t('designer.settings.advancedConfigDesc', '精细化几何参数与避障权重调节')}</span>
                            </div>
                        </div>
                        <div className="w-7 h-7 rounded-[6px] bg-black/[0.03] dark:bg-white/5 flex items-center justify-center group-hover:bg-black/[0.08] dark:group-hover:bg-white/10 text-gray-500 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-all">
                            <ChevronRight size={16} />
                        </div>
                    </button>
                </motion.div>
            </div>
        </div>
            
        <ConfigurationPanel
                isOpen={isPanelOpen}
                onClose={() => setIsPanelOpen(false)}
            />
        </div>
    );
};

