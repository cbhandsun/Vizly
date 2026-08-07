/**
 * MindMapHistoryPanel.tsx — 思维导图历史快照管理面板
 * 能够查看历史版本时间线，并一键恢复至历史版本
 */
import React, { useEffect, useState, useCallback } from 'react';
import { getMindElixirInstance } from './mindElixirStore';
import {
    subscribeToggleHistory,
    subscribeHistoryList,
    clearHistory,
    parseHistoryNodeData,
    setHistoryOpen,
    HistoryRecord,
} from './mindmapHistoryStore';
import { Popconfirm, message } from 'antd';
import { CloseOutlined, DeleteOutlined, HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import { logMindmapHistoryRestoreFailure } from './mindmapPanelLogging';
import sidePanelStyles from './MindMapSidePanel.module.css';

const MindMapHistoryPanel: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [records, setRecords] = useState<HistoryRecord[]>([]);
    const mind = getMindElixirInstance();

    useEffect(() => {
        const unsubToggle = subscribeToggleHistory(v => setOpen(v));
        const unsubList = subscribeHistoryList(list => setRecords(list));
        return () => {
            unsubToggle();
            unsubList();
        };
    }, []);

    const handleRestore = useCallback((record: HistoryRecord) => {
        if (!mind) {
            message.error('思维导图实例未准备就绪');
            return;
        }
        try {
            const oldNodeData = parseHistoryNodeData(record.data);
            const currentData = mind.getData();
            
            // 恢复数据
            mind.refresh({
                ...currentData,
                nodeData: oldNodeData
            });
            mind.toCenter();

            // 触发 operation，以使修改被保存，并写入新的历史快照记录中
            mind.bus.fire('operation', { 
                name: 'reshapeNode',
                obj: oldNodeData,
                origin: oldNodeData,
            });

            message.success(`已恢复至 ${record.time} 的历史版本`);
        } catch (e) {
            logMindmapHistoryRestoreFailure(e);
            message.error('版本恢复失败，快照数据已损坏');
        }
    }, [mind]);

    const handleClear = useCallback(() => {
        clearHistory();
        message.success('历史记录已清空');
    }, []);

    if (!open) return null;

    return (
        <aside
            className={`${sidePanelStyles.panel} ${sidePanelStyles.historyPanel}`}
            aria-label="历史版本快照"
        >
            <div className={sidePanelStyles.header}>
                <HistoryOutlined className={sidePanelStyles.headerIcon} aria-hidden="true" />
                <span className={sidePanelStyles.title}>历史版本快照</span>
                
                {records.length > 0 && (
                    <Popconfirm
                        title="确定清空历史记录吗？"
                        description="此操作不可撤销，已生成的历史版本将被永久移除。"
                        onConfirm={handleClear}
                        okText="清空"
                        cancelText="取消"
                        placement="bottomRight"
                    >
                        <button
                            type="button"
                            className={`${sidePanelStyles.headerAction} ${sidePanelStyles.dangerAction}`}
                            aria-label="清空历史记录"
                        >
                            <DeleteOutlined aria-hidden="true" />
                            清空
                        </button>
                    </Popconfirm>
                )}

                <button
                    type="button"
                    className={sidePanelStyles.closeButton}
                    onClick={() => setHistoryOpen(false)}
                    aria-label="关闭历史版本快照"
                    title="关闭历史版本快照 (Alt+H)"
                >
                    <CloseOutlined aria-hidden="true" />
                </button>
            </div>

            <div className={sidePanelStyles.scrollArea}>
                <div className={sidePanelStyles.historyList} role="list" aria-label="历史版本列表">
                    {records.map(r => (
                        <div key={r.id} role="listitem">
                            <button
                                type="button"
                                className={sidePanelStyles.historyItem}
                                onClick={() => handleRestore(r)}
                                aria-label={`恢复 ${r.time} 的历史版本：${r.description}`}
                            >
                                <div className={sidePanelStyles.historyTime}>{r.time}</div>
                                <div className={sidePanelStyles.historyDescription}>{r.description}</div>
                                <span className={sidePanelStyles.historyRestoreAction}>
                                    <RollbackOutlined aria-hidden="true" />
                                    恢复此版本
                                </span>
                            </button>
                        </div>
                    ))}
                </div>
                {records.length === 0 && (
                    <div className={sidePanelStyles.emptyState} role="status">
                        暂无历史修改快照
                    </div>
                )}
            </div>

            <div className={sidePanelStyles.footer}>
                <span>快照数量: {records.length} / 50</span>
                <span>Alt+H 切换</span>
            </div>
        </aside>
    );
};

export default MindMapHistoryPanel;
