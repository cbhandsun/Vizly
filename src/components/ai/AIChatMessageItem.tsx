import type { AIEditContext } from './aiCanvasEdit';
import React from 'react';
import Button from 'antd/es/button';
import Collapse from 'antd/es/collapse';
import Dropdown from 'antd/es/dropdown';
import Space from 'antd/es/space';
import Tooltip from 'antd/es/tooltip';
import Typography from 'antd/es/typography';
import {
    CheckCircleOutlined,
    CloudOutlined,
    CloudServerOutlined,
    CodeOutlined,
    DatabaseOutlined,
    DownOutlined,
    RobotOutlined,
} from '@ant-design/icons';

import type { Message } from '@/services/ai/AIConversationService';
import ShortcutsGuide from './ShortcutsGuide';

const MarkdownMessage = React.lazy(() => import('./MarkdownMessage'));

interface MessageItemProps {
    item: Message;
    t: (key: string) => string;
    onPreviewJson?: (json: string) => void;
    onApplyJson?: (json: string, context?: AIEditContext) => void;
    onSaveCurrentCanvas?: () => void;
    handleSaveDiagramTo?: (json: string, target: 'local' | 's3' | 'supabase') => void;
}

const MessageItem: React.FC<MessageItemProps> = ({
    item,
    t,
    onPreviewJson,
    onApplyJson,
    onSaveCurrentCanvas,
    handleSaveDiagramTo
}) => {
    const isAi = item.role === 'assistant';

    return (
        <div className={`ai-chat-message ${item.role}`}>
            <div className="ai-chat-bubble">
                <div className="ai-chat-bubble-content">
                    {item.reasoningContent && (
                        <div className="ai-chat-reasoning">
                            <Collapse
                                ghost
                                size="small"
                                expandIcon={({ isActive }) => <RobotOutlined style={{ color: isActive ? 'var(--color-primary-500, #1677ff)' : '#999', transition: 'all 0.3s' }} />}
                                items={[{
                                    key: 'reasoning',
                                    label: <Typography.Text type="secondary" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>{item.isStreaming ? (<span className="reasoning-pulse-dot" />) : null}{t('aiChat.reasoning') || 'Thinking Process...'}</Typography.Text>,
                                    children: (
                                        <div className="reasoning-content-inner">
                                            {item.reasoningContent}
                                        </div>
                                    )
                                }]}
                            />
                        </div>
                    )}

                    <div className="ai-markdown-content">
                        <React.Suspense fallback={<span className="ai-markdown-fallback">{item.content}</span>}>
                            <MarkdownMessage content={item.content} />
                        </React.Suspense>
                    </div>

                    {item.content && item.content.includes('正在为您准备快捷键指南...') && (
                        <ShortcutsGuide />
                    )}

                    {item.isStreaming && <span className="ai-chat-cursor" />}
                </div>

                {/* JSON Action Buttons - Capsule Toolbar */}
                {isAi && item.hasJson && item.jsonContent && (
                    <div className="ai-chat-actions-capsule">
                        <Space size={4} split={<div style={{ width: 1, height: 14, background: 'rgba(0,0,0,0.06)' }} />}>
                            <Tooltip title={t('aiChat.previewJson')}>
                                <Button
                                    type="text"
                                    size="small"
                                    className="action-icon-btn"
                                    icon={<CodeOutlined />}
                                    aria-label={t('aiChat.previewJson')}
                                    onClick={() => onPreviewJson?.(item.jsonContent!)}
                                />
                            </Tooltip>

                            {item.editContext ? <Button type="text" size="small" icon={<CloudOutlined />}
                                onClick={onSaveCurrentCanvas} disabled={!onSaveCurrentCanvas} aria-label={t('aiChat.edit.saveCanvas')}>{t('aiChat.edit.saveCanvas')}</Button> : <Dropdown
                                trigger={['click']}
                                menu={{
                                    items: [
                                        { key: 'local', label: t('aiChat.saveLocal'), icon: <DatabaseOutlined /> },
                                        { key: 'supabase', label: t('aiChat.saveCloud'), icon: <CloudOutlined /> },
                                        { key: 's3', label: t('aiChat.saveS3'), icon: <CloudServerOutlined /> },
                                    ],
                                    onClick: ({ key }) => {
                                        if (key === 'local' || key === 's3' || key === 'supabase') {
                                            handleSaveDiagramTo?.(item.jsonContent!, key);
                                        }
                                    }
                                }}
                            >
                                <Tooltip title={t('aiChat.saveDiagram')}>
                                    <Button
                                        type="text"
                                        size="small"
                                        className="action-icon-btn"
                                        icon={<DownOutlined />}
                                        aria-label={t('aiChat.saveDiagram')}
                                    />
                                </Tooltip>
                            </Dropdown>}

                            <Tooltip title={t('aiChat.applyToCanvas')}>
                                <Button
                                    size="small"
                                    type="primary"
                                    className="action-btn-apply-capsule"
                                    aria-label={t('aiChat.applyToCanvas')}
                                    icon={<CheckCircleOutlined />}
                                    onClick={() => item.editContext ? onApplyJson?.(item.jsonContent!, item.editContext) : onApplyJson?.(item.jsonContent!)}
                                >
                                    {t('aiChat.applyToCanvas')}
                                </Button>
                            </Tooltip>
                        </Space>
                    </div>
                )}
            </div>
        </div>
    );
};

export const MemoizedMessageItem = React.memo(MessageItem, (prev, next) => {
    return prev.item.content === next.item.content &&
           prev.item.isStreaming === next.item.isStreaming &&
           prev.item.reasoningContent === next.item.reasoningContent &&
           prev.item.hasJson === next.item.hasJson &&
           prev.item.jsonContent === next.item.jsonContent &&
           prev.item.role === next.item.role &&
           prev.item.editContext === next.item.editContext &&
           prev.onSaveCurrentCanvas === next.onSaveCurrentCanvas &&
           prev.t === next.t &&
           prev.onPreviewJson === next.onPreviewJson &&
           prev.onApplyJson === next.onApplyJson &&
           prev.handleSaveDiagramTo === next.handleSaveDiagramTo;
});
