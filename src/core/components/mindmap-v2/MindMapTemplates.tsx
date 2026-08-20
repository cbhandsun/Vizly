import React, { useCallback, useMemo, useState } from 'react';
import { Dropdown } from 'antd';
import {
    AppstoreAddOutlined,
    BulbOutlined,
    FileTextOutlined,
    ReadOutlined,
    RocketOutlined,
    SearchOutlined,
    SlidersOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { appMessage, appModal } from '@/core/utils/antdStaticBridge';

import { getViewportOverlayContainer, getViewportPopupContainer } from '../ui/viewportOverlayPortal';
import { countNodes } from './migrate';
import { getMindElixirInstance } from './mindElixirStore';
import {
    buildLocalizedMindMapTemplates,
    type MindMapTemplate,
    type MindMapTemplateKey,
} from './mindmapTemplateCatalog';
import {
    logMindmapTemplateInsertFailure,
    logMindmapTemplateReplaceFailure,
} from './mindmapPanelLogging';
import { templateToNodeObj } from './mindmapTemplateModel';
import { applyMindMapTemplateTransaction } from './mindmapTemplateTransaction';
import MindMapToolbarIconButton from './MindMapToolbarIconButton';
import type { NodeObj } from 'mind-elixir';

type RootNodeObj = NodeObj & { root?: boolean };

const TEMPLATE_ICONS: Record<MindMapTemplateKey, React.ReactNode> = {
    swot: <SlidersOutlined />,
    meeting: <FileTextOutlined />,
    project: <RocketOutlined />,
    reading: <ReadOutlined />,
    problem: <SearchOutlined />,
    brainstorm: <BulbOutlined />,
};

const MindMapTemplates: React.FC = () => {
    const { t } = useTranslation();
    const mind = getMindElixirInstance();
    const [open, setOpen] = useState(false);
    const templates = useMemo(() => buildLocalizedMindMapTemplates(t), [t]);

    const replaceTemplate = useCallback((template: MindMapTemplate) => {
        if (!mind) {
            appMessage.warning(t('plugins.mindmap.templates.notReady'));
            return;
        }

        const currentNodeCount = countNodes(mind.getData().nodeData);
        setOpen(false);
        appModal.confirm({
            title: t('plugins.mindmap.templates.replaceConfirmTitle', {
                template: template.label,
            }),
            content: t('plugins.mindmap.templates.replaceConfirmContent', {
                count: currentNodeCount,
                template: template.label,
            }),
            okText: t('plugins.mindmap.templates.replaceConfirmAction'),
            cancelText: t('plugins.mindmap.templates.cancel'),
            centered: true,
            keyboard: true,
            maskClosable: false,
            getContainer: getViewportOverlayContainer,
            focusTriggerAfterClose: true,
            onOk: () => {
                try {
                    const nodeData = templateToNodeObj(template.tree);
                    nodeData.id = 'root';
                    (nodeData as RootNodeObj).root = true;
                    applyMindMapTemplateTransaction(mind, nodeData);
                    appMessage.success(t('plugins.mindmap.templates.replaceSuccess', {
                        template: template.label,
                    }));
                } catch (error) {
                    appMessage.error(t('plugins.mindmap.templates.replaceFailed'));
                    logMindmapTemplateReplaceFailure(error);
                }
            },
        });
    }, [mind, t]);

    const insertTemplate = useCallback((template: MindMapTemplate) => {
        if (!mind) {
            appMessage.warning(t('plugins.mindmap.templates.notReady'));
            return;
        }

        const selectedId = mind.currentNode?.id ?? mind.currentNodes?.[0]?.id;
        if (!selectedId) {
            appMessage.info(t('plugins.mindmap.templates.selectNodeFirst'));
            return;
        }

        try {
            const parentTopic = mind.findEle(selectedId);
            if (!parentTopic) {
                appMessage.error(t('plugins.mindmap.templates.selectionUnavailable'));
                return;
            }
            const children = template.tree.children ?? [];
            for (const child of children) {
                mind.addChild(parentTopic, templateToNodeObj(child));
            }
            appMessage.success(t('plugins.mindmap.templates.insertSuccess', {
                count: children.length,
            }));
        } catch (error) {
            appMessage.error(t('plugins.mindmap.templates.insertFailed'));
            logMindmapTemplateInsertFailure(error);
        }
    }, [mind, t]);

    const applyTemplate = useCallback((template: MindMapTemplate) => {
        if (template.mode === 'replace') {
            replaceTemplate(template);
            return;
        }
        insertTemplate(template);
    }, [insertTemplate, replaceTemplate]);

    const menuItems = templates.map(template => ({
        key: template.key,
        label: (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 0' }}>
                <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1.2, flexShrink: 0 }}>
                    {TEMPLATE_ICONS[template.key]}
                </span>
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{template.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                        {template.description}
                    </div>
                </div>
                {template.mode === 'insert' && (
                    <span style={{
                        marginLeft: 'auto',
                        fontSize: 10,
                        color: '#6366f1',
                        background: 'rgba(99,102,241,0.1)',
                        padding: '1px 5px',
                        borderRadius: 4,
                        flexShrink: 0,
                        alignSelf: 'center',
                    }}>
                        {t('plugins.mindmap.templates.insertBadge')}
                    </span>
                )}
            </div>
        ),
        onClick: () => applyTemplate(template),
    }));

    return (
        <Dropdown
            open={open}
            onOpenChange={setOpen}
            menu={{
                items: menuItems,
                'aria-label': t('plugins.mindmap.templates.menuLabel'),
            }}
            placement="bottomRight"
            getPopupContainer={getViewportPopupContainer}
            trigger={['click']}
        >
            <MindMapToolbarIconButton
                aria-expanded={open}
                aria-haspopup="menu"
                label={t('plugins.mindmap.templates.openLabel')}
                icon={<AppstoreAddOutlined />}
                disabled={!mind}
                suppressTooltip={open}
                style={{ color: 'rgba(255,255,255,0.55)' }}
            />
        </Dropdown>
    );
};

export default MindMapTemplates;
