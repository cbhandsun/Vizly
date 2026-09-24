import React, { useState, useMemo } from 'react';
import { Warehouse3DContext } from './WarehouseContextValue';
import { shouldShowWarehouseLabelsByDefault } from './warehouse3DInteraction';

const getInitialViewportWidth = (): unknown => (
    typeof window === 'undefined' ? undefined : window.innerWidth
);

export const Warehouse3DProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [autoRotate, setAutoRotate] = useState(false);
    const [showLabels, setShowLabels] = useState(() => (
        shouldShowWarehouseLabelsByDefault(getInitialViewportWidth())
    ));
    const [showFlow, setShowFlow] = useState(true);
    const [showRealism, setShowRealism] = useState(true);
    const [resetViewTrigger, setResetViewTrigger] = useState(0);

    const triggerResetView = () => setResetViewTrigger(prev => prev + 1);

    const contextValue = useMemo(() => ({
        autoRotate, setAutoRotate,
        showLabels, setShowLabels,
        showFlow, setShowFlow,
        showRealism, setShowRealism,
        resetViewTrigger, triggerResetView
    }), [autoRotate, showLabels, showFlow, showRealism, resetViewTrigger]);

    return (
        <Warehouse3DContext.Provider value={contextValue}>
            {children}
        </Warehouse3DContext.Provider>
    );
};
