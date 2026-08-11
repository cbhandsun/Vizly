import React, { useRef, useState } from 'react';
import { Input, Button, List, Typography, Flex, Space, theme, Divider, Avatar, Popconfirm } from 'antd';
import { FaCheck, FaTrash, FaPaperPlane } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useDiagramStore, Comment } from '../../store/useDiagramStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';
import {
    MAX_ANNOTATION_CONTENT_LENGTH,
    parseAnnotationContent,
    type AnnotationContentError,
} from './annotationContent';

const { Text, Paragraph } = Typography;

interface CommentEditorProps {
    comment: Comment;
    onClose?: () => void;
}

export const CommentEditor: React.FC<CommentEditorProps> = ({ comment, onClose }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const updateComment = useDiagramStore(state => state.updateComment);
    const removeComment = useDiagramStore(state => state.removeComment);
    const user = useDiagramStore(state => state.user);
    const [replyText, setReplyText] = useState('');
    const [replyError, setReplyError] = useState<Exclude<AnnotationContentError, 'save_failed'> | null>(null);
    const replySubmitLockedRef = useRef(false);

    const handleAddReply = () => {
        if (replySubmitLockedRef.current) return;
        const parsedContent = parseAnnotationContent(replyText);
        if (!parsedContent.ok) {
            setReplyError(parsedContent.error);
            return;
        }
        replySubmitLockedRef.current = true;
        
        const newReply = {
            id: Math.random().toString(36).substr(2, 9),
            authorId: user.id,
            authorName: user.name,
            authorColor: user.color,
            content: parsedContent.value,
            createdAt: Date.now()
        };

        updateComment(comment.id, {
            replies: [...comment.replies, newReply]
        });
        setReplyText('');
        setReplyError(null);
    };

    const handleReplyChange = (value: string) => {
        replySubmitLockedRef.current = false;
        setReplyText(value);
        if (!value) {
            setReplyError(null);
            return;
        }
        const parsedContent = parseAnnotationContent(value);
        setReplyError(parsedContent.ok ? null : parsedContent.error);
    };

    const toggleResolve = () => {
        updateComment(comment.id, { isResolved: !comment.isResolved });
    };

    const handleDelete = () => {
        removeComment(comment.id);
        onClose?.();
    };

    return (
        <div
            role="dialog"
            aria-label={t('comment.editDialog')}
            style={{ width: 'min(280px, calc(100vw - 32px))', padding: '4px 0' }}
            onClick={(e) => e.stopPropagation()}
        >
            <Flex vertical gap={12}>
                {/* Main Comment */}
                <Flex vertical gap={4}>
                    <Flex justify="space-between" align="start">
                        <Space size={8}>
                            <Avatar size={24} style={{ backgroundColor: comment.authorColor || token.colorPrimary }}>
                                {comment.authorName.charAt(0).toUpperCase()}
                            </Avatar>
                            <Flex vertical>
                                <Text strong style={{ fontSize: 13, lineHeight: 1 }}>{comment.authorName}</Text>
                                <Text type="secondary" style={{ fontSize: 10 }}>{formatRelativeTime(comment.createdAt)}</Text>
                            </Flex>
                        </Space>
                        <Space size={4}>
                            <Button 
                                type="text" 
                                size="small" 
                                aria-label={comment.isResolved ? t('comment.markUnresolved') : t('comment.markResolved')}
                                icon={<FaCheck style={{ color: comment.isResolved ? token.colorSuccess : token.colorTextQuaternary }} />} 
                                onClick={toggleResolve}
                                style={{ minWidth: 44, minHeight: 44 }}
                            />
                            <Popconfirm
                                title={t('comment.deleteConfirmTitle')}
                                description={t('comment.deleteConfirmDescription')}
                                okText={t('common.delete', 'Delete')}
                                cancelText={t('common.cancel', 'Cancel')}
                                onConfirm={handleDelete}
                            >
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    aria-label={t('comment.delete')}
                                    icon={<FaTrash style={{ fontSize: 11 }} />}
                                    style={{ minWidth: 44, minHeight: 44 }}
                                />
                            </Popconfirm>
                        </Space>
                    </Flex>
                    <Paragraph style={{ 
                        margin: '8px 0 0 32px', 
                        fontSize: 13, 
                        textDecoration: comment.isResolved ? 'line-through' : 'none',
                        color: comment.isResolved ? token.colorTextDescription : token.colorText
                    }}>
                        {comment.content}
                    </Paragraph>
                </Flex>

                {comment.replies.length > 0 && <Divider style={{ margin: '4px 0' }} />}

                {/* Replies List */}
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    <List
                        dataSource={comment.replies}
                        split={false}
                        renderItem={(reply) => (
                            <List.Item style={{ padding: '8px 0 8px 32px', border: 'none' }}>
                                <Flex vertical gap={2} style={{ width: '100%' }}>
                                    <Flex justify="space-between">
                                        <Text strong style={{ fontSize: 12 }}>{reply.authorName}</Text>
                                        <Text type="secondary" style={{ fontSize: 9 }}>{formatRelativeTime(reply.createdAt)}</Text>
                                    </Flex>
                                    <Text style={{ fontSize: 12 }}>{reply.content}</Text>
                                </Flex>
                            </List.Item>
                        )}
                    />
                </div>

                {/* Reply Input */}
                <div style={{ marginTop: 4 }}>
                    <Input.TextArea
                        placeholder={t('comment.replyPlaceholder')}
                        aria-label={t('comment.replyLabel')}
                        value={replyText}
                        onChange={(e) => handleReplyChange(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        maxLength={MAX_ANNOTATION_CONTENT_LENGTH}
                        showCount
                        aria-invalid={Boolean(replyError)}
                        aria-describedby={replyError ? 'comment-reply-error' : undefined}
                        status={replyError ? 'error' : undefined}
                        onPressEnter={(e) => {
                            if (!e.shiftKey) {
                                e.preventDefault();
                                handleAddReply();
                            }
                        }}
                        style={{ fontSize: 12, borderRadius: 8, minHeight: 44 }}
                    />
                    {replyError ? (
                        <div id="comment-reply-error" role="alert" style={{ color: token.colorError, fontSize: 12, marginTop: 4 }}>
                            {replyError === 'too_long'
                                ? t('comment.validation.tooLong', { maxLength: MAX_ANNOTATION_CONTENT_LENGTH })
                                : t('comment.validation.required')}
                        </div>
                    ) : null}
                    <Flex justify="flex-end" style={{ marginTop: 8 }}>
                        <Button 
                            type="primary" 
                            size="small" 
                            icon={<FaPaperPlane style={{ fontSize: 10 }} />} 
                            onClick={handleAddReply}
                            disabled={!parseAnnotationContent(replyText).ok}
                            style={{ minHeight: 44 }}
                        >
                            {t('comment.sendReply')}
                        </Button>
                    </Flex>
                </div>
            </Flex>
        </div>
    );
};
