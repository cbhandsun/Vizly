/**
 * 只读分享查看页面
 * 通过 URL query string 中的 token 参数加载并展示分享的图表
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spin, Result, theme, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { ReactFlowProvider } from '@xyflow/react';
import { shareService } from '@/services/ShareService';
import { dataService } from '@/services/DataService';
import { FlowchartDesigner, UnifiedDesigner } from '@/core';

const { Text } = Typography;

type LoadState =
    | { status: 'loading' }
    | { status: 'error' }
    | { status: 'success'; diagramData: any; title: string };

const ShareViewPage: React.FC = () => {
    const { t } = useTranslation();
    const { token: antToken } = theme.useToken();
    const [searchParams] = useSearchParams();
    const shareToken = searchParams.get('token') || '';
    const [state, setState] = useState<LoadState>(() => {
        if (!shareToken) return { status: 'error' };
        return { status: 'loading' };
    });

    useEffect(() => {
        if (!shareToken) return;

        let cancelled = false;

        (async () => {
            try {
                const result = await shareService.getSharedDiagram(shareToken);
                if (cancelled) return;

                if (!result) {
                    setState({ status: 'error' });
                    return;
                }

                const content = result.diagram.content;
                const title = content?.name || content?.metadata?.title || result.diagram.title || 'Shared Diagram';

                // 注册到 DataService 以便 GenericStandardDiagram 可以加载
                const diagramId = `shared-${shareToken}`;
                if (content) {
                    dataService.registerDiagram({ ...content, id: diagramId });
                }

                setState({ status: 'success', diagramData: content, title });
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
                <ReactFlowProvider>
                    <UnifiedDesigner 
                        pluginId="flowchart-designer"
                        id={diagramId}
                        isReadonly={true}
                    >
                        <FlowchartDesigner
                            id={diagramId}
                            isReadonly={true}
                        />
                    </UnifiedDesigner>
                </ReactFlowProvider>
            </div>
        </div>
    );
};

export default ShareViewPage;
