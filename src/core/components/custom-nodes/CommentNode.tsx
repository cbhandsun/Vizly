import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Popover, Avatar, Badge, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { useDiagramStore } from '../../store/useDiagramStore';
import { CommentEditor } from '../diagrams/CommentEditor';
import './CommentNode.css';

/**
 * 评论 Pin 节点 (Phase 11)
 * 用于在画布上显示一个可交互的评论标记，点击后展示详情和回复界面
 *
 * [Perf] Uses a selector to subscribe only to the specific comment object,
 * avoiding re-renders when unrelated comments change.
 */
const CommentNode = ({ id, selected }: NodeProps) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    // [Perf] Targeted selector: only re-renders when *this* comment changes,
    // not when other comments are added/updated/deleted.
    const comment = useDiagramStore(state => state.comments.find(c => c.id === id));
    const [open, setOpen] = React.useState(false);

    if (!comment) return null;

    const { authorName, authorColor, replies, isResolved } = comment;
    const initials = authorName.charAt(0).toUpperCase();
    const replyCount = replies.length;

    return (
        <div className={`vizly-comment-pin ${selected ? 'selected' : ''}`} style={{ cursor: 'pointer' }}>
            <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
            
            <Popover
                content={<CommentEditor comment={comment} onClose={() => setOpen(false)} />}
                trigger="click"
                open={open}
                onOpenChange={setOpen}
                placement="rightTop"
                overlayStyle={{ zIndex: 10000 }}
            >
                <button
                    type="button"
                    aria-label={t('comment.view', { content: comment.content || t('comment.emptyContent') })}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        width: 44,
                        height: 44,
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                    }}
                >
                    <Badge count={replyCount} size="small" offset={[-2, 2]}>
                        <Avatar 
                            size={32} 
                            style={{ 
                                backgroundColor: isResolved ? token.colorTextQuaternary : authorColor, 
                                verticalAlign: 'middle',
                                border: selected ? `2px solid ${token.colorPrimary}` : '2px solid white',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                fontWeight: 'bold',
                                color: '#fff',
                                textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                opacity: isResolved ? 0.6 : 1,
                                transition: 'all 0.3s ease'
                            }}
                        >
                            {initials}
                        </Avatar>
                    </Badge>
                </button>
            </Popover>

            <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
        </div>
    );
};

export default memo(CommentNode);
