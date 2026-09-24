import { useContext } from 'react';
import { Warehouse3DContext } from './WarehouseContextValue';

export const useWarehouse3D = () => {
    const context = useContext(Warehouse3DContext);
    if (!context) throw new Error("useWarehouse3D must be used within Warehouse3DProvider");
    return context;
};
