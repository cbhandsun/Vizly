/**
 * Monaco Editor 懒加载组件
 * 只在需要时才加载Monaco Editor，减少初始bundle体积
 */

import { lazy, Suspense, useState, useEffect } from 'react';
import { Spin } from 'antd';
import { loader } from '@monaco-editor/react';
import { logLazyMonacoCdnRaceFailure } from '../shared/componentFallbackLogging';

// 移除全量本地引用，使得打包彻底瘦身 4MB！
// import * as monaco from 'monaco-editor';

const MONACO_VERSION = '0.55.1';
const CDNS = [
    `https://unpkg.zhimg.com/monaco-editor@${MONACO_VERSION}/min/vs`, // 知乎优质镜像 (国内极快)
    `https://npm.elemecdn.com/monaco-editor@${MONACO_VERSION}/min/vs`, // 饿了么镜像 (国内极快)
    `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`, // JsDelivr 官方节点
    `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSION}/min/vs` // Cloudflare 兜底
];
const CDN_TIMEOUT_MS = 2500;

let cdnInitialized = false;

// 懒加载Monaco Editor React组件
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

const isAllowedMonacoCdn = (cdn: string): boolean => CDNS.includes(cdn);

const probeMonacoCdn = async (cdn: string): Promise<string> => {
    if (!isAllowedMonacoCdn(cdn)) throw new Error('Unexpected Monaco CDN');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CDN_TIMEOUT_MS);
    try {
        const res = await fetch(`${cdn}/loader.js`, {
            method: 'GET',
            signal: controller.signal,
            cache: 'force-cache',
        }).catch(() => null);
        if (res && res.ok) return cdn;
        throw new Error('CDN Unavailable');
    } finally {
        window.clearTimeout(timeout);
    }
};

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
                    CDNS.map(probeMonacoCdn)
                );
                loader.config({ paths: { vs: isAllowedMonacoCdn(fastest) ? fastest : CDNS[2] } });
            } catch (_e) {
                logLazyMonacoCdnRaceFailure();
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
