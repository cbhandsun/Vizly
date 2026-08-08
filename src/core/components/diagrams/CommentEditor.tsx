import React, { useState } from 'react';
import { Input, Button, List, Typography, Flex, Space, theme, Divider, Avatar } from 'antd';
import { FaCheck, FaTrash, FaPaperPlane } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useDiagramStore, Comment } from '../../store/useDiagramStore';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

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

    const handleAddReply = () => {
        if (!replyText.trim()) return;
        
        const newReply = {
            id: Math.random().toString(36).substr(2, 9),
            authorId: user.id,
            authorName: user.name,
            authorColor: user.color,
            content: replyText,
            createdAt: Date.now()
        };

        updateComment(comment.id, {
            replies: [...comment.replies, newReply]
        });
        setReplyText('');
    };

    const toggleResolve = () => {
        updateComment(comment.id, { isResolved: !comment.isResolved });
    };

    const handleDelete = () => {
        removeComment(comment.id);
        onClose?.();
    };

    return (
        <div style={{ width: 280, padding: '4px 0' }} onClick={(e) => e.stopPropagation()}>
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
                            />
                            <Button 
                                type="text" 
                                size="small" 
                                danger 
                                aria-label={t('comment.delete')}
                                icon={<FaTrash style={{ fontSize: 11 }} />} 
                                onClick={handleDelete}
                            />
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
                        onChange={(e) => setReplyText(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        onPressEnter={(e) => {
                            if (!e.shiftKey) {
                                e.preventDefault();
                                handleAddReply();
                            }
                        }}
                        style={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Flex justify="flex-end" style={{ marginTop: 8 }}>
                        <Button 
                            type="primary" 
                            size="small" 
                            icon={<FaPaperPlane style={{ fontSize: 10 }} />} 
                            onClick={handleAddReply}
                            disabled={!replyText.trim()}
                        >
                            {t('comment.sendReply')}
                        </Button>
                    </Flex>
                </div>
            </Flex>
        </div>
    );
};
