import React from 'react';
import { Text } from '@react-three/drei';
import { WAREHOUSE } from './constants';
import { useWarehouse3D } from './useWarehouse3D';

const FloatingLabel: React.FC<{ position: [number, number, number], text: string, color?: string }> = ({ position, text, color = WAREHOUSE.COLORS.ZONE_LABELS }) => {
    return (
        <Text
            position={[position[0], position[1] + 2, position[2]]} // Lift slightly higher
            fontSize={5}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.2}
            outlineColor="white"
            renderOrder={10} // Ensure it renders on top of transparent objects
        >
            {text}
        </Text>
    );
};

const Zones: React.FC = () => {
    const { showLabels } = useWarehouse3D();

    if (!showLabels) return null;

    return (
        <group>
            {/* 1: 入库接收月台 (Inbound Docks) */}
            <FloatingLabel position={[WAREHOUSE.LEFT_EDGE - 10, 15, 0]} text="入库接收月台" color="#2980b9" />

            {/* 2: 收货暂存/质检区 */}
            <FloatingLabel position={[WAREHOUSE.INBOUND_AREA_X, 12, 0]} text="收货暂存/质检区" />

            {/* 3: 高位托盘货架存储区 */}
            <FloatingLabel position={[(WAREHOUSE.HIGH_BAY_X[0] + WAREHOUSE.HIGH_BAY_X[1]) / 2, 22, 0]} text="高位托盘货架存储区" />

            {/* 4: 自动化立体仓库 (AS/RS) */}
            <FloatingLabel position={[0, 28, 0]} text="自动化立体仓库\n(AS/RS)" color="#c0392b" />

            {/* 5: 多层阁楼拣选区 */}
            <FloatingLabel position={[65, 12, -20]} text="多层阁楼拣选区\n(电子标签/RF)" />

            {/* 6: 高速自动分拣输送系统 */}
            <FloatingLabel position={[110, 8, 0]} text="高速自动分拣输送系统" color="#16a085" />

            {/* 7: 打包复核区 (Top and Bottom) */}
            <FloatingLabel position={[125, 6, -35]} text="打包复核区" />
            <FloatingLabel position={[125, 6, 35]} text="打包复核区" />

            {/* 8: 出库发运月台 (Bottom side horizontal) */}
            <FloatingLabel position={[135, 12, 60]} text="出库发运月台" color="#2980b9" />

            {/* 9: 分播区 / 发货集货区 */}
            <FloatingLabel position={[140, 6, 0]} text="分播区 / 发货集货区" />

            {/* 10: 出库发运月台 (Right side vertical) */}
            <FloatingLabel position={[WAREHOUSE.RIGHT_EDGE + 10, 15, 0]} text="出库发运月台" color="#2980b9" />

            {/* 11: Support Areas (Bottom Strip) */}
            <FloatingLabel position={[-110, 6, 75]} text="叉车充电区" />
            <FloatingLabel position={[-40, 6, 75]} text="设备维修间" />
            <FloatingLabel position={[20, 6, 75]} text="IT服务器机房/中控室" />
            <FloatingLabel position={[100, 6, 75]} text="办公管理/休息区" />
        </group>
    );
};

export default Zones;
