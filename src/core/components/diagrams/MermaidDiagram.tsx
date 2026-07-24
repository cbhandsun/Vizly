/**
 * Mermaid图表组件占位符
 * 这是一个占位组件，用于满足LazyMermaidDiagram的导入需求
 * 当需要实现Mermaid功能时，可以替换此文件
 */

import React from 'react';
import { Result } from 'antd';

export interface MermaidDiagramProps {
    id?: string;
    title?: string;
    [key: string]: unknown;
}

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ id: _id, title: _title }) => {
    return (
        <Result
            status="info"
            title="Mermaid图表"
            subTitle="Mermaid图表组件尚未实现。您可以在此处添加Mermaid图表渲染逻辑。"
        />
    );
};

export default MermaidDiagram;
