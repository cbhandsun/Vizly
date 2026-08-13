/**
 * MindMapHistoryPanel.tsx — 思维导图历史快照管理面板
 * 能够查看历史版本时间线，并一键恢复至历史版本
 */
import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getMindElixirInstance } from './mindElixirStore';
import {
    subscribeToggleHistory,
    subscribeHistoryList,
    clearHistory,
    setHistoryOpen,
} from './mindmapHistoryStore';
import type { HistoryRecord } from './mindmapHistoryStore';
import { restoreMindMapHistoryRecord } from './mindmapHistoryRestore';
import { Popconfirm, message } from 'antd';
import { CloseOutlined, DeleteOutlined, HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import { logMindmapHistoryRestoreFailure } from './mindmapPanelLogging';
import sidePanelStyles from './MindMapSidePanel.module.css';

const MindMapHistoryPanel: React.FC = () => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [records, setRecords] = useState<HistoryRecord[]>([]);

    useEffect(() => {
        const unsubToggle = subscribeToggleHistory(v => setOpen(v));
        const unsubList = subscribeHistoryList(list => setRecords(list));
        return () => {
            unsubToggle();
            unsubList();
        };
    }, []);

    const handleRestore = useCallback((record: HistoryRecord) => {
        const mind = getMindElixirInstance();
        if (!mind) {
            message.error(t('plugins.mindmap.history.notReady'));
            return;
        }
        try {
            restoreMindMapHistoryRecord({
                mind,
                record,
                backupDescription: t('plugins.mindmap.history.backupDescription'),
            });
            message.success(t('plugins.mindmap.history.restoreSuccess', { time: record.time }));
        } catch (e) {
            logMindmapHistoryRestoreFailure(e);
            message.error(t('plugins.mindmap.history.restoreFailed'));
        }
    }, [t]);

    const handleClear = useCallback(() => {
        clearHistory();
        message.success(t('plugins.mindmap.history.clearSuccess'));
    }, [t]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal((
        <aside
            className={`${sidePanelStyles.panel} ${sidePanelStyles.historyPanel}`}
            aria-label={t('plugins.mindmap.history.panelLabel')}
        >
            <div className={sidePanelStyles.header}>
                <HistoryOutlined className={sidePanelStyles.headerIcon} aria-hidden="true" />
                <span className={sidePanelStyles.title}>{t('plugins.mindmap.history.title')}</span>
                
                {records.length > 0 && (
                    <Popconfirm
                        title={t('plugins.mindmap.history.clearConfirmTitle')}
                        description={t('plugins.mindmap.history.clearConfirmDescription')}
                        onConfirm={handleClear}
                        okText={t('plugins.mindmap.history.clearConfirmAction')}
                        cancelText={t('plugins.mindmap.history.cancel')}
                        placement="bottomRight"
                        autoAdjustOverflow={false}
                        zIndex={1100}
                        getPopupContainer={() => document.body}
                    >
                        <button
                            type="button"
                            className={`${sidePanelStyles.headerAction} ${sidePanelStyles.dangerAction}`}
                            aria-label={t('plugins.mindmap.history.clear')}
                        >
                            <DeleteOutlined aria-hidden="true" />
                            {t('plugins.mindmap.history.clearShort')}
                        </button>
                    </Popconfirm>
                )}

                <button
                    type="button"
                    className={sidePanelStyles.closeButton}
                    onClick={() => setHistoryOpen(false)}
                    aria-label={t('plugins.mindmap.history.close')}
                    title={t('plugins.mindmap.history.closeWithShortcut')}
                >
                    <CloseOutlined aria-hidden="true" />
                </button>
            </div>

            <div className={sidePanelStyles.scrollArea}>
                <div
                    className={sidePanelStyles.historyList}
                    role="list"
                    aria-label={t('plugins.mindmap.history.listLabel')}
                >
                    {records.map(r => (
                        <div key={r.id} role="listitem">
                            <Popconfirm
                                title={t('plugins.mindmap.history.restoreConfirmTitle', { time: r.time })}
                                description={t('plugins.mindmap.history.restoreConfirmDescription')}
                                onConfirm={() => handleRestore(r)}
                                okText={t('plugins.mindmap.history.restoreConfirmAction')}
                                cancelText={t('plugins.mindmap.history.cancel')}
                                placement="leftTop"
                                autoAdjustOverflow={false}
                                zIndex={1100}
                                getPopupContainer={() => document.body}
                            >
                                <button
                                    type="button"
                                    className={sidePanelStyles.historyItem}
                                    aria-label={t('plugins.mindmap.history.restoreLabel', {
                                        time: r.time,
                                        description: r.description,
                                    })}
                                >
                                    <div className={sidePanelStyles.historyTime}>{r.time}</div>
                                    <div className={sidePanelStyles.historyDescription}>{r.description}</div>
                                    <span className={sidePanelStyles.historyRestoreAction}>
                                        <RollbackOutlined aria-hidden="true" />
                                        {t('plugins.mindmap.history.restoreAction')}
                                    </span>
                                </button>
                            </Popconfirm>
                        </div>
                    ))}
                </div>
                {records.length === 0 && (
                    <div className={sidePanelStyles.emptyState} role="status">
                        {t('plugins.mindmap.history.empty')}
                    </div>
                )}
            </div>

            <div className={sidePanelStyles.footer}>
                <span>{t('plugins.mindmap.history.count', { count: records.length, limit: 50 })}</span>
                <span>{t('plugins.mindmap.history.toggleHint')}</span>
            </div>
        </aside>
    ), document.body);
};

export default MindMapHistoryPanel;
