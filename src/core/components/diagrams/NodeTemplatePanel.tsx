import React, { useState } from 'react';
import { Button, Input, Tooltip, Popconfirm, Empty, theme } from 'antd';
import {
    CheckOutlined,
    CloseOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    StarFilled,
} from '@ant-design/icons';
import type { NodeTemplate } from './hooks/useNodeTemplates';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';

interface NodeTemplatePanelProps {
    templates: NodeTemplate[];
    groupedTemplates: Record<string, NodeTemplate[]>;
    onUseTemplate: (templateId: string) => void;
    onDeleteTemplate: (templateId: string) => void;
    onRenameTemplate: (templateId: string, name: string) => void;
}

/**
 * 节点模板面板 — 展示已保存的节点模板，支持分类浏览、使用和删除
 */
export const NodeTemplatePanel: React.FC<NodeTemplatePanelProps> = ({
    groupedTemplates,
    onUseTemplate,
    onDeleteTemplate,
    onRenameTemplate,
}) => {
    const { token } = theme.useToken();
    const [search, setSearch] = useState('');

    const categories = Object.keys(groupedTemplates);
    const hasTemplates = categories.length > 0;

    // 搜索过滤
    const filteredGroups = search.trim()
        ? Object.fromEntries(
            categories
                .map(cat => [cat, groupedTemplates[cat].filter(t =>
                    t.name.toLowerCase().includes(search.toLowerCase())
                )])
                .filter(([, items]) => (items as NodeTemplate[]).length > 0)
        ) as Record<string, NodeTemplate[]>
        : groupedTemplates;

    return (
        <div style={{ padding: '8px 4px' }}>
            {/* 搜索 */}
            <Input
                size="small"
                placeholder="搜索模板..."
                aria-label="搜索模板"
                prefix={<StarFilled style={{ color: token.colorTextQuaternary, fontSize: 11 }} />}
                value={search}
                onChange={e => setSearch(e.target.value)}
                allowClear={{ clearIcon: <AccessibleInputClearIcon label="清除模板搜索" /> }}
                style={{ marginBottom: 8 }}
            />

            {!hasTemplates ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                        <span style={{ fontSize: 12, color: token.colorTextTertiary }}>
                            右键节点 → "保存为模板"<br />
                            或选中节点后 Ctrl+Alt+S
                        </span>
                    }
                    style={{ margin: '20px 0' }}
                />
            ) : Object.keys(filteredGroups).length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="未找到匹配模板"
                    style={{ margin: '20px 0' }}
                />
            ) : (
                Object.entries(filteredGroups).map(([category, items]) => (
                    <div key={category} style={{ marginBottom: 12 }}>
                        {/* 分类标题 */}
                        <div style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: token.colorTextSecondary,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            padding: '4px 4px 4px 0',
                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            marginBottom: 4,
                        }}>
                            {category} ({items.length})
                        </div>

                        {/* 模板列表 */}
                        <div role="list" aria-label={`${category}模板`}>
                            {items.map(tpl => (
                                <TemplateItem
                                    key={tpl.id}
                                    template={tpl}
                                    onUse={() => onUseTemplate(tpl.id)}
                                    onDelete={() => onDeleteTemplate(tpl.id)}
                                    onRename={(name) => onRenameTemplate(tpl.id, name)}
                                    token={token}
                                />
                            ))}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

/** 单个模板卡片 */
const TemplateItem: React.FC<{
    template: NodeTemplate;
    onUse: () => void;
    onDelete: () => void;
    onRename: (name: string) => void;
    token: ReturnType<typeof theme.useToken>['token'];
}> = ({ template, onUse, onDelete, onRename, token }) => {
    const shape = (template.data.shape as string) || 'rectangle';
    const mainColor = (template.data.theme as Record<string, string>)?.main || '#2196F3';
    const isGroup = template.isGroup && template.nodes && template.nodes.length > 1;
    const [isRenaming, setIsRenaming] = useState(false);
    const [draftName, setDraftName] = useState(template.name);
    const normalizedDraftName = draftName.trim();

    const startRenaming = () => {
        setDraftName(template.name);
        setIsRenaming(true);
    };

    const cancelRenaming = () => {
        setDraftName(template.name);
        setIsRenaming(false);
    };

    const commitRename = () => {
        if (!normalizedDraftName) return;
        if (normalizedDraftName !== template.name) onRename(normalizedDraftName);
        setDraftName(normalizedDraftName);
        setIsRenaming(false);
    };

    return (
        <div
            role="listitem"
            aria-label={`模板 ${template.name}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                borderRadius: token.borderRadius,
                transition: 'background 0.15s',
                marginBottom: 2,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = token.controlItemBgHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
            {/* 形状指示 */}
            <div style={{
                width: 24,
                height: 24,
                borderRadius: isGroup ? 4 : shape === 'diamond' ? 2 : shape === 'pill' ? 12 : shape === 'circle' ? 12 : 4,
                border: `2px solid ${mainColor}`,
                background: isGroup ? `${mainColor}30` : `${mainColor}18`,
                transform: shape === 'diamond' && !isGroup ? 'rotate(45deg) scale(0.75)' : 'none',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: mainColor,
            }}>
                {isGroup ? template.nodes!.length : null}
            </div>

            {/* 名称 */}
            {isRenaming ? (
                <div style={{ display: 'flex', flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
                    <Input
                        autoFocus
                        size="small"
                        maxLength={80}
                        aria-label={`重命名模板 ${template.name}`}
                        aria-invalid={!normalizedDraftName}
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onPressEnter={commitRename}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') cancelRenaming();
                        }}
                    />
                    <Button
                        type="text"
                        size="small"
                        aria-label={`保存模板名称 ${template.name}`}
                        disabled={!normalizedDraftName}
                        icon={<CheckOutlined aria-hidden="true" />}
                        onClick={commitRename}
                        style={{ width: 44, height: 44, minWidth: 44 }}
                    />
                    <Button
                        type="text"
                        size="small"
                        aria-label={`取消重命名模板 ${template.name}`}
                        icon={<CloseOutlined aria-hidden="true" />}
                        onClick={cancelRenaming}
                        style={{ width: 44, height: 44, minWidth: 44 }}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    aria-label={`使用模板 ${template.name}`}
                    onClick={onUse}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: 0,
                        border: 0,
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        minHeight: 44,
                    }}
                >
                    <div style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: token.colorText,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        {template.name}
                    </div>
                    <div style={{ fontSize: 10, color: token.colorTextQuaternary }}>
                        {isGroup ? `${template.nodes!.length} 节点 · ${template.edges?.length || 0} 连线` : shape}
                    </div>
                </button>
            )}

            {/* 操作 */}
            {!isRenaming && (
                <>
                    <Tooltip title="添加到画布">
                        <Button
                            type="text"
                            size="small"
                            aria-label={`添加模板 ${template.name} 到画布`}
                            icon={<PlusOutlined aria-hidden="true" style={{ fontSize: 11 }} />}
                            onClick={onUse}
                            style={{ width: 44, height: 44, minWidth: 44 }}
                        />
                    </Tooltip>
                    <Tooltip title="重命名模板">
                        <Button
                            type="text"
                            size="small"
                            aria-label={`重命名模板 ${template.name}`}
                            icon={<EditOutlined aria-hidden="true" style={{ fontSize: 11 }} />}
                            onClick={startRenaming}
                            style={{ width: 44, height: 44, minWidth: 44 }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="删除此模板？"
                        onConfirm={onDelete}
                        okText="删除"
                        cancelText="取消"
                    >
                        <Button
                            type="text"
                            size="small"
                            aria-label={`删除模板 ${template.name}`}
                            icon={<DeleteOutlined aria-hidden="true" style={{ fontSize: 11 }} />}
                            style={{ width: 44, height: 44, minWidth: 44, color: token.colorTextQuaternary }}
                        />
                    </Popconfirm>
                </>
            )}
        </div>
    );
};
