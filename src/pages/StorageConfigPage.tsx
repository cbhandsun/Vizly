import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Form, Input, Button, Card, Switch, Typography, Space } from 'antd';
import { SaveOutlined, ApiOutlined, CloudServerOutlined } from '@ant-design/icons';
import { s3Storage as storageService, StorageConfig } from '../services/StorageService';
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { redactSensitiveValue } from '@/services/storageSecurity';


const { Title, Text, Paragraph } = Typography;

const StorageConfigPage: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const config = storageService.getConfig();
        if (config) {
            form.setFieldsValue({ ...config, secretAccessKey: '' });
        }
    }, [form]);

    const onFinish = (values: StorageConfig) => {
        setLoading(true);
        try {
            storageService.saveConfig(values);
            appMessage.success(t('storageConfig.saveSuccess'));
        } catch {
            appMessage.error(t('storageConfig.saveFail'));
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        try {
            const values = await form.validateFields();

            await storageService.testConnection(values);
            appMessage.success(t('storageConfig.testSuccess'));
        } catch (error: any) {
            const redactedError = redactSensitiveValue({
                name: error.name,
                message: error.message,
                metadata: error.$metadata,
                stack: error.stack
            });
            console.error(redactedError);
            const errorDetails = JSON.stringify(redactedError, null, 2);

            appModal.error({
                title: t('storageConfig.testFail.title'),
                width: 600,
                content: (
                    <div>
                        {(error.message === 'Failed to fetch' || error.name === 'TypeError') && (
                            <div style={{ background: '#fff2f0', border: '1px solid #ffccc7', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
                                <Paragraph type="danger" style={{ margin: 0, fontWeight: 'bold' }}>
                                    {t('storageConfig.testFail.corsTitle')}
                                </Paragraph>
                                <Paragraph style={{ margin: 0, fontSize: 12 }}>
                                    {t('storageConfig.testFail.corsDesc')}
                                    <br />
                                    <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                                        <li>Origin (来源): <code>*</code> {t('storageConfig.testFail.corsOrigin').replace('Origin (来源): * 或本站地址', '或本站地址')}</li>
                                        <li>Methods (方法): <code>GET, PUT, POST, HEAD</code></li>
                                    </ul>
                                </Paragraph>
                            </div>
                        )}
                        <p>{t('storageConfig.testFail.genericTitle')}</p>
                        <ul>
                            <li>{t('storageConfig.testFail.check1')}</li>
                            <li>{t('storageConfig.testFail.check2')}</li>
                            <li>{t('storageConfig.testFail.check3')}</li>
                            <li>{t('storageConfig.testFail.check4')}</li>
                        </ul>
                        <div style={{ marginTop: 10 }}>
                            <Text type="secondary">{t('storageConfig.testFail.errorDetail')}</Text>
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
                    Settings &amp; Storage
                </div>
                <div style={{ width: 220, display: 'flex', justifyContent: 'flex-end' }}>
                     <Button type="text" onClick={() => navigate('/manage')}>Return to Workspace</Button>
                </div>
            </header>

            <div style={{ padding: '48px 24px', maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
                <div>
                    <Title level={2}><CloudServerOutlined /> {t('storageConfig.pageTitle')}</Title>
                    <Paragraph type="secondary">
                        {t('storageConfig.pageDescription')}
                    </Paragraph>
                </div>

                <Card
                    title={<span style={{ fontWeight: 700, letterSpacing: '-0.2px' }}>Connection Settings</span>}
                    variant="borderless"
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
                            label={t('storageConfig.form.endpointLabel')}
                            tooltip="例如: https://s3.amazonaws.com 或 https://play.min.io"
                            rules={[{ required: true, message: t('storageConfig.form.endpointRequired') }]}
                        >
                            <Input placeholder="https://..." />
                        </Form.Item>

                        <Form.Item
                            name="bucket"
                            label={t('storageConfig.form.bucketLabel')}
                            rules={[{ required: true, message: t('storageConfig.form.bucketRequired') }]}
                        >
                            <Input placeholder="my-diagrams-bucket" />
                        </Form.Item>

                        <Form.Item
                            name="region"
                            label={t('storageConfig.form.regionLabel')}
                            rules={[{ required: true, message: t('storageConfig.form.regionRequired') }]}
                        >
                            <Input placeholder="us-east-1" />
                        </Form.Item>

                        <Form.Item
                            name="accessKeyId"
                            label="Access Key ID"
                            rules={[{ required: true, message: t('storageConfig.form.accessKeyRequired') }]}
                        >
                            <Input.Password placeholder="Access Key" />
                        </Form.Item>

                        <Form.Item
                            name="secretAccessKey"
                            label="Secret Access Key"
                            rules={[{
                                validator: (_, value) => {
                                    if (value || storageService.getConfig()?.secretAccessKey) {
                                        return Promise.resolve();
                                    }
                                    return Promise.reject(new Error(t('storageConfig.form.secretKeyRequired')));
                                }
                            }]}
                        >
                            <Input.Password placeholder="Secret Key" />
                        </Form.Item>

                        <Form.Item
                            name="s3ForcePathStyle"
                            label={t('storageConfig.form.forcePathStyleLabel')}
                            valuePropName="checked"
                            tooltip={t('storageConfig.form.forcePathStyleTooltip')}
                        >
                            <Switch />
                        </Form.Item>

                        <Form.Item>
                            <Space>
                                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                                    {t('storageConfig.form.saveBtn')}
                                </Button>
                                <Button icon={<ApiOutlined />} onClick={handleTestConnection} loading={testing}>
                                    {t('storageConfig.form.testBtn')}
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>

                <Card title={t('storageConfig.notes.title')} size="small">
                    <ul>
                        <li>{t('storageConfig.notes.cors')}</li>
                        <li>{t('storageConfig.notes.security')}</li>
                    </ul>
                </Card>
            </div>
        </div>
    </div>
    );
};

export default StorageConfigPage;
