/**
 * Monaco Editor 懒加载组件
 * 只在需要时才加载Monaco Editor，减少初始bundle体积
 */

import { lazy, Suspense, useState, useEffect } from 'react';
import { Spin } from 'antd';
import { loader } from '@monaco-editor/react';

// 移除全量本地引用，使得打包彻底瘦身 4MB！
// import * as monaco from 'monaco-editor';

const MONACO_VERSION = '0.55.1';
const CDNS = [
    `https://unpkg.zhimg.com/monaco-editor@${MONACO_VERSION}/min/vs`, // 知乎优质镜像 (国内极快)
    `https://npm.elemecdn.com/monaco-editor@${MONACO_VERSION}/min/vs`, // 饿了么镜像 (国内极快)
    `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`, // JsDelivr 官方节点
    `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs` // Cloudflare 兜底
];

let cdnInitialized = false;

// 懒加载Monaco Editor React组件
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
    const [isConfigured, setIsConfigured] = useState(cdnInitialized);

    useEffect(() => {
        if (cdnInitialized) return;

        const raceCDNs = async () => {
            try {
                // 动态拉取测速：谁最快拉到 loader.js 就用谁做基准 CDN
                const fastest = await Promise.any(
                    CDNS.map(async (cdn) => {
                        const res = await fetch(`${cdn}/loader.js`, { method: 'GET' }).catch(() => null);
                        if (res && res.ok) return cdn;
                        throw new Error('CDN Unavailable');
                    })
                );
                loader.config({ paths: { vs: fastest } });
            } catch (e) {
                console.warn('[LazyMonacoEditor] CDN race failed, falling back to jsdelivr.');
                loader.config({ paths: { vs: CDNS[2] } }); // 故障兜底
            } finally {
                cdnInitialized = true;
                setIsConfigured(true);
            }
        };

        raceCDNs();
    }, []);

    const defaultLoading = (
        <div style={{ textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: 8, color: '#999' }}>正在连接最优节点加载编辑器...</div>
        </div>
    );

    if (!isConfigured) {
        return loading || defaultLoading;
    }

    return (
        <Suspense fallback={loading || defaultLoading}>
            <MonacoEditor {...props} />
        </Suspense>
    );
};

export default LazyMonacoEditor;
