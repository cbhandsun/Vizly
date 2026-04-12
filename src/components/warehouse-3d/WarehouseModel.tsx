import React from 'react';
import Floor from './Floor';
import Racks from './Racks';
import Zones from './Zones';
import Conveyors from './Conveyors';
import AsrsSystem from './AsrsSystem';
import SupportAreas from './SupportAreas';
import Docks from './Docks';
import LogisticsFlow from './LogisticsFlow';
import Vehicles from './Vehicles';
import Trucks from './Trucks';
import Workers from './Workers';
import DigitalTwinUI from './DigitalTwinUI';
import StructuralElements from './StructuralElements';

const WarehouseModel: React.FC = () => {
    return (
        <group>
            <Floor />
            <Docks />
            <Racks />
            <AsrsSystem />
            <Conveyors />
            <LogisticsFlow />
            <Zones />
            <SupportAreas />
            <Vehicles />
            <Trucks />
            <Workers />
            <DigitalTwinUI />
            <StructuralElements />
        </group>
    );
};

export default WarehouseModel;
