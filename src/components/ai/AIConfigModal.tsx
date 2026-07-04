import React, { useEffect, useState, useMemo } from 'react';
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
import Checkbox from 'antd/es/checkbox';
import {
    PlusOutlined,
    DeleteOutlined,
    _RobotOutlined,
    RocketOutlined,
    _GlobalOutlined,
    SettingOutlined,
    CheckCircleFilled,
    AppstoreOutlined,
    SyncOutlined
} from '@ant-design/icons';
import { useAuth } from '@/context/useAuth';
import { CryptoService } from '@/core/utils/CryptoService';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { normalizeProviderBaseUrl } from '@/services/ai/providerSecurity';
import {
    formatAIProviderRequestError,
    normalizeAIModelsResponse,
    requestAIChatCompletion,
    requestAIModels,
    resolveAIProviderEndpoint,
} from '@/services/ai/aiProviderClient';
import {
    getAIConfig,
    loadCloudAIConfig,
    persistAIConfig,
    setRuntimeAIConfig,
    type AIConfigState,
    type AIModel,
    type AIProviderConfig,
} from './aiConfigStorage';
import {
    logAIConfigCloudSaveFailure,
    logAIConfigEndpointValidationFailure,
    logAIConfigModalCloudLoadFailure,
    logAIConfigRequestFailure,
} from './aiLogging';

const { Text, Title, Paragraph } = Typography;
const loadStorageService = async () => (await import('@/services/SupabaseStorage')).storageService;

interface AIConfigModalProps {
    open: boolean;
    onCancel: () => void;
    onSave: () => void;
}

const AIConfigModal: React.FC<AIConfigModalProps> = ({ open, onCancel, onSave }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [config, setConfig] = useState<AIConfigState>(() => getAIConfig(user?.id));
    const [selectedProviderId, setSelectedProviderId] = useState<string>('global_settings');
    const [searchText, setSearchText] = useState('');

    // For adding new models
    const [newModelFormVisible, setNewModelFormVisible] = useState(false);
    const [newModelData, setNewModelData] = useState({ id: '', name: '', group: '' });

    useEffect(() => {
        if (open) {
            const loaded = getAIConfig(user?.id);
            setConfig(loaded); // Load local first (fast)

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
    }, [open, user]);

    const handleSave = async () => {
        const invalidProvider = config.providers.find(p => p.enabled && p.baseUrl && !normalizeProviderBaseUrl(p.baseUrl));
        if (invalidProvider) {
            appMessage.warning(`${invalidProvider.name} 的 Base URL 必须使用 HTTPS，或本机 HTTP localhost/127.0.0.1。`);
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
        onSave();
    };

    // --- Provider Actions ---
    const toggleProvider = (id: string, checked: boolean, e: React.MouseEvent) => {
        e.stopPropagation();
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
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.map(p => p.id === id ? { ...p, ...updates } : p)
        }));
    };

    const addCustomProvider = () => {
        const newId = `custom_${Date.now()}`;
        const newProvider: AIProviderConfig = {
            id: newId,
            name: t('aiConfig.newProviderName'),
            enabled: true,
            baseUrl: '',
            apiKey: '',
            icon: 'deployment-unit',
            models: []
        };
        setConfig(prev => ({ ...prev, providers: [...prev.providers, newProvider] }));
        setSelectedProviderId(newId);
    };

    const deleteProvider = (id: string) => {
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.filter(p => p.id !== id)
        }));
        if (selectedProviderId === id) setSelectedProviderId('global_settings');
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

    const deleteModel = (providerId: string, modelId: string) => {
        setConfig(prev => ({
            ...prev,
            providers: prev.providers.map(p => {
                if (p.id !== providerId) return p;
                return { ...p, models: p.models.filter(m => m.id !== modelId) };
            })
        }));
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

    // Derived state for rendering
    const filteredProviders = config.providers.filter(p =>
        p.name.toLowerCase().includes(searchText.toLowerCase())
    );

    // Group models by 'group' field
    const groupedModels = useMemo(() => {
        if (!selectedProvider) return {};
        const groups: Record<string, AIModel[]> = {};
        selectedProvider.models.forEach(m => {
            const key = m.group || 'Other';
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });
        return groups;
    }, [selectedProvider]);

    // --- Test Connection ---
    const [isTesting, setIsTesting] = useState(false);

    const handleTestConnection = async (provider: AIProviderConfig) => {
        if (!provider.baseUrl) {
            appMessage.warning(t('aiConfig.testFillRequired'));
            return;
        }
        try {
            resolveAIProviderEndpoint(provider, '/chat/completions');
        } catch (error) {
            logAIConfigEndpointValidationFailure(provider.name, 'testConnection', error);
            appMessage.warning(`${provider.name} 的 Base URL 必须使用 HTTPS，或本机 HTTP localhost/127.0.0.1。`);
            return;
        }
        setIsTesting(true);
        try {
            await requestAIChatCompletion(provider, {
                model: provider.models[0]?.id || 'test-model',
                messages: [{ role: 'user', content: 'Hello, please reply with "OK".' }]
            }, { timeoutMs: 30_000 });
            appMessage.success(t('aiConfig.testSuccess'));
        } catch (error: any) {
            logAIConfigRequestFailure('testConnection', provider.name, error);
            appMessage.error(t('aiConfig.testError', { message: formatAIProviderRequestError(error, 100) }));
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

    const filteredDiscoveredModels = discoveredModels.filter(m => 
        m.id.toLowerCase().includes(discoverySearchText.toLowerCase()) || 
        m.name.toLowerCase().includes(discoverySearchText.toLowerCase())
    );

    const groupedDiscoveredModels = useMemo(() => {
        const groups: Record<string, AIModel[]> = {};
        filteredDiscoveredModels.forEach(m => {
            const key = m.group || 'Other';
            if (!groups[key]) groups[key] = [];
            groups[key].push(m);
        });
        return groups;
    }, [filteredDiscoveredModels]);

    const handleFetchModels = async (provider: AIProviderConfig) => {
        if (!provider.baseUrl) {
            appMessage.warning(t('aiConfig.testFillRequired'));
            return;
        }
        try {
            resolveAIProviderEndpoint(provider, '/models');
        } catch (error) {
            logAIConfigEndpointValidationFailure(provider.name, 'fetchModels', error);
            appMessage.warning(`${provider.name} 的 Base URL 必须使用 HTTPS，或本机 HTTP localhost/127.0.0.1。`);
            return;
        }
        setIsFetchingModels(true);
        try {
            const models = normalizeAIModelsResponse(await requestAIModels(provider, { timeoutMs: 30_000 }));
            if (models.length > 0) {
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
                appMessage.error(t('aiConfig.fetchModelsInvalidData'));
            }
        } catch (error: any) {
            logAIConfigRequestFailure('fetchModels', provider.name, error);
            appMessage.error(t('aiConfig.testError', { message: formatAIProviderRequestError(error, 100) }));
        } finally {
            setIsFetchingModels(false);
        }
    };

    return (
        <Modal
            title={t('aiConfig.title')}
            open={open}
            onOk={handleSave}
            onCancel={onCancel}
            getContainer={() => document.getElementById('app-root-layout') || document.body}
            okText={t('aiConfig.saveAll')}
            cancelText={t('aiConfig.cancel')}
            width={760}
            zIndex={1050}
            className="ai-hyper-glass-modal"
            styles={{ body: { padding: 0, height: 480 } }}
        >
            <div style={{ display: 'flex', height: '100%' }}>
                {/* --- Left Sidebar: Providers --- */}
                <div style={{ width: 240, borderRight: '1px solid var(--designer-border, rgba(0,0,0,0.06))', display: 'flex', flexDirection: 'column', backgroundColor: 'transparent' }}>
                    <div style={{ padding: 'var(--glass-padding-sm, 16px)' }}>
                        <Input.Search
                            placeholder={t('aiConfig.searchPlaceholder')}
                            allowClear
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            style={{ marginBottom: 12 }}
                        />
                        <div
                            onClick={() => setSelectedProviderId('global_settings')}
                            className={`glass-pulse-glow-container ${selectedProviderId === 'global_settings' ? 'glass-pulse-glow' : ''}`}
                            style={{
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderRadius: 10,
                                backgroundColor: selectedProviderId === 'global_settings' ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                color: selectedProviderId === 'global_settings' ? 'var(--color-primary-500, #6366f1)' : 'inherit',
                                fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 12,
                                transition: 'all 0.3s',
                                border: selectedProviderId === 'global_settings' ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                                zIndex: 1
                            }}
                        >
                            <SettingOutlined style={{ position: 'relative', zIndex: 2, fontSize: 16 }} /> 
                            <span style={{ position: 'relative', zIndex: 2 }}>{t('aiConfig.globalSettings')}</span>
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--glass-padding-sm, 16px)' }}>
                        <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block', paddingLeft: 4 }}>{t('aiConfig.providerList')}</Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {filteredProviders.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedProviderId(item.id)}
                                    className={selectedProviderId === item.id ? 'glass-pulse-glow' : ''}
                                    style={{
                                        padding: '12px 16px',
                                        cursor: 'pointer',
                                        borderRadius: 10,
                                        backgroundColor: selectedProviderId === item.id ? 'rgba(255,255,255,0.45)' : 'transparent',
                                        border: selectedProviderId === item.id ? '1px solid rgba(255,255,255,0.6)' : '1px solid transparent',
                                        boxShadow: selectedProviderId === item.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        transition: 'all 0.2s',
                                        zIndex: 1
                                    }}
                                >
                                    <Space style={{ position: 'relative', zIndex: 2 }} size={12}>
                                        <AppstoreOutlined style={{ color: item.enabled ? 'var(--color-primary-500, #6366f1)' : '#ccc', fontSize: 16 }} />
                                        <Text strong={selectedProviderId === item.id} style={{ color: item.enabled ? 'inherit' : 'rgba(0,0,0,0.45)' }}>
                                            {item.name}
                                        </Text>
                                    </Space>
                                    <Switch
                                        size="small"
                                        checked={item.enabled}
                                        onClick={(c, e) => toggleProvider(item.id, c, e as any)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ padding: 'var(--glass-padding-sm, 16px)', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        <Button type="dashed" block icon={<PlusOutlined />} onClick={addCustomProvider} style={{ height: 40, borderRadius: 10 }}>
                            {t('aiConfig.addCustomProvider')}
                        </Button>
                    </div>
                </div>

                {/* --- Right Content: Settings --- */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'transparent', overflow: 'hidden' }}>

                    {/* Header */}
                    <div style={{ padding: '24px var(--glass-padding-md, 24px)', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={4} style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
                            {selectedProviderId === 'global_settings' ? 'Global Settings' : selectedProvider?.name}
                        </Title>
                        {selectedProvider && selectedProvider.id.startsWith('custom_') && (
                            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => deleteProvider(selectedProvider.id)}>{t('aiConfig.deleteProvider')}</Button>
                        )}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--glass-padding-md, 24px) var(--glass-padding-lg, 32px)' }}>
                        {selectedProviderId === 'global_settings' ? (
                            <Form layout="vertical">
                                <Form.Item label={t('aiConfig.systemPromptLabel')}>
                                    <Paragraph type="secondary">{t('aiConfig.systemPromptDesc')}</Paragraph>
                                        <Input.TextArea
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
                                <div style={{ marginBottom: 24, padding: 16, border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, background: 'rgba(255,255,255,0.3)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text strong>{t('aiConfig.apiConfig')}</Text>
                                        <Button
                                            size="small"
                                            icon={<RocketOutlined />}
                                            loading={isTesting}
                                            onClick={() => handleTestConnection(selectedProvider)}
                                        >
                                            {t('aiConfig.testConnection')}
                                        </Button>
                                    </div>
                                    <Divider style={{ margin: '12px 0' }} />
                                    <Form.Item label="API Base URL" required tooltip="例如: https://api.openai.com/v1">
                                        <Input
                                            value={selectedProvider.baseUrl}
                                            onChange={e => updateProvider(selectedProvider.id, { baseUrl: e.target.value })}
                                            placeholder="https://..."
                                        />
                                    </Form.Item>
                                    <Form.Item label="API Key" required>
                                        <Input.Password
                                            value={selectedProvider.apiKey}
                                            onChange={e => updateProvider(selectedProvider.id, { apiKey: e.target.value })}
                                            placeholder="sk-..."
                                        />
                                    </Form.Item>
                                    {selectedProvider.id.startsWith('custom_') && (
                                        <Form.Item label={t('aiConfig.platformName')}>
                                            <Input value={selectedProvider.name} onChange={e => updateProvider(selectedProvider.id, { name: e.target.value })} />
                                        </Form.Item>
                                    )}
                                </div>

                                {/* Models List */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <Text strong>{t('aiConfig.modelList', { count: selectedProvider.models.length })}</Text>
                                        <Space>
                                            <Button size="small" icon={<SyncOutlined />} loading={isFetchingModels} onClick={() => handleFetchModels(selectedProvider)}>{t('aiConfig.fetchModels')}</Button>
                                            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setNewModelFormVisible(true)}>{t('aiConfig.addModel')}</Button>
                                        </Space>
                                    </div>

                                    {newModelFormVisible && (
                                        <div style={{ marginBottom: 16, padding: 12, border: '1px dashed #1890ff', borderRadius: 6, background: '#e6f7ff' }}>
                                            <div style={{ width: '100%', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <Input
                                                    placeholder={t('aiConfig.modelIdPlaceholder')}
                                                    value={newModelData.id}
                                                    onChange={e => setNewModelData({ ...newModelData, id: e.target.value })}
                                                    prefix={<span style={{ color: '#999', marginRight: 4 }}>ID:</span>}
                                                />
                                                <Input
                                                    placeholder={t('aiConfig.displayNamePlaceholder')}
                                                    value={newModelData.name}
                                                    onChange={e => setNewModelData({ ...newModelData, name: e.target.value })}
                                                    prefix={<span style={{ color: '#999', marginRight: 4 }}>Name:</span>}
                                                />
                                                <Input
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
                                                                <div key={model.id} className={isGlobalActive ? "glass-pulse-glow" : ""} style={{ padding: '12px var(--glass-padding-sm, 16px)', borderBottom: '1px solid var(--designer-border, rgba(0,0,0,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, backgroundColor: isGlobalActive ? 'rgba(99, 102, 241, 0.04)' : 'transparent', marginBottom: 4 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
                                                                        <Space>
                                                                            <Text delete={!model.enabled} strong={isGlobalActive}>{model.name}</Text>
                                                                            <Text type="secondary" style={{ fontSize: 12 }}>({model.id})</Text>
                                                                            {isGlobalActive && (
                                                                                <Tag color="processing" style={{ margin: '0 0 0 8px', borderRadius: 12, border: '1px solid rgba(99, 102, 241, 0.3)', background: 'var(--pulse-glow-gradient)', color: 'var(--color-primary-600, #4f46e5)', padding: '0 8px', fontWeight: 600 }}>
                                                                                    <CheckCircleFilled style={{ marginRight: 4 }} /> {t('aiConfig.currentActive', 'Active')}
                                                                                </Tag>
                                                                            )}
                                                                        </Space>
                                                                    </div>
                                                                    <Space style={{ zIndex: 1 }}>
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
                                                                            onChange={c => toggleModel(selectedProvider.id, model.id, c)}
                                                                        />
                                                                        {(model.isCustom || selectedProvider.id.startsWith('custom_')) && (
                                                                            <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => deleteModel(selectedProvider.id, model.id)} />
                                                                        )}
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

            {/* Model Discovery Modal */}
            <Modal
                title={t('aiConfig.discoveryTitle', '选择要添加的模型')}
                open={discoveryModalVisible}
                onOk={handleAddDiscoveredModels}
                onCancel={() => setDiscoveryModalVisible(false)}
                getContainer={() => document.getElementById('app-root-layout') || document.body}
                okText={t('aiConfig.confirmAdd')}
                width={700}
                styles={{ body: { padding: '16px 0', height: 500, overflowY: 'auto' } }}
            >
                <div style={{ padding: '0 24px', marginBottom: 16 }}>
                    <Input.Search
                        placeholder={t('aiConfig.discoverySearchPlaceholder', '搜索模型 ID 或名称')}
                        allowClear
                        value={discoverySearchText}
                        onChange={e => setDiscoverySearchText(e.target.value)}
                    />
                </div>
                
                <div style={{ padding: '0 24px' }}>
                    {Object.keys(groupedDiscoveredModels).map(groupName => {
                        const groupModels = groupedDiscoveredModels[groupName];
                        const allSelected = groupModels.length > 0 && groupModels.every(m => discoverySelectedIds.includes(m.id));
                        const indeterminate = groupModels.some(m => discoverySelectedIds.includes(m.id)) && !allSelected;
                        
                        return (
                            <div key={groupName} style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Space>
                                        <Checkbox
                                            indeterminate={indeterminate}
                                            checked={allSelected}
                                            onChange={e => toggleDiscoveryGroupSelection(groupModels, e.target.checked)}
                                        />
                                        <Text strong>{groupName} <Tag color="blue" style={{ marginLeft: 8, border: 'none', background: '#e6f7ff' }}>{groupModels.length}</Tag></Text>
                                    </Space>
                                </div>
                                <div style={{ padding: '0 12px' }}>
                                    {groupModels.map(model => (
                                        <div key={model.id} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
                                            <Checkbox
                                                checked={discoverySelectedIds.includes(model.id)}
                                                onChange={e => toggleDiscoverySelection(model.id, e.target.checked)}
                                            />
                                            <Space style={{ marginLeft: 12 }}>
                                                <Text>{model.name}</Text>
                                                <Text type="secondary" style={{ fontSize: 12 }}>({model.id})</Text>
                                            </Space>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Modal>
        </Modal>
    );
};

export default AIConfigModal;
