/**
 * Monaco Editor 懒加载组件
 * 只在需要时才加载Monaco Editor，减少初始bundle体积
 */

import { lazy, Suspense } from 'react';
import { Spin } from 'antd';

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// 配置 Monaco Editor 使用本地包，避免 CDN 连接超时
loader.config({ monaco });

// 懒加载Monaco Editor
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

export interface LazyMonacoEditorProps {
    value?: string;
    defaultValue?: string;
    language?: string;
    theme?: string;
    onChange?: (value: string | undefined) => void;
    options?: any;
    height?: string | number;
    width?: string | number;
    loading?: React.ReactNode;
    [key: string]: any;
}

export const LazyMonacoEditor: React.FC<LazyMonacoEditorProps> = ({
    loading,
    ...props
}) => {
    const defaultLoading = (
        <div style={{ textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: 8, color: '#999' }}>加载编辑器...</div>
        </div>
    );

    return (
        <Suspense fallback={loading || defaultLoading}>
            <MonacoEditor {...props} />
        </Suspense>
    );
};

export default LazyMonacoEditor;
