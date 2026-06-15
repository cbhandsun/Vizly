import React from 'react';
import { useWarehouse3D } from './useWarehouse3D';
import { SyncOutlined, TagOutlined, RightCircleOutlined, ExpandOutlined } from '@ant-design/icons';

const ControlsOverlay: React.FC = () => {
    const {
        autoRotate, setAutoRotate,
        showLabels, setShowLabels,
        showFlow, setShowFlow,
        triggerResetView
    } = useWarehouse3D();

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md p-2 px-3 rounded-lg shadow-sm border border-white/10 z-10 transition-all duration-300">
            <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border-none cursor-pointer ${autoRotate ? 'bg-indigo-500 text-white shadow-inner' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                onClick={() => setAutoRotate(!autoRotate)}
            >
                <SyncOutlined className={`${autoRotate ? 'animate-spin-slow' : ''}`} /> 自动旋转
            </button>

            <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border-none cursor-pointer ${showLabels ? 'bg-indigo-500 text-white shadow-inner' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                onClick={() => setShowLabels(!showLabels)}
            >
                <TagOutlined /> 显示标签
            </button>

            <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors border-none cursor-pointer ${showFlow ? 'bg-emerald-600 text-white shadow-inner' : 'bg-transparent text-slate-300 hover:bg-white/10 hover:text-white'}`}
                onClick={() => setShowFlow(!showFlow)}
            >
                <RightCircleOutlined /> 物流动态
            </button>

            <div className="w-[1px] h-4 bg-white/10 mx-1"></div>

            <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-transparent hover:bg-white/10 text-slate-300 hover:text-white text-[13px] font-medium transition-colors border-none cursor-pointer"
                onClick={triggerResetView}
            >
                <ExpandOutlined /> 重置视角
            </button>
        </div>
    );
};

export default ControlsOverlay;
