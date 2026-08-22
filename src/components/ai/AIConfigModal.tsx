import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from 'antd/es/modal';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Switch from 'antd/es/switch';
import Button from 'antd/es/button';
import Typography from 'antd/es/typography';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Divider from 'antd/es/divider';
import Collapse from 'antd/es/collapse';
import {
    PlusOutlined,
    RocketOutlined,
    CheckCircleFilled,
    SyncOutlined,
    CloseOutlined,
    EyeInvisibleOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { CryptoService } from '@/core/utils/CryptoService';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { normalizeProviderBaseUrl } from '@/services/ai/providerSecurity';
import {
    normalizeAIModelsResponse,
    requestAIChatCompletion,
    requestAIModels,
    resolveAIProviderEndpoint,
} from '@/services/ai/aiProviderClient';
import {
    loadCloudAIConfig,
    persistAIConfig,
    setRuntimeAIConfig,
    type AIModel,
    type AIProviderConfig,
} from './aiConfigStorage';
import {
    logAIConfigCloudSaveFailure,
    logAIConfigEndpointValidationFailure,
    logAIConfigModalCloudLoadFailure,
    logAIConfigRequestFailure,
} from './aiLogging';
import { filterAIModels, filterAIProviders, groupAIModels } from './aiConfigModelCollections';
import { createCustomAIProvider, resolveAIConfigInitialProviderId } from './aiConfigProviderMutations';
import { getAIProviderConnectionReadiness } from './aiProviderConnectionReadiness';
import {
    createAIProviderConnectionFailure,
    invalidateAIProviderConnectionStatus,
    setAIProviderConnectionStatus,
    type AIProviderConnectionStatus,
    type AIProviderConnectionStatusMap,
} from './aiProviderConnectionStatus';
import { AIConfigConnectionStatusAlert } from './AIConfigConnectionStatusAlert';
import { AIConfigProviderSidebar } from './AIConfigProviderSidebar';
import { AIConfigModelDiscoveryModal } from './AIConfigModelDiscoveryModal';
import { AIConfigDeletionConfirmModal } from './AIConfigDeletionConfirmModal';
import { AIConfigModelDeleteButton, AIConfigProviderHeader } from './AIConfigDeletionTriggers';
import { useAIConfigDeletion } from './useAIConfigDeletion';
import { useAIConfigModalConfig } from './useAIConfigModalConfig';
import {
    COMMERCIAL_VIEWPORT_MODAL_CLASS,
    COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
    getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';
import './AIConfigModal.css';

const { Text, Paragraph } = Typography;
const loadStorageService = async () => (await import('@/services/SupabaseStorage')).storageService;

interface AIConfigModalProps {
    open: boolean;
    initialProviderId?: string;
    onCancel: () => void;
    onSave: () => void;
}

const AIConfigModal: React.FC<AIConfigModalProps> = ({ open, initialProviderId, onCancel, onSave }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [config, setConfig] = useAIConfigModalConfig(open, user?.id);
    const [selectedProviderId, setSelectedProviderId] = useState<string>(() => (
        resolveAIConfigInitialProviderId(initialProviderId, config.providers)
    ));
    const modalCloseButtonRef = useRef<HTMLButtonElement>(null);
    const [searchText, setSearchText] = useState('');
    const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
    const [connectionStatuses, setConnectionStatuses] = useState<AIProviderConnectionStatusMap>({});
    const {
        pendingDeletion,
        requestProviderDeletion,
        requestModelDeletion,
        cancelDeletion,
        confirmDeletion,
    } = useAIConfigDeletion({
        fallbackFocusRef: modalCloseButtonRef,
        setConfig,
        setSelectedProviderId,
    });

    // For adding new models
    const [newModelFormVisible, setNewModelFormVisible] = useState(false);
    const [newModelData, setNewModelData] = useState({ id: '', name: '', group: '' });

    useEffect(() => {
        if (open) {
            // Try to load from cloud if logged in
            if (user) {
                loadCloudAIConfig(user.id).then((mergedConfig) => {
                    if (mergedConfig) {
                        setRuntimeAIConfig(user.id, mergedConfig);
                        setConfig(mergedConfig);
                        window.dispatchEvent(new Event('aiConfigChanged'));
                    }
                }).catch(err => {
                    logAIConfigModalCloudLoadFailure(err);
                });
            }
        }
    }, [open, setConfig, user]);

    const handleSave = async () => {
        const invalidProvider = config.providers.find(p => p.enabled && p.baseUrl && !normalizeProviderBaseUrl(p.baseUrl));
        if (invalidProvider) {
            appMessage.warning(t('aiConfig.invalidProviderBaseUrl', { name: invalidProvider.name }));
            return;
        }

        // Keep logged-in secrets in memory and encrypted cloud storage only.
        persistAIConfig(user?.id, config);

        if (user) {
            try {
                // Clone and encrypt keys
                const encryptedProviders = await Promise.all(config.providers.map(async (p) => {
                    if (p.apiKey) {
                        const encryptedKey = await CryptoService.encrypt(p.apiKey, user.id);
                        return { ...p, apiKey: encryptedKey };
                    }
                    return p;
                }));

                const cloudConfig = { ...config, providers: encryptedProviders };

                const storageService = await loadStorageService();
                await storageService.saveConfig('ai_config', cloudConfig, user.id);
                appMessage.success(t('aiConfig.saveSuccessCloud'));
            } catch (err) {
                logAIConfigCloudSaveFailure(err);
                appMessage.warning(t('aiConfig.cloudSyncFail'));
            }
        } else {
            appMessage.success(t('aiConfig.saveSuccess'));
        }

        window.dispatchEvent(new Event('aiConfigChanged'));
        setConnectionStatuses({});
        cancelDeletion();
        onSave();
    };

    const handleCancel = () => {
        setConnectionStatuses({});
        cancelDeletion();
        onCancel();
    };

    // --- Provider Actions ---
    const toggleProvider = (id: string, checked: boolean) => {
        setConnectionStatuses(prev => invalidateAIProviderConnectionStatus(prev, id));
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.map(p => {
                if (p.id === id) {
                    // Cascade disable: If disabling provider, also disable all its models
                    if (!checked) {
                        return {
                            ...p,
                            enabled: checked,
                            models: p.models.map(m => ({ ...m, enabled: false }))
                        };
                    }
                    return { ...p, enabled: checked };
                }
                return p;
            })
        }));
    };

    const updateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
        if ('baseUrl' in updates || 'apiKey' in updates) {
            setConnectionStatuses(prev => invalidateAIProviderConnectionStatus(prev, id));
        }
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.map(p => p.id === id ? { ...p, ...updates } : p)
        }));
    };

    const addCustomProvider = () => {
        const newId = `custom_${Date.now()}`;
        const newProvider = createCustomAIProvider(newId, t('aiConfig.newProviderName'));
        setConfig(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
        setSelectedProviderId(newId);
    };

    // --- Model Actions ---
    const addModel = (providerId: string) => {
        if (!newModelData.id) {
            appMessage.error(t('aiConfig.noModelId'));
            return;
        }
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.map(p => {
                if (p.id !== providerId) return p;
                return {
                    ...p,
                    models: [...p.models, {
                        id: newModelData.id,
                        name: newModelData.name || newModelData.id,
                        group: newModelData.group || 'Custom',
                        enabled: true,
                        isCustom: true
                    }]
                };
            })
        }));
        setNewModelFormVisible(false);
        setNewModelData({ id: '', name: '', group: '' });
        appMessage.success(t('aiConfig.modelAdded'));
    };

    const toggleModel = (providerId: string, modelId: string, checked: boolean) => {
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.map(p => {
                if (p.id !== providerId) return p;
                return {
                    ...p,
                    models: p.models.map(m => m.id === modelId ? { ...m, enabled: checked } : m)
                };
            })
        }));
    };

    // --- Selection ---
    const setActiveModel = (providerId: string, modelId: string) => {
        const newActiveModelKey = `${providerId}:${modelId}`;
        setConfig(prev => {
            const newConfig = {
                ...prev,
                activeModelKey: newActiveModelKey
            };
            persistAIConfig(user?.id, newConfig);
            return newConfig;
        });
        appMessage.success(t('aiConfig.switchedTo', { model: modelId }));
    };

    const selectedProvider = config.providers.find(p => p.id === selectedProviderId);
    const selectedProviderReadiness = selectedProvider
        ? getAIProviderConnectionReadiness(selectedProvider)
        : null;
    const updateConnectionStatus = (providerId: string, status: AIProviderConnectionStatus) => {
        setConnectionStatuses(prev => setAIProviderConnectionStatus(prev, providerId, status));
    };

    // Derived state for rendering
    const filteredProviders = filterAIProviders(config.providers, searchText);

    // Group models by 'group' field
    const groupedModels = useMemo(() => {
        return groupAIModels(selectedProvider?.models ?? []);
    }, [selectedProvider]);

    // --- Test Connection ---
    const [isTesting, setIsTesting] = useState(false);

    const handleTestConnection = async (provider: AIProviderConfig) => {
        const readiness = getAIProviderConnectionReadiness(provider);
        if (!readiness.ready) {
            appMessage.warning(t(`aiConfig.connection.${readiness.issue}`));
            return;
        }
        try {
            resolveAIProviderEndpoint(provider, '/chat/completions');
        } catch (error) {
            logAIConfigEndpointValidationFailure(provider.name, 'testConnection', error);
            updateConnectionStatus(provider.id, createAIProviderConnectionFailure(
                'test-connection',
                t('aiConfig.connection.invalid-base-url'),
            ));
            appMessage.warning(t('aiConfig.invalidProviderBaseUrl', { name: provider.name }));
            return;
        }
        updateConnectionStatus(provider.id, { kind: 'testing', operation: 'test-connection' });
        setIsTesting(true);
        try {
            await requestAIChatCompletion(provider, {
                model: provider.models[0]?.id || 'test-model',
                messages: [{ role: 'user', content: 'Hello, please reply with "OK".' }]
            }, { timeoutMs: 30_000 });
            updateConnectionStatus(provider.id, { kind: 'success', operation: 'test-connection' });
            appMessage.success(t('aiConfig.testSuccess'));
        } catch (error) {
            logAIConfigRequestFailure('testConnection', provider.name, error);
            const message = t('aiConfig.connection.failureNotice');
            updateConnectionStatus(provider.id, createAIProviderConnectionFailure('test-connection', message));
            appMessage.error(t('aiConfig.testError', { message }));
        } finally {
            setIsTesting(false);
        }
    };

    const [isFetchingModels, setIsFetchingModels] = useState(false);

    const [discoveryModalVisible, setDiscoveryModalVisible] = useState(false);
    const [discoveredModels, setDiscoveredModels] = useState<AIModel[]>([]);
    const [discoverySearchText, setDiscoverySearchText] = useState('');
    const [discoverySelectedIds, setDiscoverySelectedIds] = useState<string[]>([]);

    const handleAddDiscoveredModels = () => {
        if (!selectedProvider) return;
        const modelsToAdd = discoveredModels.filter(m => discoverySelectedIds.includes(m.id));
        if (modelsToAdd.length > 0) {
            setConfig(prev => ({
                ...prev,
                providers: prev.providers.map(p => {
                    if (p.id !== selectedProvider.id) return p;
                    return { ...p, models: [...p.models, ...modelsToAdd] };
                })
            }));
            appMessage.success(t('aiConfig.fetchModelsSuccess', { count: modelsToAdd.length }));
        }
        setDiscoveryModalVisible(false);
    };

    const toggleDiscoverySelection = (id: string, checked: boolean) => {
        if (checked) {
            setDiscoverySelectedIds(prev => [...prev, id]);
        } else {
            setDiscoverySelectedIds(prev => prev.filter(x => x !== id));
        }
    };

    const toggleDiscoveryGroupSelection = (groupModels: AIModel[], checked: boolean) => {
        const ids = groupModels.map(m => m.id);
        if (checked) {
            setDiscoverySelectedIds(prev => Array.from(new Set([...prev, ...ids])));
        } else {
            setDiscoverySelectedIds(prev => prev.filter(x => !ids.includes(x)));
        }
    };

    const groupedDiscoveredModels = useMemo(() => {
        return groupAIModels(filterAIModels(discoveredModels, discoverySearchText));
    }, [discoveredModels, discoverySearchText]);

    const handleFetchModels = async (provider: AIProviderConfig) => {
        const readiness = getAIProviderConnectionReadiness(provider);
        if (!readiness.ready) {
            appMessage.warning(t(`aiConfig.connection.${readiness.issue}`));
            return;
        }
        try {
            resolveAIProviderEndpoint(provider, '/models');
        } catch (error) {
            logAIConfigEndpointValidationFailure(provider.name, 'fetchModels', error);
            updateConnectionStatus(provider.id, createAIProviderConnectionFailure(
                'model-sync',
                t('aiConfig.connection.invalid-base-url'),
            ));
            appMessage.warning(t('aiConfig.invalidProviderBaseUrl', { name: provider.name }));
            return;
        }
        updateConnectionStatus(provider.id, { kind: 'testing', operation: 'model-sync' });
        setIsFetchingModels(true);
        try {
            const models = normalizeAIModelsResponse(await requestAIModels(provider, { timeoutMs: 30_000 }));
            if (models.length > 0) {
                updateConnectionStatus(provider.id, { kind: 'success', operation: 'model-sync' });
                const existingModelIds = new Set(provider.models.map(m => m.id));
                const newModels = models
                    .filter((m) => !existingModelIds.has(m.id))
                    .map((m) => {
                        let group = 'Fetched';
                        if (m.id.includes('-') || m.id.includes('/')) {
                            const parts = m.id.split(/[-/]/);
                            group = parts[0].toUpperCase() === parts[0] ? parts[0] : parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                        }
                        if (m.id.toLowerCase().includes('vision')) group = 'Vision';
                        return {
                            id: m.id,
                            name: m.id,
                            group: group,
                            enabled: false,
                            isCustom: true
                        };
                    });

                if (newModels.length > 0) {
                    setDiscoveredModels(newModels);
                    setDiscoverySelectedIds([]);
                    setDiscoverySearchText('');
                    setDiscoveryModalVisible(true);
                } else {
                    appMessage.info(t('aiConfig.fetchModelsNoNew'));
                }
            } else {
                updateConnectionStatus(provider.id, createAIProviderConnectionFailure(
                    'model-sync',
                    t('aiConfig.fetchModelsInvalidData'),
                ));
                appMessage.error(t('aiConfig.fetchModelsInvalidData'));
            }
        } catch (error) {
            logAIConfigRequestFailure('fetchModels', provider.name, error);
            const message = t('aiConfig.connection.failureNotice');
            updateConnectionStatus(provider.id, createAIProviderConnectionFailure('model-sync', message));
            appMessage.error(t('aiConfig.testError', { message }));
        } finally {
            setIsFetchingModels(false);
        }
    };

    return (
        <Modal
            title={(
                <div className="ai-config-modal-title">
                    <span>{t('aiConfig.title')}</span>
                    <Button
                        ref={modalCloseButtonRef}
                        type="text"
                        className="ai-config-modal-close"
                        icon={<CloseOutlined />}
                        aria-label={t('aiConfig.close')}
                        onClick={handleCancel}
                    />
                </div>
            )}
            open={open}
            onOk={handleSave}
            onCancel={handleCancel}
            closable={false}
            getContainer={getViewportOverlayContainer}
            okText={t('aiConfig.saveAll')}
            cancelText={t('aiConfig.cancel')}
            width={760}
            zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
            className="ai-hyper-glass-modal"
            rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} ai-config-viewport-modal`}
            styles={{ body: { padding: 0, height: 480 } }}
        >
            <div className="ai-config-layout" style={{ display: 'flex', height: '100%' }}>
                <AIConfigProviderSidebar
                    providers={filteredProviders}
                    selectedProviderId={selectedProviderId}
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    onSelectProvider={setSelectedProviderId}
                    onToggleProvider={toggleProvider}
                    onAddCustomProvider={addCustomProvider}
                />

                {/* --- Right Content: Settings --- */}
                <div className="ai-config-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'transparent', overflow: 'hidden' }}>

                    {/* Header */}
                    <AIConfigProviderHeader
                        selectedProviderId={selectedProviderId}
                        provider={selectedProvider}
                        onRequestDeletion={requestProviderDeletion}
                    />

                    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--glass-padding-md, 24px) var(--glass-padding-lg, 32px)' }}>
                        {selectedProviderId === 'global_settings' ? (
                            <Form layout="vertical">
                                <Form.Item label={t('aiConfig.systemPromptLabel')}>
                                    <Paragraph type="secondary">{t('aiConfig.systemPromptDesc')}</Paragraph>
                                        <Input.TextArea
                                        aria-label={t('aiConfig.systemPromptLabel')}
                                        rows={12}
                                        value={config.systemPrompt}
                                        onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
                                        style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.08)' }}
                                    />
                                </Form.Item>
                            </Form>
                        ) : selectedProvider ? (
                            <Form layout="vertical">
                                {/* Platform Config */}
                                <div className="ai-config-connection-card" style={{ marginBottom: 24, padding: 16, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, background: 'rgba(255,255,255,0.3)' }}>
                                    <div className="ai-config-connection-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text strong>{t('aiConfig.apiConfig')}</Text>
                                        <Button
                                            className="ai-config-primary-action"
                                            icon={<RocketOutlined />}
                                            loading={isTesting}
                                            disabled={!selectedProviderReadiness?.ready || isFetchingModels}
                                            onClick={() => handleTestConnection(selectedProvider)}
                                        >
                                            {t('aiConfig.testConnection')}
                                        </Button>
                                    </div>
                                    <Divider style={{ margin: '12px 0' }} />
                                    <Form.Item label={t('aiConfig.baseUrlLabel')} required tooltip={t('aiConfig.baseUrlHint')}>
                                        <Input
                                            aria-label={t('aiConfig.baseUrlLabel')}
                                            value={selectedProvider.baseUrl}
                                            disabled={isTesting || isFetchingModels}
                                            onChange={e => updateProvider(selectedProvider.id, { baseUrl: e.target.value })}
                                            placeholder="https://..."
                                        />
                                    </Form.Item>
                                    <Form.Item
                                        label={t('aiConfig.apiKeyLabel')}
                                        required={selectedProviderReadiness?.authMode === 'bearer-required'}
                                    >
                                        <Space.Compact block>
                                            <Input
                                                aria-label={t('aiConfig.apiKeyLabel')}
                                                type={isApiKeyVisible ? 'text' : 'password'}
                                                autoComplete="off"
                                                value={selectedProvider.apiKey}
                                                disabled={isTesting || isFetchingModels}
                                                onChange={e => updateProvider(selectedProvider.id, { apiKey: e.target.value })}
                                                placeholder="sk-..."
                                            />
                                            <Button
                                                className="ai-config-api-key-toggle"
                                                icon={isApiKeyVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                                                aria-label={t(isApiKeyVisible ? 'aiConfig.hideApiKey' : 'aiConfig.showApiKey')}
                                                aria-pressed={isApiKeyVisible}
                                                onClick={() => setIsApiKeyVisible(visible => !visible)}
                                            />
                                        </Space.Compact>
                                    </Form.Item>
                                    {selectedProviderReadiness && (
                                        <AIConfigConnectionStatusAlert
                                            providerId={selectedProvider.id}
                                            readiness={selectedProviderReadiness}
                                            statuses={connectionStatuses}
                                        />
                                    )}
                                    {selectedProvider.id.startsWith('custom_') && (
                                        <Form.Item label={t('aiConfig.platformName')}>
                                            <Input
                                                aria-label={t('aiConfig.platformName')}
                                                value={selectedProvider.name}
                                                onChange={e => updateProvider(selectedProvider.id, { name: e.target.value })}
                                            />
                                        </Form.Item>
                                    )}
                                </div>

                                {/* Models List */}
                                <div>
                                    <div className="ai-config-model-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <Text strong>{t('aiConfig.modelList', { count: selectedProvider.models.length })}</Text>
                                        <Space>
                                            <Button
                                                className="ai-config-primary-action"
                                                icon={<SyncOutlined />}
                                                loading={isFetchingModels}
                                                disabled={!selectedProviderReadiness?.ready || isTesting}
                                                onClick={() => handleFetchModels(selectedProvider)}
                                            >
                                                {t('aiConfig.fetchModels')}
                                            </Button>
                                            <Button className="ai-config-primary-action" type="primary" icon={<PlusOutlined />} onClick={() => setNewModelFormVisible(true)}>{t('aiConfig.addModel')}</Button>
                                        </Space>
                                    </div>

                                    {newModelFormVisible && (
                                        <div style={{ marginBottom: 16, padding: 12, border: '1px dashed #1890ff', borderRadius: 6, background: '#e6f7ff' }}>
                                            <div style={{ width: '100%', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <Input
                                                    aria-label={t('aiConfig.modelIdLabel')}
                                                    placeholder={t('aiConfig.modelIdPlaceholder')}
                                                    value={newModelData.id}
                                                    onChange={e => setNewModelData({ ...newModelData, id: e.target.value })}
                                                    prefix={<span style={{ color: '#999', marginRight: 4 }}>ID:</span>}
                                                />
                                                <Input
                                                    aria-label={t('aiConfig.displayNameLabel')}
                                                    placeholder={t('aiConfig.displayNamePlaceholder')}
                                                    value={newModelData.name}
                                                    onChange={e => setNewModelData({ ...newModelData, name: e.target.value })}
                                                    prefix={<span style={{ color: '#999', marginRight: 4 }}>Name:</span>}
                                                />
                                                <Input
                                                    aria-label={t('aiConfig.groupLabel')}
                                                    placeholder={t('aiConfig.groupPlaceholder')}
                                                    value={newModelData.group}
                                                    onChange={e => setNewModelData({ ...newModelData, group: e.target.value })}
                                                    prefix={<span style={{ color: '#999', marginRight: 4 }}>Group:</span>}
                                                />
                                            </div>
                                            <Space>
                                                <Button size="small" type="primary" onClick={() => addModel(selectedProvider.id)}>{t('aiConfig.confirmAdd')}</Button>
                                                <Button size="small" onClick={() => setNewModelFormVisible(false)}>{t('aiConfig.cancel')}</Button>
                                            </Space>
                                        </div>
                                    )}

                                    {Object.keys(groupedModels).map(groupName => (
                                        <Collapse
                                            key={groupName}
                                            defaultActiveKey={['1']}
                                            ghost
                                            size="small"
                                            style={{ marginBottom: 8 }}
                                            items={[{
                                                key: '1',
                                                label: <Text strong>{groupName}</Text>,
                                                children: (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        {groupedModels[groupName].map(model => {
                                                            const isGlobalActive = config.activeModelKey === `${selectedProvider.id}:${model.id}`;
                                                            return (
                                                                <div key={model.id} className={`ai-config-model-row ${isGlobalActive ? "glass-pulse-glow" : ""}`} style={{ padding: '12px var(--glass-padding-sm, 16px)', borderBottom: '1px solid var(--designer-border, rgba(0,0,0,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, backgroundColor: isGlobalActive ? 'rgba(99, 102, 241, 0.04)' : 'transparent', marginBottom: 4 }}>
                                                                    <div className="ai-config-model-info" style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
                                                                        <Space>
                                                                            <Text delete={!model.enabled} strong={isGlobalActive}>{model.name}</Text>
                                                                            <Text type="secondary" style={{ fontSize: 12 }}>({model.id})</Text>
                                                                            {isGlobalActive && (
                                                                                <Tag color="processing" style={{ margin: '0 0 0 8px', borderRadius: 12, border: '1px solid rgba(99, 102, 241, 0.3)', background: 'var(--pulse-glow-gradient)', color: 'var(--color-primary-600, #4f46e5)', padding: '0 8px', fontWeight: 600 }}>
                                                                                    <CheckCircleFilled style={{ marginRight: 4 }} /> {t('aiConfig.currentActive', { name: model.name || model.id })}
                                                                                </Tag>
                                                                            )}
                                                                        </Space>
                                                                    </div>
                                                                    <Space className="ai-config-model-actions" style={{ zIndex: 1 }}>
                                                                        <Button
                                                                            size="small"
                                                                            type={isGlobalActive ? "primary" : "default"}
                                                                            disabled={!model.enabled || !selectedProvider.enabled || isGlobalActive}
                                                                            onClick={() => setActiveModel(selectedProvider.id, model.id)}
                                                                        >
                                                                            {t('aiConfig.setActive', 'Use')}
                                                                        </Button>
                                                                        <Switch
                                                                            size="small"
                                                                            checked={model.enabled}
                                                                            aria-label={t('aiConfig.modelToggleLabel', { name: model.name || model.id })}
                                                                            onChange={c => toggleModel(selectedProvider.id, model.id, c)}
                                                                        />
                                                                        <AIConfigModelDeleteButton
                                                                            provider={selectedProvider}
                                                                            model={model}
                                                                            isActive={isGlobalActive}
                                                                            onRequestDeletion={requestModelDeletion}
                                                                        />
                                                                    </Space>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )
                                            }]}
                                        />
                                    ))}
                                </div>
                            </Form>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#999' }}>
                                {t('aiConfig.selectProvider')}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AIConfigModelDiscoveryModal
                open={discoveryModalVisible}
                groupedModels={groupedDiscoveredModels}
                searchText={discoverySearchText}
                selectedIds={discoverySelectedIds}
                onSearchTextChange={setDiscoverySearchText}
                onToggleModel={toggleDiscoverySelection}
                onToggleGroup={toggleDiscoveryGroupSelection}
                onConfirm={handleAddDiscoveredModels}
                onCancel={() => setDiscoveryModalVisible(false)}
            />
            <AIConfigDeletionConfirmModal
                pendingDeletion={pendingDeletion}
                t={t}
                onCancel={cancelDeletion}
                onConfirm={confirmDeletion}
            />
        </Modal>
    );
};

export default AIConfigModal;
