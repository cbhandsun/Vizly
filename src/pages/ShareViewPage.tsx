/**
 * 只读分享查看页面
 * 通过 URL query string 中的 token 参数加载并展示分享的图表
 */

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button, Result, Spin, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { coerceShareToken, getQueryOrHashParamFromLocation } from '@/core/utils/inputBoundary';
import {
    coerceShareViewTitle,
    createSharedDiagramLocalId,
    runShareViewRequest,
} from './shareViewBoundary';
import './ShareViewPage.css';

const { Text } = Typography;
const PRODUCT_NAME = 'Vizly';

const SharedDiagramCanvas = React.lazy(async () => {
    const [{ ReactFlowProvider }, { default: FlowchartDesigner }] = await Promise.all([
        import('@xyflow/react'),
        import('@/core/components/diagrams/FlowchartDesigner'),
    ]);

    return {
        default: ({ diagramId }: { diagramId: string }) => (
            <ReactFlowProvider>
                <FlowchartDesigner
                    pluginId="flowchart-designer"
                    id={diagramId}
                    isReadonly={true}
                />
            </ReactFlowProvider>
        ),
    };
});

type PreparedSharedDiagram = {
    diagramId: string;
    title: string;
};

type LoadState =
    | { status: 'loading' }
    | { status: 'not-found' }
    | { status: 'unavailable' }
    | { status: 'success'; diagramId: string; title: string };

const LoadingState = ({ label, compact = false }: { label: string; compact?: boolean }) => (
    <div
        className={compact ? 'share-view-loading share-view-loading--canvas' : 'share-view-loading'}
        role="status"
        aria-live="polite"
        aria-busy="true"
    >
        <Spin size="large" />
        <Text type="secondary">{label}</Text>
    </div>
);

const ShareViewStatePage = ({ children }: { children: React.ReactNode }) => (
    <div className="share-view-state-page">
        <header className="share-view-state-header">
            <Text className="share-view-product-name" strong>{PRODUCT_NAME}</Text>
        </header>
        <main className="share-view-state-content">{children}</main>
    </div>
);

const ShareViewPage: React.FC = () => {
    const { t } = useTranslation();
    const fallbackTitle = t('share.fallbackTitle');
    const [searchParams] = useSearchParams();
    const shareToken = coerceShareToken(
        searchParams.get('token')
        || getQueryOrHashParamFromLocation(
            typeof window === 'undefined' ? undefined : window.location,
            'token'
        )
        || ''
    ) || '';
    const [requestRevision, setRequestRevision] = useState(0);
    const [loadResult, setLoadResult] = useState<{
        revision: number;
        token: string;
        state: LoadState;
    } | null>(null);
    const state: LoadState = !shareToken
        ? { status: 'not-found' }
        : loadResult?.token === shareToken && loadResult.revision === requestRevision
            ? loadResult.state
            : { status: 'loading' };

    useEffect(() => {
        if (!shareToken) return;

        const controller = new AbortController();
        const revision = requestRevision;

        void (async () => {
            const request = await runShareViewRequest<PreparedSharedDiagram | null>(async (signal) => {
                const [{ shareService }, { dataService }] = await Promise.all([
                    import('@/services/ShareService'),
                    import('@/services/DataService'),
                ]);
                const result = await shareService.getSharedDiagram(shareToken, signal);
                if (!result) return null;

                const diagramId = createSharedDiagramLocalId(result.share.id);
                if (!diagramId || !result.diagram.content) {
                    throw new Error('Shared diagram record is invalid.');
                }

                const contentForRegistration = { ...result.diagram.content, id: diagramId };
                const content = dataService.registerRemoteDiagram(contentForRegistration, {
                    id: diagramId,
                    title: coerceShareViewTitle(result.diagram.title, fallbackTitle),
                });
                const title = coerceShareViewTitle(
                    content.name || content.metadata?.title,
                    result.diagram.title || fallbackTitle
                );

                return { diagramId, title };
            }, { signal: controller.signal });

            if (request.status === 'cancelled') return;
            if (request.status === 'timeout' || request.status === 'unavailable') {
                setLoadResult({
                    revision,
                    token: shareToken,
                    state: { status: 'unavailable' },
                });
                return;
            }
            if (!request.value) {
                setLoadResult({
                    revision,
                    token: shareToken,
                    state: { status: 'not-found' },
                });
                return;
            }

            setLoadResult({
                revision,
                token: shareToken,
                state: { status: 'success', ...request.value },
            });
        })();

        return () => controller.abort();
    }, [fallbackTitle, requestRevision, shareToken]);

    if (state.status === 'loading') {
        return (
            <ShareViewStatePage>
                <LoadingState label={t('share.loadingShared')} />
            </ShareViewStatePage>
        );
    }

    if (state.status === 'not-found') {
        return (
            <ShareViewStatePage>
                <Result
                    status="404"
                    title="404"
                    subTitle={t('share.notFound')}
                    extra={<Button href="#/manage">{t('share.backToWorkspace')}</Button>}
                />
            </ShareViewStatePage>
        );
    }

    if (state.status === 'unavailable') {
        return (
            <ShareViewStatePage>
                <Result
                    status="error"
                    title={t('share.viewerUnavailable')}
                    subTitle={t('share.viewerUnavailableHint')}
                    extra={[
                        <Button
                            key="retry"
                            type="primary"
                            onClick={() => setRequestRevision((current) => current + 1)}
                        >
                            {t('common.retry')}
                        </Button>,
                        <Button key="workspace" href="#/manage">
                            {t('share.backToWorkspace')}
                        </Button>,
                    ]}
                />
            </ShareViewStatePage>
        );
    }

    return (
        <div className="share-view-page">
            <header className="share-view-header">
                <Text className="share-view-title" strong title={state.title}>
                    {state.title}
                </Text>
                <div className="share-view-meta">
                    <Tag className="share-view-readonly-tag">{t('share.viewOnly')}</Tag>
                    <Text className="share-view-brand" type="secondary">
                        {t('share.poweredBy')}
                    </Text>
                </div>
            </header>

            <main className="share-view-canvas" aria-label={t('share.viewerLabel')}>
                <Suspense fallback={<LoadingState compact label={t('share.loadingCanvas')} />}>
                    <SharedDiagramCanvas diagramId={state.diagramId} />
                </Suspense>
            </main>
        </div>
    );
};

export default ShareViewPage;
