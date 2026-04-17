import React, { useState, useMemo } from 'react';
import { Input, List, Button, Tag, Typography, Empty, Flex, theme, Space, Badge, Tooltip } from 'antd';
import { FaSearch, FaCheck, FaTrash, FaChevronRight, FaRegCommentDots } from 'react-icons/fa';
import { useDiagramStore } from '../../store/useDiagramStore';
import { useReactFlow } from '@xyflow/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;

export const CommentPanel: React.FC = () => {
    const { token } = theme.useToken();
    const { comments, removeComment, updateComment } = useDiagramStore();
    const { setCenter } = useReactFlow();
    
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

    const filteredComments = useMemo(() => {
        return (comments || []).filter(c => {
            const matchesSearch = (c.content || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                                 (c.authorName || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = filter === 'all' || 
                                 (filter === 'resolved' && c.isResolved) ||
                                 (filter === 'unresolved' && !c.isResolved);
            return matchesSearch && matchesFilter;
        }).sort((a, b) => b.createdAt - a.createdAt);
    }, [comments, searchTerm, filter]);

    const handleFocus = (c: any) => {
        if (c.x !== undefined && c.y !== undefined) {
            setCenter(c.x + 16, c.y + 16, { zoom: 1.5, duration: 800 });
        }
    };

    const toggleResolve = (e: React.MouseEvent, id: string, currentStatus: boolean) => {
        e.stopPropagation();
        updateComment(id, { isResolved: !currentStatus });
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        removeComment(id);
    };

    return (
        <Flex vertical style={{ height: '100%', overflow: 'hidden' }} className="comment-panel">
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                <Input
                    prefix={<FaSearch style={{ color: token.colorTextDescription }} />}
                    placeholder="搜索评论或作者..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    allowClear
                    size="small"
                />
                <Flex gap={8} style={{ marginTop: 12 }}>
                    <Button 
                        size="small" 
                        type={filter === 'unresolved' ? 'primary' : 'default'} 
                        onClick={() => setFilter('unresolved')}
                        className="rounded-full"
                    >
                        未解决
                    </Button>
                    <Button 
                        size="small" 
                        type={filter === 'resolved' ? 'primary' : 'default'} 
                        onClick={() => setFilter('resolved')}
                        className="rounded-full"
                    >
                        已解决
                    </Button>
                    <Button 
                        size="small" 
                        type={filter === 'all' ? 'primary' : 'default'} 
                        onClick={() => setFilter('all')}
                        className="rounded-full"
                    >
                        全部
                    </Button>
                </Flex>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredComments.length > 0 ? (
                    <List
                        dataSource={filteredComments}
                        renderItem={(item) => (
                            <List.Item
                                className="comment-list-item"
                                onClick={() => handleFocus(item)}
                                style={{ 
                                    padding: '12px 16px', 
                                    cursor: 'pointer',
                                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                    transition: 'background 0.2s',
                                    backgroundColor: item.isResolved ? 'rgba(0,0,0,0.02)' : 'transparent'
                                }}
                            >
                                <Flex vertical gap={4} style={{ width: '100%' }}>
                                    <Flex justify="space-between" align="center">
                                        <Space size={8}>
                                            <div style={{ 
                                                width: 24, height: 24, borderRadius: '50%', 
                                                backgroundColor: item.authorColor || token.colorPrimary, color: '#fff', 
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 10, fontWeight: 'bold'
                                            }}>
                                                {(item.authorName || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <Text strong style={{ fontSize: 13 }}>{item.authorName}</Text>
                                        </Space>
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            {dayjs(item.createdAt).fromNow()}
                                        </Text>
                                    </Flex>
                                    
                                    <div style={{ paddingLeft: 32 }}>
                                        <Text style={{ 
                                            fontSize: 13, 
                                            display: '-webkit-box', 
                                            WebkitLineClamp: 2, 
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            textDecoration: item.isResolved ? 'line-through' : 'none',
                                            color: item.isResolved ? token.colorTextDescription : token.colorText
                                        }}>
                                            {item.content}
                                        </Text>
                                        
                                        <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
                                            <Space size={8}>
                                                {item.replies.length > 0 && (
                                                    <Tag color="blue" icon={<FaRegCommentDots />} style={{ margin: 0, fontSize: 10 }}>
                                                        {item.replies.length} 条回复
                                                    </Tag>
                                                )}
                                                {item.isResolved && (
                                                    <Tag color="success" icon={<FaCheck />} style={{ margin: 0, fontSize: 10 }}>
                                                        已解决
                                                    </Tag>
                                                )}
                                            </Space>
                                            
                                            <Space size={4}>
                                                <Tooltip title={item.isResolved ? "取消解决" : "标记为完成"}>
                                                    <Button 
                                                        size="small" 
                                                        type="text" 
                                                        icon={<FaCheck />} 
                                                        onClick={(e) => toggleResolve(e, item.id, item.isResolved)}
                                                        className={item.isResolved ? 'text-green-500' : 'text-slate-400'}
                                                    />
                                                </Tooltip>
                                                <Tooltip title="删除">
                                                    <Button 
                                                        size="small" 
                                                        type="text" 
                                                        danger 
                                                        icon={<FaTrash />} 
                                                        onClick={(e) => handleDelete(e, item.id)}
                                                    />
                                                </Tooltip>
                                                <FaChevronRight style={{ fontSize: 10, color: token.colorTextQuaternary, marginLeft: 4 }} />
                                            </Space>
                                        </Flex>
                                    </div>
                                </Flex>
                            </List.Item>
                        )}
                    />
                ) : (
                    <div style={{ padding: '64px 32px' }}>
                        <Empty 
                            image={Empty.PRESENTED_IMAGE_SIMPLE} 
                            description={searchTerm ? "未找到匹配的评论" : "暂无评论反馈"} 
                        />
                    </div>
                )}
            </div>
        </Flex>
    );
};
