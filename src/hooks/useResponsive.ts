import { useState, useEffect } from 'react';

/**
 * Vizly Responsive Hook
 * 用于设备感知和屏幕尺寸判定，驱动不同的 UI 交互逻辑 (GAP-11)
 */
export const useResponsive = () => {
    const [isMobile, setIsMobile] = useState(false);
    const [isTablet, setIsTablet] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);

    useEffect(() => {
        const checkResponsive = () => {
            const width = window.innerWidth;
            setIsMobile(width < 768);
            setIsTablet(width >= 768 && width < 1024);
            setIsTouchDevice(
                ('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0)
            );
        };

        checkResponsive();
        window.addEventListener('resize', checkResponsive);
        return () => window.removeEventListener('resize', checkResponsive);
    }, []);

    return {
        isMobile,
        isTablet,
        isTouchDevice,
        isDesktop: !isMobile && !isTablet
    };
};
