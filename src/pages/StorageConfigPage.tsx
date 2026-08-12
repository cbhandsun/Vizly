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
    getFirstInvalidFieldName,
    S3_CONNECTION_TIMEOUT_MS,
    validateStorageAccessKeyId,
    validateStorageBucket,
    validateStorageEndpoint,
    validateStorageRegion,
    validateStorageSecretAccessKey,
} from './storageConfigPageModel';
import { StorageSecretInput } from './StorageSecretInput';
import { useUnsavedNavigationGuard } from './useUnsavedNavigationGuard';
import './StorageConfigPage.css';

const { Title, Paragraph } = Typography;

type ConnectionState = 'not-configured' | 'saved' | 'dirty' | 'invalid' | 'testing' | 'verified' | 'failed';

const StorageConfigPage: React.FC = () => {
    const { t } = useTranslation();
    const [form] = Form.useForm<StorageConfig>();
    const [loading, setLoading] = useState(false);
    const [testing, setTesting] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [connectionState, setConnectionState] = useState<ConnectionState>(
        storageService.getConfig() ? 'saved' : 'not-configured',
    );
    const testControllerRef = useRef<AbortController | null>(null);
    const testedValuesRef = useRef<StorageConfig | null>(null);
    const pageTitleRef = useRef<HTMLHeadingElement>(null);
    const entryFocusFrameRef = useRef<number | null>(null);
    const validationFocusFrameRef = useRef<number | null>(null);
    const mountedRef = useRef(true);
    const navigate = useNavigate();

    useUnsavedNavigationGuard({
        when: hasUnsavedChanges,
        copy: {
            title: t('storageConfig.leaveConfirm.title'),
            content: t('storageConfig.leaveConfirm.content'),
            confirm: t('storageConfig.leaveConfirm.confirm'),
            keepEditing: t('storageConfig.leaveConfirm.keepEditing'),
        },
    });

    useEffect(() => {
        mountedRef.current = true;
        const config = storageService.getConfig();
        if (config) {
            form.setFieldsValue({ ...config, secretAccessKey: '' });
        }
        entryFocusFrameRef.current = window.requestAnimationFrame(() => {
            entryFocusFrameRef.current = null;
            const activeElement = document.activeElement;
            if (
                mountedRef.current
                && (!activeElement || activeElement === document.body)
            ) {
                pageTitleRef.current?.focus({ preventScroll: true });
            }
        });

        return () => {
            mountedRef.current = false;
            if (entryFocusFrameRef.current !== null) {
                window.cancelAnimationFrame(entryFocusFrameRef.current);
                entryFocusFrameRef.current = null;
            }
            if (validationFocusFrameRef.current !== null) {
                window.cancelAnimationFrame(validationFocusFrameRef.current);
                validationFocusFrameRef.current = null;
            }
            testControllerRef.current?.abort();
            testControllerRef.current = null;
        };
    }, [form]);

    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const onFinish = (values: StorageConfig) => {
        setLoading(true);
        try {
            storageService.saveConfig(values);
            setHasUnsavedChanges(false);
            setConnectionState('saved');
            appMessage.success(t('storageConfig.saveSuccess'));
        } catch {
            setConnectionState('failed');
            appMessage.error(t('storageConfig.saveFail'));
        } finally {
            setLoading(false);
        }
    };

    const handleValidationFailure = (error: unknown) => {
        setConnectionState('invalid');
        const fieldName = getFirstInvalidFieldName(error);
        if (!fieldName) return;

        if (validationFocusFrameRef.current !== null) {
            window.cancelAnimationFrame(validationFocusFrameRef.current);
        }
        validationFocusFrameRef.current = window.requestAnimationFrame(() => {
            validationFocusFrameRef.current = null;
            if (mountedRef.current) {
                form.scrollToField(fieldName, { block: 'center', focus: true });
            }
        });
    };

    const handleTestConnection = async () => {
        if (loading || testing) return;

        let values: StorageConfig;
        try {
            values = await form.validateFields();
        } catch (error: unknown) {
            if (isFormValidationFailure(error)) {
                handleValidationFailure(error);
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
        testedValuesRef.current = values;
        const timeoutId = window.setTimeout(() => controller.abort(), S3_CONNECTION_TIMEOUT_MS);
        setTesting(true);
        setConnectionState('testing');

        try {
            await storageService.testConnection(values, controller.signal);
            if (!mountedRef.current) return;
            if (testedValuesRef.current !== values) return;
            if (controller.signal.aborted) {
                if (testControllerRef.current !== controller) return;
                setConnectionState('failed');
                appMessage.error(t('storageConfig.testTimeout'));
                return;
            }
            setConnectionState('verified');
            appMessage.success(t('storageConfig.testSuccess'));
        } catch (error: unknown) {
            if (!mountedRef.current) return;
            if (testedValuesRef.current !== values) return;
            if (isAbortFailure(error)) {
                if (testControllerRef.current !== controller) return;
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
                okText: t('common.ok'),
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
            if (testControllerRef.current === controller) {
                testControllerRef.current = null;
                testedValuesRef.current = null;
                if (mountedRef.current) setTesting(false);
            }
        }
    };

    const handleFormValuesChange = () => {
        if (testing) {
            testControllerRef.current?.abort();
            testControllerRef.current = null;
            testedValuesRef.current = null;
            setTesting(false);
        }
        setHasUnsavedChanges(true);
        setConnectionState('dirty');
    };

    const cancelConnectionTest = () => {
        testControllerRef.current?.abort();
        testControllerRef.current = null;
        testedValuesRef.current = null;
        setTesting(false);
        setConnectionState('dirty');
    };

    const handleReturnToWorkspace = () => navigate('/manage');

    const statusCopy: Record<ConnectionState, { type: 'info' | 'success' | 'warning' | 'error'; message: string }> = {
        'not-configured': { type: 'info', message: t('storageConfig.status.notConfigured') },
        saved: { type: 'info', message: t('storageConfig.status.saved') },
        dirty: { type: 'warning', message: t('storageConfig.status.dirty') },
        invalid: { type: 'error', message: t('storageConfig.status.invalid') },
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
                    onClick={handleReturnToWorkspace}
                    aria-label={t('storageConfig.returnToWorkspace')}
                >
                    <span className="storage-config-logo" aria-hidden="true">V</span>
                    <span className="storage-config-brand-name">Vizly</span>
                </button>
                <span className="storage-config-header-title">{t('storageConfig.headerTitle')}</span>
                <Button className="storage-config-return" type="text" onClick={handleReturnToWorkspace}>
                    {t('storageConfig.returnToWorkspace')}
                </Button>
            </header>

            <main className="storage-config-main" data-smoke-ready="storage-config">
                <div className="storage-config-intro">
                    <Title
                        ref={pageTitleRef}
                        className="storage-config-page-title"
                        level={1}
                        tabIndex={-1}
                    >
                        <CloudServerOutlined /> {t('storageConfig.pageTitle')}
                    </Title>
                    <Paragraph type="secondary">{t('storageConfig.pageDescription')}</Paragraph>
                    <Alert
                        className="storage-config-status"
                        type={statusCopy[connectionState].type}
                        showIcon
                        title={statusCopy[connectionState].message}
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
                        onFinishFailed={handleValidationFailure}
                        onValuesChange={handleFormValuesChange}
                        initialValues={{ s3ForcePathStyle: true, region: 'us-east-1' }}
                    >
                        <Form.Item
                            name="endpoint"
                            label={t('storageConfig.form.endpointLabel')}
                            extra={t('storageConfig.form.endpointTooltip')}
                            rules={[{
                                validator: (_, value: unknown) => {
                                    const error = validateStorageEndpoint(value);
                                    if (!error) return Promise.resolve();
                                    return Promise.reject(new Error(t(
                                        error === 'required'
                                            ? 'storageConfig.form.endpointRequired'
                                            : 'storageConfig.form.endpointInvalid',
                                    )));
                                },
                            }]}
                        >
                            <Input placeholder="https://..." maxLength={S3_STORAGE_INPUT_LIMITS.endpoint} autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                            name="bucket"
                            label={t('storageConfig.form.bucketLabel')}
                            rules={[{
                                validator: (_, value: unknown) => {
                                    const error = validateStorageBucket(value);
                                    if (!error) return Promise.resolve();
                                    return Promise.reject(new Error(t(
                                        error === 'required'
                                            ? 'storageConfig.form.bucketRequired'
                                            : 'storageConfig.form.bucketInvalid',
                                    )));
                                },
                            }]}
                        >
                            <Input placeholder="my-diagrams-bucket" maxLength={S3_STORAGE_INPUT_LIMITS.bucket} autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                            name="region"
                            label={t('storageConfig.form.regionLabel')}
                            rules={[{
                                validator: (_, value: unknown) => {
                                    const error = validateStorageRegion(value);
                                    if (!error) return Promise.resolve();
                                    return Promise.reject(new Error(t(
                                        error === 'required'
                                            ? 'storageConfig.form.regionRequired'
                                            : 'storageConfig.form.regionInvalid',
                                    )));
                                },
                            }]}
                        >
                            <Input placeholder="us-east-1" maxLength={S3_STORAGE_INPUT_LIMITS.region} autoComplete="off" />
                        </Form.Item>

                        <Form.Item
                            name="accessKeyId"
                            label={t('storageConfig.form.accessKeyLabel')}
                            rules={[{
                                validator: (_, value: unknown) => {
                                    const error = validateStorageAccessKeyId(value);
                                    if (!error) return Promise.resolve();
                                    return Promise.reject(new Error(t(
                                        error === 'required'
                                            ? 'storageConfig.form.accessKeyRequired'
                                            : 'storageConfig.form.accessKeyInvalid',
                                    )));
                                },
                            }]}
                        >
                            <StorageSecretInput
                                placeholder={t('storageConfig.form.accessKeyPlaceholder')}
                                maxLength={S3_STORAGE_INPUT_LIMITS.accessKeyId}
                                autoComplete="off"
                                visibilityLabel={t('storageConfig.form.accessKeyVisibilityLabel')}
                                revealTitle={t('storageConfig.form.revealSecretValue')}
                                concealTitle={t('storageConfig.form.concealSecretValue')}
                            />
                        </Form.Item>

                        <Form.Item
                            name="secretAccessKey"
                            label={t('storageConfig.form.secretKeyLabel')}
                            extra={t('storageConfig.form.secretKeyHint')}
                            rules={[{
                                validator: (_, value: unknown) => {
                                    const error = validateStorageSecretAccessKey(
                                        value,
                                        !!storageService.getConfig()?.secretAccessKey,
                                    );
                                    if (!error) return Promise.resolve();
                                    return Promise.reject(new Error(t(
                                        error === 'required'
                                            ? 'storageConfig.form.secretKeyRequired'
                                            : 'storageConfig.form.secretKeyInvalid',
                                    )));
                                },
                            }]}
                        >
                            <StorageSecretInput
                                placeholder={t('storageConfig.form.secretKeyPlaceholder')}
                                maxLength={S3_STORAGE_INPUT_LIMITS.secretAccessKey}
                                autoComplete="new-password"
                                visibilityLabel={t('storageConfig.form.secretKeyVisibilityLabel')}
                                revealTitle={t('storageConfig.form.revealSecretValue')}
                                concealTitle={t('storageConfig.form.concealSecretValue')}
                            />
                        </Form.Item>

                        <Form.Item
                            name="s3ForcePathStyle"
                            label={t('storageConfig.form.forcePathStyleLabel')}
                            valuePropName="checked"
                            extra={t('storageConfig.form.forcePathStyleTooltip')}
                        >
                            <Switch aria-label={t('storageConfig.form.forcePathStyleLabel')} />
                        </Form.Item>

                        <Form.Item className="storage-config-actions-item">
                            <Space className="storage-config-actions" wrap>
                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    icon={<SaveOutlined aria-hidden="true" />}
                                    loading={loading}
                                    disabled={testing}
                                >
                                    {t('storageConfig.form.saveBtn')}
                                </Button>
                                <Button
                                    icon={<ApiOutlined aria-hidden="true" />}
                                    onClick={() => void handleTestConnection()}
                                    loading={testing}
                                    disabled={loading}
                                >
                                    {t('storageConfig.form.testBtn')}
                                </Button>
                                {testing && (
                                    <Button danger onClick={cancelConnectionTest}>
                                        {t('storageConfig.form.cancelTestBtn')}
                                    </Button>
                                )}
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
