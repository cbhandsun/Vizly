import { useState, useCallback, useEffect } from 'react';
import { useStoreApi } from '@xyflow/react';

/**
 * GAP-11 Phase 3: Mobile Interactions Hook
 * 专门处理移动端手势状态，为画布提供性能模式切换和缩放数值反馈。
 */
export const useMobileInteractions = () => {
    const store = useStoreApi();
    const [isGesturing, setIsGesturing] = useState(false);
    const [currentZoom, setCurrentZoom] = useState(1);
    const [showOverlay, setShowOverlay] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768 || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // 监听 React Flow 视口变化来同步缩放比例
    useEffect(() => {
        if (!store) return;

        const unsubscribe = store.subscribe(
            (state) => {
                const zoom = state.transform[2];
                setCurrentZoom(Math.round(zoom * 100));
            }
        );

        return () => unsubscribe();
    }, [store]);

    // 触摸事件处理
    const handleTouchStart = useCallback((e: React.TouchEvent | TouchEvent) => {
        if (e.touches.length >= 2) {
            setIsGesturing(true);
            setShowOverlay(true);
        }
    }, []);

    const handleTouchEnd = useCallback(() => {
        setIsGesturing(false);
        // 延迟关闭 Overlay 增加视觉停留感
        setTimeout(() => setShowOverlay(false), 800);
    }, []);

    return {
        isGesturing,
        currentZoom,
        showOverlay,
        isMobile,
        handleTouchStart,
        handleTouchEnd
    };
};
