import React, { useEffect, useRef, useState, useCallback } from 'react';

interface LaserPointerProps {
    /** 是否激活激光笔（演示模式且用户开启） */
    active: boolean;
}

interface Trail {
    x: number;
    y: number;
    id: number;
    opacity: number;
}

let _trailId = 0;

/**
 * LaserPointer — 演示模式激光笔
 *
 * 渲染一个红色光点（带两圈扩散波纹）并在鼠标移动时留下短暂轨迹。
 * 完全基于 CSS + React state，无 Canvas 依赖，性能友好。
 */
const ActiveLaserPointer: React.FC = () => {
    const [pos, setPos] = useState({ x: -999, y: -999 });
    const [trails, setTrails] = useState<Trail[]>([]);
    const trailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        const x = e.clientX;
        const y = e.clientY;
        setPos({ x, y });

        // 每次移动追加一段轨迹，最多保留 8 个
        const newTrail: Trail = { x, y, id: ++_trailId, opacity: 0.6 };
        setTrails(prev => [...prev.slice(-7), newTrail]);

        // 300ms 后清除轨迹
        if (trailTimer.current) clearTimeout(trailTimer.current);
        trailTimer.current = setTimeout(() => setTrails([]), 300);
    }, []);

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            if (trailTimer.current) clearTimeout(trailTimer.current);
        };
    }, [handleMouseMove]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                pointerEvents: 'none',
                overflow: 'hidden',
            }}
        >
            {/* 轨迹拖尾 */}
            {trails.map((t, i) => (
                <div
                    key={t.id}
                    style={{
                        position: 'absolute',
                        left: t.x,
                        top: t.y,
                        width: 6 + i * 0.5,
                        height: 6 + i * 0.5,
                        borderRadius: '50%',
                        background: `rgba(239, 68, 68, ${0.08 + (i / trails.length) * 0.18})`,
                        transform: 'translate(-50%, -50%)',
                        transition: 'opacity 0.3s ease',
                        pointerEvents: 'none',
                    }}
                />
            ))}

            {/* 激光光点（核心） */}
            <div
                style={{
                    position: 'absolute',
                    left: pos.x,
                    top: pos.y,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }}
            >
                {/* 外层大波纹 */}
                <div style={{
                    position: 'absolute',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '1.5px solid rgba(239, 68, 68, 0.35)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    animation: 'laserRippleLarge 1.4s ease-out infinite',
                    pointerEvents: 'none',
                }} />
                {/* 中层波纹 */}
                <div style={{
                    position: 'absolute',
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    border: '1.5px solid rgba(239, 68, 68, 0.55)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    animation: 'laserRippleMedium 1.4s ease-out infinite 0.15s',
                    pointerEvents: 'none',
                }} />
                {/* 核心红点 */}
                <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, #ff2020 0%, #ef4444 60%, rgba(239,68,68,0) 100%)',
                    boxShadow: '0 0 8px 3px rgba(239, 68, 68, 0.6), 0 0 20px 6px rgba(239, 68, 68, 0.25)',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }} />
            </div>

            <style>{`
                @keyframes laserRippleLarge {
                    0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0.5; }
                    100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
                }
                @keyframes laserRippleMedium {
                    0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.7; }
                    100% { transform: translate(-50%, -50%) scale(1.4); opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export const LaserPointer: React.FC<LaserPointerProps> = ({ active }) => (
    active ? <ActiveLaserPointer /> : null
);
