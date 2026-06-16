/**
 * 只读分享查看页面
 * 通过 URL query string 中的 token 参数加载并展示分享的图表
 */

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spin, Result, theme, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const isLikelyShareToken = (token: string): boolean => /^[A-Za-z0-9_-]{16,128}$/.test(token);

const getShareTokenFromSearchParams = (searchParams: URLSearchParams): string => (
    searchParams.get('token') || new URLSearchParams(window.location.search).get('token') || ''
);

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

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'success'; title: string };

const ShareViewPage: React.FC = () => {
    const { t } = useTranslation();
    const { token: antToken } = theme.useToken();
    const [searchParams] = useSearchParams();
    const shareToken = getShareTokenFromSearchParams(searchParams);
    const [state, setState] = useState<LoadState>(() => {
        if (!isLikelyShareToken(shareToken)) return { status: 'error' };
        return { status: 'loading' };
    });

    useEffect(() => {
        if (!isLikelyShareToken(shareToken)) {
            setState({ status: 'error' });
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const { shareService } = await import('@/services/ShareService');
                const result = await shareService.getSharedDiagram(shareToken);
                if (cancelled) return;

                if (!result) {
                    setState({ status: 'error' });
                    return;
                }

                const rawContent = result.diagram.content;
                if (!rawContent) {
                    setState({ status: 'error' });
                    return;
                }

                // 注册到 DataService 以便 GenericStandardDiagram 可以加载
                const diagramId = `shared-${shareToken}`;
                const { dataService } = await import('@/services/DataService');
                if (cancelled) return;
                const contentForRegistration =
                    typeof rawContent === 'object' && rawContent !== null && !Array.isArray(rawContent)
                        ? { ...(rawContent as Record<string, unknown>), id: diagramId }
                        : rawContent;
                const content = dataService.registerRemoteDiagram(contentForRegistration, {
                    id: diagramId,
                    title: result.diagram.title || 'Shared Diagram',
                });
                const title = content.name || content.metadata?.title || result.diagram.title || 'Shared Diagram';

                setState({ status: 'success', title });
            } catch {
                if (!cancelled) setState({ status: 'error' });
            }
        })();

        return () => { cancelled = true; };
    }, [shareToken]);

    if (state.status === 'loading') {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                background: antToken.colorBgLayout,
            }}>
                <Spin size="large" />
                <Text type="secondary">{t('share.loadingShared')}</Text>
            </div>
        );
    }

    if (state.status === 'error') {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: antToken.colorBgLayout,
            }}>
                <Result
                    status="404"
                    title="404"
                    subTitle={t('share.notFound')}
                />
            </div>
        );
    }

    const diagramId = `shared-${shareToken}`;

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: antToken.colorBgLayout,
        }}>
            {/* 顶部标题栏 */}
            <div style={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 20px',
                borderBottom: `1px solid ${antToken.colorBorderSecondary}`,
                background: antToken.colorBgContainer,
                flexShrink: 0,
            }}>
                <Text strong style={{ fontSize: 16 }}>{state.title}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{t('share.poweredBy')}</Text>
            </div>

            {/* 图表区域 */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <Suspense fallback={null}>
                    <SharedDiagramCanvas diagramId={diagramId} />
                </Suspense>
            </div>
        </div>
    );
};

export default ShareViewPage;
