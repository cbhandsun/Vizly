import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Switch, Typography, Space, Select } from 'antd';
import { appMessage as message, appModal } from '@/core';
import { SaveOutlined, ApiOutlined, CloudServerOutlined } from '@ant-design/icons';
import { s3Storage as storageService, StorageConfig } from '../services/StorageService';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const StorageConfigPage: React.FC = () => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const config = storageService.getConfig();
        if (config) {
            form.setFieldsValue(config);
        }
    }, [form]);

    const onFinish = (values: StorageConfig) => {
        setLoading(true);
        try {
            storageService.saveConfig(values);
            message.success('配置已保存');
        } catch (error) {
            message.error('保存失败');
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        try {
            // 临时保存当前表单的值到 service 以便测试
            const values = await form.validateFields();
            storageService.saveConfig(values);

            await storageService.testConnection();
            message.success('连接成功！S3 配置有效。');
        } catch (error: any) {
            console.error(error);
            const errorDetails = JSON.stringify({
                name: error.name,
                message: error.message,
                metadata: error.$metadata,
                stack: error.stack
            }, null, 2);

            appModal.error({
                title: '连接失败',
                width: 600,
                content: (
                    <div>
                        {(error.message === 'Failed to fetch' || error.name === 'TypeError') && (
                            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
                                <Paragraph type="danger" style={{ margin: 0, fontWeight: 'bold' }}>
                                    检测到网络/CORS 错误
                                </Paragraph>
                                <Paragraph style={{ margin: 0, fontSize: 12 }}>
                                    从浏览器直接访问对象存储通常需要配置 <strong>跨域资源共享 (CORS)</strong>。
                                    <br />
                                    请登录云服务商控制台（如七牛云、AWS），找到 Bucket 的 CORS 设置，并添加允许规则：
                                    <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                                        <li>Origin (来源): <code>*</code> 或本站地址</li>
                                        <li>Methods (方法): <code>GET, PUT, POST, HEAD</code></li>
                                    </ul>
                                </Paragraph>
                            </div>
                        )}
                        <p>无法连接到 S3 服务，请检查以下几点：</p>
                        <ul>
                            <li>Endpoint 地址是否正确（需包含 http/https）</li>
                            <li>Access Key / Secret Key 是否正确</li>
                            <li>Bucket 是否存在且有权限访问</li>
                            <li>网络是否允许跨域 (CORS) 请求</li>
                        </ul>
                        <div style={{ marginTop: 10 }}>
                            <Text type="secondary">详细错误信息：</Text>
                            <pre style={{
                                background: '#f5f5f5',
                                padding: 10,
                                borderRadius: 4,
                                maxHeight: 200,
                                overflow: 'auto',
                                fontSize: 12
                            }}>
                                {errorDetails}
                            </pre>
                        </div>
                    </div>
                )
            });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--vz-dashboard-bg, #fcfcfc)' }}>
            {/* Consistent Header */}
            <header className="workspace-global-header" style={{ marginBottom: 0 }}>
                <div className="workspace-header-brand" onClick={() => navigate('/manage')}>
                    <div className="workspace-header-logo">
                        <div style={{
                            width: 28,
                            height: 28,
                            background: 'var(--vz-brand-gradient)',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: '800',
                            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                        }}>V</div>
                    </div>
                    <div className="workspace-header-title">Vizly</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--vz-text-secondary)' }}>
                    Settings & Storage
                </div>
                <div style={{ width: 220, display: 'flex', justifyContent: 'flex-end' }}>
                     <Button type="text" onClick={() => navigate('/manage')}>Return to Workspace</Button>
                </div>
            </header>

            <div style={{ padding: '48px 24px', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
                <div>
                    <Title level={2}><CloudServerOutlined /> 云端存储配置</Title>
                    <Paragraph type="secondary">
                        配置 S3 兼容的云存储服务（如 AWS S3, MinIO, 阿里云 OSS, 七牛云等），用于同步和管理架构图。
                    </Paragraph>
                </div>

                <Card 
                    title={<span style={{ fontWeight: 700, letterSpacing: '-0.2px' }}>Connection Settings</span>} 
                    bordered={false} 
                    style={{ 
                        borderRadius: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 16px 32px -8px rgba(0,0,0,0.05)',
                        background: 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(20px)'
                    }}
                >
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={onFinish}
                        initialValues={{
                            s3ForcePathStyle: true,
                            region: 'us-east-1'
                        }}
                    >
                        <Form.Item
                            name="endpoint"
                            label="Endpoint API地址"
                            tooltip="例如: https://s3.amazonaws.com 或 https://play.min.io"
                            rules={[{ required: true, message: '请输入 Endpoint' }]}
                        >
                            <Input placeholder="https://..." />
                        </Form.Item>

                        <Form.Item
                            name="bucket"
                            label="Bucket 桶名称"
                            rules={[{ required: true, message: '请输入 Bucket 名称' }]}
                        >
                            <Input placeholder="my-diagrams-bucket" />
                        </Form.Item>

                        <Form.Item
                            name="region"
                            label="Region 区域"
                            rules={[{ required: true, message: '请输入 Region' }]}
                        >
                            <Input placeholder="us-east-1" />
                        </Form.Item>

                        <Form.Item
                            name="accessKeyId"
                            label="Access Key ID"
                            rules={[{ required: true, message: '请输入 Access Key' }]}
                        >
                            <Input.Password placeholder="Access Key" />
                        </Form.Item>

                        <Form.Item
                            name="secretAccessKey"
                            label="Secret Access Key"
                            rules={[{ required: true, message: '请输入 Secret Key' }]}
                        >
                            <Input.Password placeholder="Secret Key" />
                        </Form.Item>

                        <Form.Item
                            name="s3ForcePathStyle"
                            label="强制路径样式 (Path Style)"
                            valuePropName="checked"
                            tooltip="许多 S3 兼容服务（如 MinIO）需要开启此选项"
                        >
                            <Switch />
                        </Form.Item>

                        <Form.Item>
                            <Space>
                                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                                    保存配置
                                </Button>
                                <Button icon={<ApiOutlined />} onClick={handleTestConnection} loading={testing}>
                                    测试连接
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>

                <Card title="说明" size="small">
                    <ul>
                        <li>请确保您的 Bucket 允许跨域 (CORS) 访问，如果您是通过浏览器直接访问。</li>
                        <li>Access Key 和 Secret Key 将仅保存在本地浏览器存储中。</li>
                    </ul>
                </Card>
            </div>
        </div>
    </div>
    );
};

export default StorageConfigPage;
