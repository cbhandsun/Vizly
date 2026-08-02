import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, Form, Input, Space, Switch, Typography } from 'antd';
import { ApiOutlined, CloudServerOutlined, SaveOutlined } from '@ant-design/icons';

import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { safeLog } from '@/core/utils/consoleCleanup';
import { s3Storage as storageService, type StorageConfig } from '@/services/StorageService';
import { redactSensitiveValue, S3_STORAGE_INPUT_LIMITS } from '@/services/storageSecurity';
import {
    isAbortFailure,
    isFormValidationFailure,
    S3_CONNECTION_TIMEOUT_MS,
} from './storageConfigPageModel';
import './StorageConfigPage.css';

const { Title, Paragraph } = Typography;

type ConnectionState = 'not-configured' | 'saved' | 'dirty' | 'testing' | 'verified' | 'failed';

const StorageConfigPage: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm<StorageConfig>();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [connectionState, setConnectionState] = useState<ConnectionState>(
        storageService.getConfig() ? 'saved' : 'not-configured',
    );
    const testControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const navigate = useNavigate();

    useEffect(() => {
        mountedRef.current = true;
        const config = storageService.getConfig();
        if (config) {
            form.setFieldsValue({ ...config, secretAccessKey: '' });
        }

        return () => {
            mountedRef.current = false;
            testControllerRef.current?.abort();
            testControllerRef.current = null;
        };
    }, [form]);

    const onFinish = (values: StorageConfig) => {
        setLoading(true);
        try {
            storageService.saveConfig(values);
            setConnectionState('saved');
            appMessage.success(t('storageConfig.saveSuccess'));
        } catch {
            setConnectionState('failed');
            appMessage.error(t('storageConfig.saveFail'));
        } finally {
            setLoading(false);
        }
    };

    const handleTestConnection = async () => {
        if (loading || testing) return;

        let values: StorageConfig;
        try {
            values = await form.validateFields();
        } catch (error: unknown) {
            if (isFormValidationFailure(error)) {
                setConnectionState('dirty');
                return;
            }
            safeLog.error('S3 configuration validation failed', redactSensitiveValue(error));
            setConnectionState('failed');
            appMessage.error(t('storageConfig.validationFail'));
            return;
        }

        if (!mountedRef.current) return;

        testControllerRef.current?.abort();
        const controller = new AbortController();
        testControllerRef.current = controller;
        const timeoutId = window.setTimeout(() => controller.abort(), S3_CONNECTION_TIMEOUT_MS);
        setTesting(true);
        setConnectionState('testing');

        try {
            await storageService.testConnection(values, controller.signal);
            if (!mountedRef.current) return;
            if (controller.signal.aborted) {
                setConnectionState('failed');
                appMessage.error(t('storageConfig.testTimeout'));
                return;
            }
            setConnectionState('verified');
            appMessage.success(t('storageConfig.testSuccess'));
        } catch (error: unknown) {
            if (!mountedRef.current) return;
            if (isAbortFailure(error)) {
                setConnectionState('failed');
                appMessage.error(t('storageConfig.testTimeout'));
                return;
            }

            const safeError = error instanceof Error ? error : new Error(String(error));
            const redactedError = redactSensitiveValue({
                name: safeError.name,
                message: safeError.message,
                metadata: error && typeof error === 'object' && '$metadata' in error
                    ? error.$metadata
                    : undefined,
            });
            safeLog.error('S3 connection test failed', redactedError);
            setConnectionState('failed');

            const isNetworkFailure = safeError.message === 'Failed to fetch' || safeError.name === 'TypeError';
            appModal.error({
                title: t('storageConfig.testFail.title'),
                width: 600,
                content: (
                    <div className="storage-config-error-content">
                        {isNetworkFailure && (
                            <Alert
                                type="error"
                                showIcon
                                title={t('storageConfig.testFail.corsTitle')}
                                description={t('storageConfig.testFail.corsDesc')}
                            />
                        )}
                        <p>{t('storageConfig.testFail.genericTitle')}</p>
                        <ul>
                            <li>{t('storageConfig.testFail.check1')}</li>
                            <li>{t('storageConfig.testFail.check2')}</li>
                            <li>{t('storageConfig.testFail.check3')}</li>
                            <li>{t('storageConfig.testFail.check4')}</li>
                        </ul>
                    </div>
                ),
            });
        } finally {
            window.clearTimeout(timeoutId);
            if (testControllerRef.current === controller) testControllerRef.current = null;
            if (mountedRef.current) setTesting(false);
        }
    };

    const statusCopy: Record<ConnectionState, { type: 'info' | 'success' | 'warning' | 'error'; message: string }> = {
        'not-configured': { type: 'info', message: t('storageConfig.status.notConfigured') },
        saved: { type: 'info', message: t('storageConfig.status.saved') },
        dirty: { type: 'warning', message: t('storageConfig.status.dirty') },
        testing: { type: 'info', message: t('storageConfig.status.testing') },
        verified: { type: 'success', message: t('storageConfig.status.verified') },
        failed: { type: 'error', message: t('storageConfig.status.failed') },
    };

    return (
        <div className="storage-config-page">
            <header className="storage-config-header">
                <button
                    type="button"
                    className="storage-config-brand"
                    onClick={() => navigate('/manage')}
                    aria-label={t('storageConfig.returnToWorkspace')}
                >
                    <span className="storage-config-logo" aria-hidden="true">V</span>
                    <span className="storage-config-brand-name">Vizly</span>
                </button>
                <span className="storage-config-header-title">{t('storageConfig.headerTitle')}</span>
                <Button className="storage-config-return" type="text" onClick={() => navigate('/manage')}>
                    {t('storageConfig.returnToWorkspace')}
                </Button>
            </header>

            <main className="storage-config-main" data-smoke-ready="storage-config">
                <div className="storage-config-intro">
                    <Title level={2}><CloudServerOutlined /> {t('storageConfig.pageTitle')}</Title>
                    <Paragraph type="secondary">{t('storageConfig.pageDescription')}</Paragraph>
                    <Alert
                        className="storage-config-status"
                        type={statusCopy[connectionState].type}
                        showIcon
                        message={statusCopy[connectionState].message}
                        aria-live="polite"
                    />
                </div>

                <Card
                    className="storage-config-card"
                    title={t('storageConfig.connectionSettings')}
                    variant="borderless"
                >
                    <Form<StorageConfig>
                        className="storage-config-form"
                        form={form}
                        layout="vertical"
                        onFinish={onFinish}
                        onValuesChange={() => setConnectionState('dirty')}
                        initialValues={{ s3ForcePathStyle: true, region: 'us-east-1' }}
                    >
                        <Form.Item
                            name="endpoint"
                            label={t('storageConfig.form.endpointLabel')}
                            tooltip={t('storageConfig.form.endpointTooltip')}
                            rules={[{ required: true, message: t('storageConfig.form.endpointRequired') }]}
                        >
                            <Input placeholder="https://..." maxLength={S3_STORAGE_INPUT_LIMITS.endpoint} autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                            name="bucket"
                            label={t('storageConfig.form.bucketLabel')}
                            rules={[{ required: true, message: t('storageConfig.form.bucketRequired') }]}
                        >
                            <Input placeholder="my-diagrams-bucket" maxLength={S3_STORAGE_INPUT_LIMITS.bucket} autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                            name="region"
                            label={t('storageConfig.form.regionLabel')}
                            rules={[{ required: true, message: t('storageConfig.form.regionRequired') }]}
                        >
                            <Input placeholder="us-east-1" maxLength={S3_STORAGE_INPUT_LIMITS.region} autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                            name="accessKeyId"
                            label={t('storageConfig.form.accessKeyLabel')}
                            rules={[{ required: true, message: t('storageConfig.form.accessKeyRequired') }]}
                        >
                            <Input.Password
                                placeholder={t('storageConfig.form.accessKeyPlaceholder')}
                                maxLength={S3_STORAGE_INPUT_LIMITS.accessKeyId}
                                autoComplete="off"
                            />
                        </Form.Item>

                        <Form.Item
                            name="secretAccessKey"
                            label={t('storageConfig.form.secretKeyLabel')}
                            extra={t('storageConfig.form.secretKeyHint')}
                            rules={[{
                                validator: (_, value) => {
                                    if (value || storageService.getConfig()?.secretAccessKey) return Promise.resolve();
                                    return Promise.reject(new Error(t('storageConfig.form.secretKeyRequired')));
                                },
                            }]}
                        >
                            <Input.Password
                                placeholder={t('storageConfig.form.secretKeyPlaceholder')}
                                maxLength={S3_STORAGE_INPUT_LIMITS.secretAccessKey}
                                autoComplete="new-password"
                            />
                        </Form.Item>

                        <Form.Item
                            name="s3ForcePathStyle"
                            label={t('storageConfig.form.forcePathStyleLabel')}
                            valuePropName="checked"
                            tooltip={t('storageConfig.form.forcePathStyleTooltip')}
                        >
                            <Switch aria-label={t('storageConfig.form.forcePathStyleLabel')} />
                        </Form.Item>

                        <Form.Item className="storage-config-actions-item">
                            <Space className="storage-config-actions" wrap>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    icon={<SaveOutlined />}
                                    loading={loading}
                                    disabled={testing}
                                >
                                    {t('storageConfig.form.saveBtn')}
                                </Button>
                                <Button
                                    icon={<ApiOutlined />}
                                    onClick={() => void handleTestConnection()}
                                    loading={testing}
                                    disabled={loading}
                                >
                                    {t('storageConfig.form.testBtn')}
                                </Button>
                            </Space>
                        </Form.Item>
                    </Form>
                </Card>

                <Card className="storage-config-notes" title={t('storageConfig.notes.title')} size="small">
                    <ul>
                        <li>{t('storageConfig.notes.cors')}</li>
                        <li>{t('storageConfig.notes.security')}</li>
                    </ul>
                </Card>
            </main>
        </div>
    );
};

export default StorageConfigPage;
