import type { CSSProperties, ReactNode } from 'react';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { FaKeyboard, FaMap, FaRuler } from 'react-icons/fa';

const COMMERCIAL_TOUCH_ROW_STYLE: CSSProperties = {
    minHeight: 'var(--commercial-touch-target, 44px)',
};

interface FlowchartCanvasSettingsContentProps {
    gridInfo: { title: string; icon: ReactNode; stateLabel: string };
    onShowShortcuts: () => void;
    showGrid: boolean;
    showMinimap?: boolean;
    showRuler: boolean;
    toggleGrid: () => void;
    toggleMinimap?: () => void;
    toggleRuler: () => void;
}

export function FlowchartCanvasSettingsContent({
    gridInfo,
    onShowShortcuts,
    showGrid,
    showMinimap,
    showRuler,
    toggleGrid,
    toggleMinimap,
    toggleRuler,
}: FlowchartCanvasSettingsContentProps) {
    const { t } = useTranslation();
    const onLabel = t('common.on', '开启');
    const offLabel = t('common.off', '关闭');
    const stateDot = (active: boolean) => (
        <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300 dark:bg-slate-700'}`}
        />
    );
    const stateIndicator = (active: boolean, label: string) => (
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span>{label}</span>
            {stateDot(active)}
        </span>
    );

    return (
        <div className="p-1 min-w-[180px]">
            <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t('designer.toolbar.canvasSettings', '画布设置')}
            </div>
            <div className="flex flex-col gap-0.5">
                <Button
                    type="text"
                    block
                    aria-label={showMinimap ? t('designer.toolbar.hideMinimap', '隐藏小地图') : t('designer.toolbar.showMinimap', '显示小地图')}
                    aria-pressed={Boolean(showMinimap)}
                    disabled={!toggleMinimap}
                    className="flex items-center justify-between h-9 px-2 hover:bg-slate-100 dark:hover:bg-white/5"
                    style={COMMERCIAL_TOUCH_ROW_STYLE}
                    onClick={toggleMinimap}
                >
                    <span className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                        <FaMap className="text-[14px]" /> {t('designer.toolbar.minimap', '小地图')}
                    </span>
                    {stateIndicator(Boolean(showMinimap), showMinimap ? onLabel : offLabel)}
                </Button>
                <Button
                    type="text"
                    block
                    aria-label={showRuler ? t('designer.toolbar.hideRuler') : t('designer.toolbar.showRuler')}
                    aria-pressed={showRuler}
                    className="flex items-center justify-between h-9 px-2 hover:bg-slate-100 dark:hover:bg-white/5"
                    style={COMMERCIAL_TOUCH_ROW_STYLE}
                    onClick={toggleRuler}
                >
                    <span className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                        <FaRuler className="text-[14px]" /> {t('designer.toolbar.ruler', '标尺')}
                    </span>
                    {stateIndicator(showRuler, showRuler ? onLabel : offLabel)}
                </Button>
                <Button
                    type="text"
                    block
                    aria-label={gridInfo.title}
                    aria-pressed={showGrid}
                    className="flex items-center justify-between h-9 px-2 hover:bg-slate-100 dark:hover:bg-white/5"
                    style={COMMERCIAL_TOUCH_ROW_STYLE}
                    onClick={toggleGrid}
                >
                    <span className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                        <span aria-hidden="true" className="text-[14px]">{gridInfo.icon}</span>
                        {t('designer.toolbar.grid', '网格')}
                    </span>
                    {stateIndicator(showGrid, gridInfo.stateLabel)}
                </Button>
                <div className="h-[1px] bg-slate-100 dark:bg-white/5 my-1" />
                <Button
                    type="text"
                    block
                    className="flex items-center gap-2 h-9 px-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5"
                    style={COMMERCIAL_TOUCH_ROW_STYLE}
                    onClick={onShowShortcuts}
                >
                    <FaKeyboard className="text-[14px]" /> {t('designer.toolbar.shortcuts', '快捷键')}
                </Button>
            </div>
        </div>
    );
}
