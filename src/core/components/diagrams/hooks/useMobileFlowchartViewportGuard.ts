import { useCallback, useEffect, useRef } from 'react';
import type { Node } from '@xyflow/react';

import { shouldFitFlowchartAfterMobileTransition } from '../flowchartResponsiveChrome';

interface UseMobileFlowchartViewportGuardOptions {
    isMobile: boolean;
    getNodes: () => Node[];
    fitView: () => void;
}

export const useMobileFlowchartViewportGuard = ({
    isMobile,
    getNodes,
    fitView,
}: UseMobileFlowchartViewportGuardOptions): void => {
    const wasMobileRef = useRef(isMobile);

    useEffect(() => {
        const shouldFit = shouldFitFlowchartAfterMobileTransition(
            wasMobileRef.current,
            isMobile,
            getNodes().length,
        );
        wasMobileRef.current = isMobile;
        if (!shouldFit) return;

        const timer = window.setTimeout(fitView, 160);
        return () => window.clearTimeout(timer);
    }, [fitView, getNodes, isMobile]);
};

export const useScheduledFlowchartFit = (
    fitView: () => void,
    delayMs: number,
): (() => void) => useCallback(() => {
    window.setTimeout(fitView, delayMs);
}, [delayMs, fitView]);
