/**
 * 3D图表组件占位符
 * 这是一个占位组件，用于满足Lazy3DViewer的导入需求
 * 当需要实现3D功能时，可以替换此文件
 */

import React from 'react';
import { Result } from 'antd';

interface ThreeDiagramProps {
    id?: string;
    title?: string;
    [key: string]: unknown;
}

const ThreeDiagram: React.FC<ThreeDiagramProps> = () => {
    return (
        <Result
            status="info"
            title="3D视图"
            subTitle="3D视图组件尚未实现。您可以在此处添加Three.js相关的3D渲染逻辑。"
        />
    );
};

export default ThreeDiagram;
