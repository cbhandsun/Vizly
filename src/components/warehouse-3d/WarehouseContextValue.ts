import { createContext } from 'react';

export interface Warehouse3DContextType {
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

export const Warehouse3DContext = createContext<Warehouse3DContextType | undefined>(undefined);
