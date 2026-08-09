import React, { useEffect, useRef, useState } from 'react';
import { useWarehouse3D } from './useWarehouse3D';
import { SyncOutlined, TagOutlined, RightCircleOutlined, ExpandOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

const COMMERCIAL_CONTROL_STYLE: React.CSSProperties = {
    minHeight: '44px',
    minWidth: '44px',
};

const ControlsOverlay: React.FC = () => {
    const { t } = useTranslation();
    const {
        autoRotate, setAutoRotate,
        showLabels, setShowLabels,
        showFlow, setShowFlow,
        triggerResetView
    } = useWarehouse3D();
    const [resetFeedbackVisible, setResetFeedbackVisible] = useState(false);
    const resetFeedbackTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (resetFeedbackTimerRef.current !== null) {
            window.clearTimeout(resetFeedbackTimerRef.current);
        }
    }, []);

    const handleResetView = () => {
        triggerResetView();
        setResetFeedbackVisible(true);
        if (resetFeedbackTimerRef.current !== null) {
            window.clearTimeout(resetFeedbackTimerRef.current);
        }
        resetFeedbackTimerRef.current = window.setTimeout(() => {
            setResetFeedbackVisible(false);
            resetFeedbackTimerRef.current = null;
        }, 1600);
    };

    return (
        <div
            aria-label={t('diagram.warehouse3d.controlsLabel')}
            className="absolute bottom-6 left-1/2 z-20 flex max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-900/80 p-2 px-3 shadow-sm backdrop-blur-md transition-all duration-300"
            role="toolbar"
        >
            <button
                type="button"
                aria-pressed={autoRotate}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border-none cursor-pointer ${autoRotate ? 'bg-indigo-500 text-white shadow-inner' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                style={COMMERCIAL_CONTROL_STYLE}
                onClick={() => setAutoRotate(!autoRotate)}
            >
                <SyncOutlined aria-hidden="true" className={`${autoRotate ? 'animate-spin-slow' : ''}`} />
                {t('diagram.warehouse3d.autoRotate')}
            </button>

            <button
                type="button"
                aria-pressed={showLabels}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border-none cursor-pointer ${showLabels ? 'bg-indigo-500 text-white shadow-inner' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                style={COMMERCIAL_CONTROL_STYLE}
                onClick={() => setShowLabels(!showLabels)}
            >
                <TagOutlined aria-hidden="true" />
                {t('diagram.warehouse3d.showLabels')}
            </button>

            <button
                type="button"
                aria-pressed={showFlow}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border-none cursor-pointer ${showFlow ? 'bg-emerald-600 text-white shadow-inner' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                style={COMMERCIAL_CONTROL_STYLE}
                onClick={() => setShowFlow(!showFlow)}
            >
                <RightCircleOutlined aria-hidden="true" />
                {t('diagram.warehouse3d.showFlow')}
            </button>

            <div className="w-[1px] h-4 bg-white/10 mx-1"></div>

            <button
                type="button"
                aria-live="polite"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-transparent hover:bg-white/10 text-slate-300 hover:text-white text-[13px] font-medium transition-colors border-none cursor-pointer"
                style={COMMERCIAL_CONTROL_STYLE}
                onClick={handleResetView}
            >
                <ExpandOutlined aria-hidden="true" />
                {resetFeedbackVisible
                    ? t('diagram.warehouse3d.viewReset')
                    : t('diagram.warehouse3d.resetView')}
            </button>
        </div>
    );
};

export default ControlsOverlay;
