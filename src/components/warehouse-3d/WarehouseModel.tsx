import React, { useEffect, useState } from 'react';
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

interface WarehouseModelProps {
    onReady?: () => void;
}

const FIRST_DETAIL_DELAY_MS = 2500;
const SECOND_DETAIL_DELAY_MS = 5000;

const WarehouseModel: React.FC<WarehouseModelProps> = ({ onReady }) => {
    const [detailStage, setDetailStage] = useState(0);

    useEffect(() => {
        onReady?.();
        const firstStageTimer = window.setTimeout(() => setDetailStage(1), FIRST_DETAIL_DELAY_MS);
        const secondStageTimer = window.setTimeout(() => setDetailStage(2), SECOND_DETAIL_DELAY_MS);

        return () => {
            window.clearTimeout(firstStageTimer);
            window.clearTimeout(secondStageTimer);
        };
    }, [onReady]);

    return (
        <group>
            <Floor />
            <Zones />
            <DigitalTwinUI />
            {detailStage >= 1 && (
                <>
                    <Docks />
                    <Racks />
                    <AsrsSystem />
                    <StructuralElements />
                </>
            )}
            {detailStage >= 2 && (
                <>
                    <Conveyors />
                    <LogisticsFlow />
                    <SupportAreas />
                    <Vehicles />
                    <Trucks />
                    <Workers />
                </>
            )}
        </group>
    );
};

export default WarehouseModel;
