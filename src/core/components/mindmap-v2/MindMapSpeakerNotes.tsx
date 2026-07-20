import React, { useEffect, useState, useRef } from 'react';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, getPresentationState, subscribePresentation } from './mindElixirStore';
import { generateSpeakerNotes } from './mindmapAIService';
import { mergeSpeakerNotesIntoNodeNote } from './mindmapSpeakerNotesSecurity';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { logMindmapSpeakerNotesSaveFailure } from './mindmapPanelLogging';
import { Spin, Button, Select, Tooltip, message } from 'antd';
import { CopyOutlined, ReloadOutlined, SaveOutlined, MessageOutlined, SoundOutlined } from '@ant-design/icons';

const TONE_OPTIONS = [
    { label: '💼 专业商务', value: '专业商务' },
    { label: '🎭 幽默风趣', value: '幽默风趣' },
    { label: '📢 通俗易懂', value: '通俗易懂' },
    { label: '🧐 严谨理性', value: '严谨理性' },
];

export const MindMapSpeakerNotes: React.FC = () => {
    const [isPresenting, setIsPresenting] = useState(false);
    const [currentNode, setCurrentNode] = useState<NodeObj | null>(null);
    const [notes, setNotes] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [tone, setTone] = useState('专业商务');
    const [error, setError] = useState<string | null>(null);

    // 缓存上一次请求的节点ID和语气，避免重复请求
    const lastRequestKeyRef = useRef<string>('');
    const debounceTimerRef = useRef<any>(null);

    // 订阅演示状态
    useEffect(() => {
        const syncState = () => {
            const state = getPresentationState();
            setIsPresenting(state.isPresenting);
            setCurrentNode(state.presentationNode);
        };
        syncState();
        return subscribePresentation(syncState);
    }, []);

    // 监听节点或语气变化
    useEffect(() => {
        if (!isPresenting || !currentNode) {
            setNotes('');
            setError(null);
            lastRequestKeyRef.current = '';
            return;
        }

        const nodeId = currentNode.id;
        const requestKey = `${nodeId}_${tone}`;

        // 如果节点和语气都没变，不重新请求
        if (lastRequestKeyRef.current === requestKey) {
            return;
        }

        // 清理上一次的 debounce 定时器
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        setLoading(true);
        setError(null);

        // Debounce 400ms 请求 AI
        debounceTimerRef.current = setTimeout(() => {
            fetchNotes(currentNode, tone);
        }, 400);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentNode, tone, isPresenting]);

    const fetchNotes = async (node: NodeObj, currentTone: string) => {
        const nodeId = node.id;
        const noteText = node.note || undefined;
        const childText = node.children && node.children.length > 0
            ? node.children.map(c => c.topic).join('，')
            : undefined;

        setLoading(true);
        setError(null);

        const result = await generateSpeakerNotes(node.topic, noteText, childText, currentTone);

        // 如果用户在请求期间已经切换了节点，则丢弃该结果
        if (currentNode?.id !== nodeId) {
            return;
        }

        if ('error' in result) {
            setError(result.error || '请求失败，请重试');
            setNotes('');
        } else {
            setNotes(result.notes);
            lastRequestKeyRef.current = `${nodeId}_${currentTone}`;
        }
        setLoading(false);
    };

    const handleRetry = () => {
        if (!currentNode) return;
        lastRequestKeyRef.current = ''; // 清空缓存以强制重新生成
        fetchNotes(currentNode, tone);
    };

    const handleCopyNotes = async () => {
        if (!notes.trim()) return;
        try {
            await navigator.clipboard.writeText(notes);
            message.success('演讲提词已复制');
        } catch {
            message.error('复制失败，请检查浏览器剪贴板权限');
        }
    };

    const handleSaveNotes = async () => {
        if (!currentNode || !notes.trim()) return;
        const mind = getMindElixirInstance();
        if (!mind) return;

        try {
            const tpcEl = mind.findEle(currentNode.id);
            if (!tpcEl) return;
            const nextNote = mergeSpeakerNotesIntoNodeNote(currentNode.note, notes);
            const cleanPatch = cleanMindMapNodePatch({ note: nextNote });
            await mind.reshapeNode(tpcEl, { ...currentNode, ...cleanPatch });
            const changedNode = { ...currentNode, ...cleanPatch };
            mind.bus.fire('operation', {
                name: 'reshapeNode',
                obj: changedNode,
                origin: currentNode,
            });
            setCurrentNode(changedNode);
            message.success('已保存到当前节点备注');
        } catch (err) {
            logMindmapSpeakerNotesSaveFailure(err);
            message.error('保存失败，请重试');
        }
    };

    if (!isPresenting || !currentNode) return null;

    return (
        <div style={containerStyle}>
            {/* 磨砂玻璃头部 */}
            <div style={headerStyle}>
                <div style={titleWrapperStyle}>
                    <MessageOutlined style={{ color: '#818cf8', fontSize: 16 }} />
                    <span style={titleStyle}>AI 演讲提词器</span>
                </div>
                <div style={actionsStyle}>
                    <Select
                        size="small"
                        options={TONE_OPTIONS}
                        value={tone}
                        onChange={(val) => setTone(val)}
                        dropdownStyle={dropdownStyle}
                        style={selectStyle}
                    />
                    <Tooltip title="复制提词">
                        <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={handleCopyNotes}
                            disabled={!notes.trim() || loading}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                    <Tooltip title="保存到节点备注">
                        <Button
                            type="text"
                            size="small"
                            icon={<SaveOutlined />}
                            onClick={handleSaveNotes}
                            disabled={!notes.trim() || loading}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                    <Tooltip title="重新生成">
                        <Button
                            type="text"
                            size="small"
                            icon={<ReloadOutlined />}
                            onClick={handleRetry}
                            style={iconButtonStyle}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 提词主体部分 */}
            <div style={contentStyle}>
                <div style={nodeInfoStyle}>
                    <span style={nodeLabelStyle}>当前焦点主题</span>
                    <h3 style={nodeTopicStyle}>{currentNode.topic}</h3>
                </div>

                <div style={scrollAreaStyle}>
                    {loading ? (
                        <div style={loadingWrapperStyle}>
                            <Spin size="default" />
                            <span style={loadingTextStyle}>AI 正在组织演讲语言...</span>
                        </div>
                    ) : error ? (
                        <div style={errorWrapperStyle}>
                            <span style={errorTextStyle}>⚠️ {error}</span>
                            <Button
                                type="primary"
                                size="small"
                                onClick={handleRetry}
                                style={retryButtonStyle}
                            >
                                重新尝试
                            </Button>
                        </div>
                    ) : (
                        <div style={notesTextStyle}>
                            {notes || '（该节点暂未生成提词，正在等待AI生成...）'}
                        </div>
                    )}
                </div>
            </div>

            {/* 底部小提示 */}
            <div style={footerStyle}>
                <SoundOutlined style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }} />
                <span>演讲字数：约 {notes.length} 字</span>
            </div>
        </div>
    );
};

// ─── 磨砂玻璃风格 Inline Styles ──────────────────────────────────────────────
const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '32px',
    right: '32px',
    bottom: '96px', // 留出底部 HUD 的空间
    width: '340px',
    zIndex: 99999, // 必须极高，在全屏模式下覆盖 Canvas 元素
    background: 'rgba(15, 18, 36, 0.72)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '20px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
};

const titleWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const titleStyle: React.CSSProperties = {
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    letterSpacing: '0.5px',
};

const actionsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
};

const selectStyle: React.CSSProperties = {
    width: '110px',
};

const dropdownStyle: React.CSSProperties = {
    background: '#1f2937',
    border: '1px solid rgba(255, 255, 255, 0.1)',
};

const iconButtonStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.65)',
    background: 'transparent',
    border: 'none',
};

const contentStyle: React.CSSProperties = {
    flex: 1,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
};

const nodeInfoStyle: React.CSSProperties = {
    marginBottom: '16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '12px',
    padding: '12px 16px',
    border: '1px solid rgba(255, 255, 255, 0.04)',
};

const nodeLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    display: 'block',
    marginBottom: '4px',
};

const nodeTopicStyle: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
};

const scrollAreaStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    paddingRight: '4px',
};

const loadingWrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    height: '150px',
};

const loadingTextStyle: React.CSSProperties = {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: '12px',
};

const errorWrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '20px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
};

const errorTextStyle: React.CSSProperties = {
    color: '#f87171',
    fontSize: '12px',
    textAlign: 'center',
    lineHeight: '1.6',
};

const retryButtonStyle: React.CSSProperties = {
    background: '#ef4444',
    borderColor: '#ef4444',
};

const notesTextStyle: React.CSSProperties = {
    fontSize: '15px',
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: '1.8',
    whiteSpace: 'pre-wrap',
    letterSpacing: '0.4px',
    animation: 'fadeIn 0.28s ease',
};

const footerStyle: React.CSSProperties = {
    padding: '12px 20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
};

// 动画注入逻辑（以确保 slideIn 动画生效）
if (typeof document !== 'undefined') {
    const styleId = 'me-speaker-notes-animation';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(40px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            /* 自定义滚动条风格 */
            #vizly-mind-elixir-root div::-webkit-scrollbar {
                width: 6px;
            }
            #vizly-mind-elixir-root div::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 3px;
            }
            #vizly-mind-elixir-root div::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }
        `;
        document.head.appendChild(style);
    }
}
