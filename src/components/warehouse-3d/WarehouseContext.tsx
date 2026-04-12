import React, { createContext, useContext, useState } from 'react';

interface Warehouse3DContextType {
    autoRotate: boolean;
    setAutoRotate: (v: boolean) => void;
    showLabels: boolean;
    setShowLabels: (v: boolean) => void;
    showFlow: boolean;
    setShowFlow: (v: boolean) => void;
    showRealism: boolean;
    setShowRealism: (v: boolean) => void;
    resetViewTrigger: number;
    triggerResetView: () => void;
}

const Warehouse3DContext = createContext<Warehouse3DContextType | undefined>(undefined);

export const Warehouse3DProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [autoRotate, setAutoRotate] = useState(false);
    const [showLabels, setShowLabels] = useState(true);
    const [showFlow, setShowFlow] = useState(true);
    const [showRealism, setShowRealism] = useState(true);
    const [resetViewTrigger, setResetViewTrigger] = useState(0);

    const triggerResetView = () => setResetViewTrigger(prev => prev + 1);

    return (
        <Warehouse3DContext.Provider value={{
            autoRotate, setAutoRotate,
            showLabels, setShowLabels,
            showFlow, setShowFlow,
            showRealism, setShowRealism,
            resetViewTrigger, triggerResetView
        }}>
            {children}
        </Warehouse3DContext.Provider>
    );
};

export const useWarehouse3D = () => {
    const context = useContext(Warehouse3DContext);
    if (!context) throw new Error("useWarehouse3D must be used within Warehouse3DProvider");
    return context;
};
