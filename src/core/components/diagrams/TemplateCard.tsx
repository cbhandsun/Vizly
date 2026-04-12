import React from 'react';
import { Card, Button, Tag, Tooltip, Popconfirm } from 'antd';
import { DeleteOutlined, RocketOutlined } from '@ant-design/icons';
import * as Icons from 'react-icons/fa';
import { DiagramTemplate } from '../../types/Template';
import { useTranslation } from 'react-i18next';

interface TemplateCardProps {
    template: DiagramTemplate;
    onUse: (templateId: string) => void;
    onDelete?: (templateId: string) => void;
}

/**
 * 模板卡片组件
 */
export const TemplateCard: React.FC<TemplateCardProps> = React.memo(({
    template,
    onUse,
    onDelete
}) => {
    const { t } = useTranslation();

    // 获取React Icon组件
    const IconComponent = template.icon ? (Icons as any)[template.icon] : Icons.FaFileAlt;

    // 卡片操作按钮
    const actions: React.ReactNode[] = [
        <Tooltip key="use" title={t('templates.useTemplate', '使用模板')}>
            <Button
                type="primary"
                size="small"
                icon={<RocketOutlined />}
                onClick={() => onUse(template.id)}
            >
                {t('templates.use', '使用')}
            </Button>
        </Tooltip>
    ];

    // 自定义模板显示删除按钮
    if (!template.isBuiltIn && onDelete) {
        actions.push(
            <Popconfirm
                key="delete"
                title={t('templates.confirmDelete', '确定删除此模板？')}
                onConfirm={() => onDelete(template.id)}
                okText={t('common.confirm', '确定')}
                cancelText={t('common.cancel', '取消')}
            >
                <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                >
                    {t('common.delete', '删除')}
                </Button>
            </Popconfirm>
        );
    }

    return (
        <Card
            hoverable
            className="template-card"
            actions={actions}
        >
            {/* 图标区域 */}
            <div className="template-card-icon" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '80px',
                fontSize: '48px',
                color: '#1890ff',
                marginBottom: '12px'
            }}>
                <IconComponent />
            </div>

            {/* 标题与描述 */}
            <Card.Meta
                title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{template.name}</span>
                        {template.isBuiltIn && (
                            <Tag color="blue" style={{ marginLeft: 8 }}>
                                {t('templates.builtin', '内置')}
                            </Tag>
                        )}
                    </div>
                }
                description={
                    <div>
                        <div style={{ marginBottom: 8, minHeight: '40px' }}>
                            {template.description}
                        </div>
                        {template.tags.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                {template.tags.slice(0, 3).map(tag => (
                                    <Tag key={tag} style={{ marginBottom: 4 }}>
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        )}
                    </div>
                }
            />

            {/* 使用次数（自定义模板） */}
            {!template.isBuiltIn && template.usageCount !== undefined && (
                <div style={{ marginTop: 8, fontSize: '12px', color: '#999' }}>
                    {t('templates.usageCount', '使用次数')}: {template.usageCount}
                </div>
            )}
        </Card>
    );
});

TemplateCard.displayName = 'TemplateCard';
