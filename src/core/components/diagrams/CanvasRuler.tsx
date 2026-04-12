import React, { useMemo } from 'react';
import { useViewport } from '@xyflow/react';
import './CanvasRuler.css';

interface CanvasRulerProps {
    orientation: 'horizontal' | 'vertical';
    isDarkMode?: boolean;
}

interface Tick {
    position: number;      // 屏幕坐标位置
    worldPosition: number; // 世界坐标位置
    label: string;
    isMajor: boolean;
}

/**
 * 根据缩放级别计算刻度间隔
 */
const getTickInterval = (zoom: number): { major: number; minor: number } => {
    if (zoom < 0.25) return { major: 500, minor: 100 };
    if (zoom < 0.5) return { major: 200, minor: 50 };
    if (zoom < 1) return { major: 100, minor: 20 };
    if (zoom < 2) return { major: 50, minor: 10 };
    return { major: 25, minor: 5 };
};

/**
 * 计算刻度数组
 */
const useTicks = (
    orientation: 'horizontal' | 'vertical',
    viewport: { x: number; y: number; zoom: number },
    canvasSize: number
): Tick[] => {
    return useMemo(() => {
        const { x, y, zoom } = viewport;
        const { major, minor } = getTickInterval(zoom);

        // 计算可见世界坐标范围
        const offset = orientation === 'horizontal' ? x : y;
        const start = -offset / zoom;
        const end = start + canvasSize / zoom;

        // 计算起始刻度（对齐到minor间隔）
        const startTick = Math.floor(start / minor) * minor;
        const endTick = Math.ceil(end / minor) * minor;

        const ticks: Tick[] = [];

        // 生成刻度，限制最多200个
        for (let worldPos = startTick; worldPos <= endTick && ticks.length < 200; worldPos += minor) {
            const isMajor = worldPos % major === 0;

            // 转换为屏幕坐标
            const screenPos = (worldPos * zoom) + offset;

            // 跳过不可见刻度
            if (screenPos < 0 || screenPos > canvasSize) continue;

            ticks.push({
                position: screenPos,
                worldPosition: worldPos,
                label: worldPos.toString(),
                isMajor
            });
        }

        return ticks;
    }, [orientation, viewport, canvasSize]);
};

/**
 * CanvasRuler - 画布标尺组件
 * 显示水平或垂直标尺，跟随viewport变化更新
 */
export const CanvasRuler: React.FC<CanvasRulerProps> = React.memo(({
    orientation,
    isDarkMode = false
}) => {
    const viewport = useViewport();

    // 获取canvas尺寸
    const canvasSize = useMemo(() => {
        if (typeof window === 'undefined') return 1000;
        return orientation === 'horizontal' ? window.innerWidth : window.innerHeight;
    }, [orientation]);

    const ticks = useTicks(orientation, viewport, canvasSize);

    const RULER_THICKNESS = 24; // 更纤细现代的标尺
    const SAFE_TOP = 64;  // 避开顶部 Glassmorphism 浮岛工具栏
    const SAFE_LEFT = 56; // 避开左侧 IconRail 侧边栏
    const isHorizontal = orientation === 'horizontal';

    // 过滤掉不在安全区内的刻度线
    const visibleTicks = ticks.filter(tick => {
        if (isHorizontal) return tick.position >= (SAFE_LEFT + RULER_THICKNESS);
        return tick.position >= (SAFE_TOP + RULER_THICKNESS);
    });

    return (
        <svg
            className={`canvas-ruler canvas-ruler-${orientation} ${isDarkMode ? 'dark' : ''}`}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 99,
                pointerEvents: 'none',
            }}
        >
            {/* 标尺背景轨道 */}
            <rect
                x={isHorizontal ? SAFE_LEFT + RULER_THICKNESS : SAFE_LEFT}
                y={isHorizontal ? SAFE_TOP : SAFE_TOP + RULER_THICKNESS}
                width={isHorizontal ? `calc(100% - ${SAFE_LEFT + RULER_THICKNESS}px)` : RULER_THICKNESS}
                height={isHorizontal ? RULER_THICKNESS : `calc(100% - ${SAFE_TOP + RULER_THICKNESS}px)`}
                className="ruler-background"
            />

            {/* 刻度 */}
            {visibleTicks.map((tick, index) => {
                const tickLength = tick.isMajor ? 10 : 5;
                
                // 水平标尺的 X 就是物理屏幕坐标，Y 锁定在 SAFE_TOP 轨道范围内
                const x1 = isHorizontal ? tick.position : SAFE_LEFT + RULER_THICKNESS - tickLength;
                const y1 = isHorizontal ? SAFE_TOP + RULER_THICKNESS - tickLength : tick.position;
                const x2 = isHorizontal ? tick.position : SAFE_LEFT + RULER_THICKNESS;
                const y2 = isHorizontal ? SAFE_TOP + RULER_THICKNESS : tick.position;

                return (
                    <g key={`${tick.worldPosition}-${index}`}>
                        <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            className={tick.isMajor ? 'ruler-tick-major' : 'ruler-tick-minor'}
                        />
                        {tick.isMajor && (
                            <text
                                x={isHorizontal ? tick.position : SAFE_LEFT + RULER_THICKNESS - 12}
                                y={isHorizontal ? SAFE_TOP + 9 : tick.position}
                                className="ruler-label"
                                textAnchor={isHorizontal ? 'middle' : 'end'}
                                dominantBaseline={isHorizontal ? 'middle' : 'middle'}
                                style={{ fontSize: '9px' }}
                            >
                                {tick.label}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
});

/**
 * RulerCorner - 标尺角落填充块
 */
export const RulerCorner: React.FC<{ isDarkMode?: boolean }> = React.memo(({ isDarkMode = false }) => {
    const RULER_THICKNESS = 24;
    const SAFE_TOP = 64;
    const SAFE_LEFT = 56;

    return (
        <div
            className={`ruler-corner ${isDarkMode ? 'dark' : ''}`}
            style={{
                position: 'absolute',
                top: SAFE_TOP,
                left: SAFE_LEFT,
                width: RULER_THICKNESS,
                height: RULER_THICKNESS,
                zIndex: 99,
                pointerEvents: 'none',  
                opacity: 1 // 现在不再阻挡浮动UI，可以作为纯粹的装饰性拐角展示
            }}
        />
    );
});
