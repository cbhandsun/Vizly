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
    HistoryRecord
} from './mindmapHistoryStore';
import { Popconfirm, message } from 'antd';
import { logMindmapHistoryRestoreFailure } from './mindmapPanelLogging';

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
        <div style={{
            position: 'absolute',
            right: 0, top: 0, bottom: 0, width: 280,
            background: 'rgba(9,9,15,0.93)',
            backdropFilter: 'blur(24px)',
            borderLeft: '1px solid rgba(255,255,255,0.07)',
            zIndex: 810, // 稍微比大纲 (800) 高一点，两个都可以展示，后打开的覆盖先打开的
            display: 'flex', flexDirection: 'column',
            animation: 'historyIn 0.16s ease',
        }}>
            <style>{`
                @keyframes historyIn {
                    from { opacity: 0; transform: translateX(16px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                .history-scroll::-webkit-scrollbar { width: 3px; }
                .history-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
                
                .history-item {
                    position: relative;
                    padding: 12px 12px 12px 28px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px solid rgba(255, 255, 255, 0.04);
                    margin-bottom: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .history-item:hover {
                    background: rgba(99, 102, 241, 0.06);
                    border-color: rgba(99, 102, 241, 0.25);
                }
                .history-item::before {
                    content: '';
                    position: absolute;
                    left: 12px;
                    top: 18px;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #6366f1;
                    box-shadow: 0 0 6px rgba(99, 102, 241, 0.6);
                    z-index: 2;
                }
                .history-list-container {
                    position: relative;
                }
                /* 竖直的 Timeline 线条 */
                .history-list-container::before {
                    content: '';
                    position: absolute;
                    left: 15px;
                    top: 18px;
                    bottom: 18px;
                    width: 2px;
                    background: rgba(255, 255, 255, 0.06);
                    z-index: 1;
                }
                .history-item-time {
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.35);
                    font-family: 'Menlo', 'Consolas', monospace;
                    margin-bottom: 2px;
                }
                .history-item-desc {
                    font-size: 11px;
                    color: rgba(255, 255, 255, 0.8);
                    font-weight: 500;
                    margin-bottom: 6px;
                    line-height: 1.4;
                }
                .history-restore-btn {
                    font-size: 10px;
                    background: rgba(99, 102, 241, 0.12);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    color: #a5b4fc;
                    padding: 2px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    opacity: 0;
                }
                .history-item:hover .history-restore-btn {
                    opacity: 1;
                }
                .history-restore-btn:hover {
                    background: #6366f1;
                    color: #fff;
                }
            `}</style>

            {/* Header */}
            <div style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <span style={{ fontSize: 13 }}>🕒</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', flex: 1 }}>历史版本快照</span>
                
                {records.length > 0 && (
                    <Popconfirm
                        title="确定清空历史记录吗？"
                        description="此操作不可撤销，已生成的历史版本将被永久移除。"
                        onConfirm={handleClear}
                        okText="清空"
                        cancelText="取消"
                        placement="bottomRight"
                    >
                        <button style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'rgba(239, 68, 68, 0.6)', fontSize: 11, marginRight: 6,
                            transition: 'color 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(239, 68, 68, 0.6)')}
                        >
                            🗑️ 清空
                        </button>
                    </Popconfirm>
                )}

                <button onClick={() => setOpen(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.3)', fontSize: 16, lineHeight: 1,
                }} title="关闭 (Alt+H)">×</button>
            </div>

            {/* Timeline List */}
            <div className="history-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>
                <div className="history-list-container">
                    {records.map(r => (
                        <div key={r.id} className="history-item" onClick={() => handleRestore(r)}>
                            <div className="history-item-time">{r.time}</div>
                            <div className="history-item-desc">{r.description}</div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button 
                                    className="history-restore-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRestore(r);
                                    }}
                                >
                                    恢复此版本
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                {records.length === 0 && (
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
                        暂无历史修改快照
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: '8px 14px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                fontSize: 10, color: 'rgba(255,255,255,0.25)',
                display: 'flex', justifyContent: 'space-between',
            }}>
                <span>快照数量: {records.length} / 50</span>
                <span>Alt+H 切换</span>
            </div>
        </div>
    );
};

export default MindMapHistoryPanel;
