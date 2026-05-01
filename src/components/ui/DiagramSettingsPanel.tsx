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
        <div className={`group flex items-start justify-between gap-[var(--spacing-md)] px-[var(--spacing-md)] sm:px-[var(--spacing-lg)] py-[var(--spacing-md)] transition-all duration-[var(--transition-normal)] ${disabled ? 'opacity-40 pointer-events-none' : 'hover:bg-white/60 dark:hover:bg-white/10'}`}>
            <div className="flex items-start gap-[var(--spacing-md)] min-w-0 flex-1">
                <div className="flex-shrink-0 mt-0.5 w-10 h-10 rounded-[var(--radius-lg)] bg-gray-100/80 dark:bg-white/5 border border-black/[0.03] dark:border-white/[0.05] flex items-center justify-center group-hover:scale-110 group-hover:shadow-md group-hover:bg-indigo-50 dark:group-hover:bg-indigo-500/10 transition-all duration-[var(--transition-normal)]">
                    <Icon size={20} className="text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[15px] font-bold text-gray-800 dark:text-gray-100 leading-tight mb-1">{label}</span>
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

    const SectionHeader = ({ title }: { title: string }) => (
        <div className="px-6 pt-10 pb-4">
            <span className="text-[12px] font-black uppercase tracking-[0.15em] text-gray-400/80 dark:text-gray-500/60">{title}</span>
        </div>
    );

    return (
        <div className="flex flex-col w-full h-full bg-transparent overflow-hidden">
            {/* 遵循全局令牌系统的响应式滚动容器 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-[var(--spacing-md)] sm:p-[var(--spacing-lg)] lg:p-[var(--glass-padding-lg)]">
                <div className="w-full max-w-full sm:max-w-2xl lg:max-w-5xl mx-auto flex flex-col gap-[var(--glass-gap)] pb-[var(--spacing-xl)]">
                
                {/* 视觉风格组 */}
                <SectionHeader title={t('designer.settings.group.visual', '外观视觉')} />
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/50 dark:bg-white/[0.03] backdrop-blur-xl border border-black/[0.05] dark:border-white/[0.05] rounded-[var(--radius-xl)] overflow-hidden shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]">
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
                    
                    <div className="h-[1px] mx-[var(--spacing-lg)] bg-black/[0.04] dark:bg-white/[0.04]" />
                    
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
                    className="bg-white/50 dark:bg-white/[0.03] backdrop-blur-xl border border-black/[0.05] dark:border-white/[0.05] rounded-[var(--radius-xl)] overflow-hidden shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]">
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

                    <div className="h-[1px] mx-[var(--spacing-lg)] bg-black/[0.04] dark:bg-white/[0.04]" />

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

                    <div className="h-[1px] mx-[var(--spacing-lg)] bg-black/[0.04] dark:bg-white/[0.04]" />

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
                    className="bg-white/50 dark:bg-white/[0.03] backdrop-blur-xl border border-black/[0.05] dark:border-white/[0.05] rounded-[var(--radius-xl)] overflow-hidden shadow-[0_4px_12px_-4px_rgba(0,0,0,0.05)]">
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
                    className="mt-10 mb-2">
                    <button
                        className="w-full group relative flex items-center justify-between p-5 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 hover:from-indigo-500/15 hover:to-purple-500/15 dark:from-indigo-400/5 dark:to-purple-400/5 dark:hover:from-indigo-400/10 dark:hover:to-purple-400/10 border border-indigo-500/20 dark:border-indigo-400/10 rounded-[22px] cursor-pointer shadow-sm transition-all duration-300"
                        onClick={() => setIsPanelOpen(true)}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 group-hover:rotate-12 transition-transform duration-500">
                                <Settings2 size={22} />
                            </div>
                            <div className="flex flex-col text-left">
                                <span className="text-[15px] font-extrabold text-gray-800 dark:text-gray-100">{t('designer.settings.advancedConfig')}</span>
                                <span className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{t('designer.settings.advancedConfigDesc', '精细化几何参数与避障权重调节')}</span>
                            </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-black/[0.03] dark:bg-white/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all">
                            <ChevronRight size={18} />
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

