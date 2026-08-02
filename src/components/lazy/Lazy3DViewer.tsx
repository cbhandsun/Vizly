/**
 * 3D图表懒加载组件
 * 只在需要时加载Three.js相关库，减少初始bundle体积
 */

import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { Spin } from 'antd';
import { Warehouse3DProvider } from '../warehouse-3d/WarehouseContext';
import type { DiagramComponentProps } from '@/core/types/diagram-components';
import type { SceneProps } from '../warehouse-3d/Scene';

const WarehouseSceneLoadError: ComponentType<SceneProps> = () => (
    <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
        3D仓库视图组件加载失败，请检查配置。
    </div>
);

// 懒加载3D仓库场景组件
const WarehouseScene = lazy<ComponentType<SceneProps>>(() =>
    import('@/components/warehouse-3d/Scene')
        .catch(() =>
            Promise.resolve({
                default: WarehouseSceneLoadError
            })
        )
);

interface Lazy3DViewerProps extends DiagramComponentProps {
    loading?: ReactNode;
    onReady?: () => void;
}

export const Lazy3DViewer: React.FC<Lazy3DViewerProps> = ({
    loading,
    onReady,
}) => {
    const defaultLoading = (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            minHeight: '400px',
            background: '#f0f0f0'
        }}>
            <Spin size="large" />
            <div style={{ color: '#1677ff' }}>加载3D仓库视图...</div>
        </div>
    );

    return (
        <Suspense fallback={loading || defaultLoading}>
            <Warehouse3DProvider>
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <WarehouseScene onModelReady={onReady} />
                </div>
            </Warehouse3DProvider>
        </Suspense>
    );
};

export default Lazy3DViewer;
