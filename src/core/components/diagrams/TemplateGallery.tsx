import React, { useState, useMemo } from 'react';
import { Tabs, Input, Row, Col, Empty, Spin } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TemplateCard } from './TemplateCard';
import { useTemplates } from '../../hooks/useTemplates';
import { TemplateCategory, TEMPLATE_CATEGORY_LABELS } from '../../types/Template';
import './TemplateGallery.css';

interface TemplateGalleryProps {
    onSelectTemplate: (templateId: string) => void;
    onClose?: () => void;
}

/**
 * 模板库组件
 */
export const TemplateGallery: React.FC<TemplateGalleryProps> = React.memo(({
    onSelectTemplate,
    onClose
}) => {
    const { t, i18n } = useTranslation();
    const {
        loading,
        deleteTemplate,
        filterTemplates
    } = useTemplates();

    const [activeCategory, setActiveCategory] = useState<TemplateCategory | 'all'>(TemplateCategory.FLOWCHART);
    const [searchQuery, setSearchQuery] = useState('');

    // 过滤模板
    const filteredTemplates = useMemo(() => {
        if (activeCategory === 'all') {
            return filterTemplates({ searchQuery });
        }
        return filterTemplates({
            category: activeCategory as TemplateCategory,
            searchQuery
        });
    }, [activeCategory, searchQuery, filterTemplates]);

    // 处理模板使用
    const handleUseTemplate = (templateId: string) => {
        onSelectTemplate(templateId);
        onClose?.();
    };

    // 处理模板删除
    const handleDeleteTemplate = (templateId: string) => {
        deleteTemplate(templateId);
    };

    // Tab配置
    const tabItems = [
        {
            key: 'all',
            label: t('templates.category.all', '全部'),
            children: null
        },
        {
            key: TemplateCategory.FLOWCHART,
            label: i18n.language === 'zh'
                ? TEMPLATE_CATEGORY_LABELS[TemplateCategory.FLOWCHART].zh
                : TEMPLATE_CATEGORY_LABELS[TemplateCategory.FLOWCHART].en,
            children: null
        },
        {
            key: TemplateCategory.ARCHITECTURE,
            label: i18n.language === 'zh'
                ? TEMPLATE_CATEGORY_LABELS[TemplateCategory.ARCHITECTURE].zh
                : TEMPLATE_CATEGORY_LABELS[TemplateCategory.ARCHITECTURE].en,
            children: null
        },
        {
            key: TemplateCategory.CUSTOM,
            label: i18n.language === 'zh'
                ? TEMPLATE_CATEGORY_LABELS[TemplateCategory.CUSTOM].zh
                : TEMPLATE_CATEGORY_LABELS[TemplateCategory.CUSTOM].en,
            children: null
        }
    ];

    return (
        <div className="template-gallery">
            {/* 标题与搜索 */}
            <div className="template-gallery-header">
                <h2>{t('templates.title', '模板库')}</h2>
                <Input
                    placeholder={t('templates.searchPlaceholder', '搜索模板...')}
                    prefix={<SearchOutlined />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: 300 }}
                    allowClear
                />
            </div>

            {/* 分类Tab */}
            <Tabs
                activeKey={activeCategory}
                onChange={(key) => setActiveCategory(key as TemplateCategory | 'all')}
                items={tabItems}
            />

            {/* 模板网格 */}
            <div className="template-gallery-content">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 0' }}>
                        <Spin size="large" />
                    </div>
                ) : filteredTemplates.length === 0 ? (
                    <Empty
                        description={
                            searchQuery
                                ? t('templates.noResults', '未找到匹配的模板')
                                : t('templates.empty', '暂无模板')
                        }
                    />
                ) : (
                    <Row gutter={[16, 16]}>
                        {filteredTemplates.map(template => (
                            <Col key={template.id} xs={24} sm={12} md={8} lg={6} xl={6}>
                                <TemplateCard
                                    template={template}
                                    onUse={handleUseTemplate}
                                    onDelete={template.isBuiltIn ? undefined : handleDeleteTemplate}
                                />
                            </Col>
                        ))}
                    </Row>
                )}
            </div>
        </div>
    );
});

TemplateGallery.displayName = 'TemplateGallery';
