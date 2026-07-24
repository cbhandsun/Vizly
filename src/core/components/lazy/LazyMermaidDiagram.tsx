/**
 * Mermaid图表懒加载组件
 * 只在需要时加载Mermaid库，减少初始bundle体积
 */

import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

// 懒加载Mermaid组件（如果存在）
const MermaidDiagram = lazy(() =>
    import('../diagrams/MermaidDiagram')
        .catch(() =>
            Promise.resolve({
                default: () => (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                        Mermaid图表组件未配置
                    </div>
                )
            })
        )
);

export interface LazyMermaidDiagramProps {
    id?: string;
    title?: string;
    [key: string]: unknown;
    loading?: React.ReactNode;
}

export const LazyMermaidDiagram: React.FC<LazyMermaidDiagramProps> = ({
    loading,
    ...props
}) => {
    const defaultLoading = (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            minHeight: '200px'
        }}>
            <Spin size="large" />
            <div style={{ color: '#1677ff' }}>加载Mermaid图表...</div>
        </div>
    );

    return (
        <Suspense fallback={loading || defaultLoading}>
            <MermaidDiagram {...props} />
        </Suspense>
    );
};

export default LazyMermaidDiagram;
