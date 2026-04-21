import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from 'antd/es/modal';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import message from 'antd/es/message';
import Switch from 'antd/es/switch';
import List from 'antd/es/list';
import Button from 'antd/es/button';
import Typography from 'antd/es/typography';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Divider from 'antd/es/divider';
import Select from 'antd/es/select';
import Collapse from 'antd/es/collapse'; // Add Collapse for grouping
import {
    PlusOutlined,
    DeleteOutlined,
    RobotOutlined,
    RocketOutlined,
    GlobalOutlined,
    SettingOutlined,
    CheckCircleFilled,
    AppstoreOutlined
} from '@ant-design/icons';

const { Text, Title, Paragraph } = Typography;

// --- Types ---

export interface AIModel {
    id: string;       // Model ID string sent to API (e.g. 'gpt-4o')
    name: string;     // Display Name
    group?: string;   // Group name (e.g. 'Anthropic', 'OpenAI')
    enabled: boolean;
    isCustom?: boolean;
}

export interface AIProviderConfig {
    id: string;
    name: string;
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    icon?: string;
    models: AIModel[];
}

export interface AIConfigState {
    activeModelKey: string; // Format: "providerId:modelId"
    systemPrompt: string;
    providers: AIProviderConfig[];
}

interface AIConfigModalProps {
    open: boolean;
    onCancel: () => void;
    onSave: () => void;
}

// --- Constants ---
export const AI_CONFIG_KEY = 'DiagramView.AIConfig_V2_Advanced';

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的架构图生成助手。请根据用户的描述生成符合 StandardDiagramData 结构的 JSON 数据。
JSON 结构简介：
{
  "metadata": { "title": "标题", "description": "描述" },
  "layout": { "type": "hierarchical", "direction": "TB" },
  "nodes": [ { "id": "node1", "label": "节点1", "domain": "Group1" } ],
  "edges": [ { "source": "node1", "target": "node2" } ]
}
请直接在回复中包含 JSON 代码块 (markdown code block)。
`;

const DEFAULT_PROVIDERS: AIProviderConfig[] = [
    {
        id: 'gemini',
        name: 'Gemini (Google)',
        enabled: true,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        apiKey: '',
        icon: 'google',
        models: [
            { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', enabled: true, group: 'Google' },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', enabled: true, group: 'Google' }
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        enabled: false,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        icon: 'openai',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o', enabled: true, group: 'GPT-4' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: true, group: 'GPT-4' },
            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', enabled: true, group: 'GPT-3.5' }
        ]
    },
    {
        id: 'siliconflow',
        name: '硅基流动 (SiliconFlow)',
        enabled: false,
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: '',
        icon: 'chip',
        models: [
            { id: 'deepseek-ai/DeepSeek-V2.5', name: 'DeepSeek V2.5', enabled: true, group: 'DeepSeek' },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', enabled: true, group: 'Qwen' }
        ]
    },
    {
        id: 'o3',
        name: 'O3 Platform',
        enabled: false,
        baseUrl: 'https://api.o3.fan/v1',
        apiKey: '',
        icon: 'o3',
        models: [
            { id: 'gpt-4o', name: 'GPT-4o (O3)', enabled: true, group: 'OpenAI' },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', enabled: true, group: 'Anthropic' }
        ]
    }
];

// --- Helpers ---
export const getAIConfig = (): AIConfigState => {
    try {
        const raw = localStorage.getItem(AI_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Basic validation or migration could go here
            if (Array.isArray(parsed.providers)) return parsed;
        }

        // Attempt legacy migration
        const v1Raw = localStorage.getItem('DiagramView.AIConfig');
        if (v1Raw) {
            const v1 = JSON.parse(v1Raw);
            const providers = [...DEFAULT_PROVIDERS];
            const gemini = providers.find(p => p.id === 'gemini');
            if (gemini) {
                if (v1.baseUrl) gemini.baseUrl = v1.baseUrl;
                if (v1.apiKey) gemini.apiKey = v1.apiKey;
            }
            return {
                activeModelKey: 'gemini:gemini-2.0-flash-exp',
                systemPrompt: DEFAULT_SYSTEM_PROMPT,
                providers
            };
        }

    } catch { }

    return {
        activeModelKey: 'gemini:gemini-2.0-flash-exp',
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        providers: DEFAULT_PROVIDERS
    };
};

import { useAuth } from '@/context/AuthContext';
import { storageService } from '@/services/SupabaseStorage';
import { CryptoService } from '@/core';

const AIConfigModal: React.FC<AIConfigModalProps> = ({ open, onCancel, onSave }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const [config, setConfig] = useState<AIConfigState>(getAIConfig());
    const [selectedProviderId, setSelectedProviderId] = useState<string>('global_settings');
    const [searchText, setSearchText] = useState('');

    // For adding new models
    const [newModelFormVisible, setNewModelFormVisible] = useState(false);
    const [newModelData, setNewModelData] = useState({ id: '', name: '', group: '' });

    useEffect(() => {
        if (open) {
            const loaded = getAIConfig();
            setConfig(loaded); // Load local first (fast)

            // Try to load from cloud if logged in
            if (user) {
                storageService.loadConfig('ai_config').then(async (cloudConfig) => {
                    if (cloudConfig && Array.isArray(cloudConfig.providers)) {

                        // Decrypt API Keys
                        const decryptedProviders = await Promise.all(cloudConfig.providers.map(async (p: AIProviderConfig) => {
                            if (p.apiKey && p.apiKey.startsWith('ENC:')) {
                                const decryptedKey = await CryptoService.decrypt(p.apiKey, user.id);
                                return { ...p, apiKey: decryptedKey };
                            }
                            return p;
                        }));

                        const mergedConfig = { ...cloudConfig, providers: decryptedProviders };
                        setConfig(mergedConfig);

                        // Update local storage with decrypted values (so we can use them locally)
                        localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(mergedConfig));
                    }
                }).catch(err => {
                    console.error('AIConfigModal: Failed to load cloud config', err);
                });
            }
        }
    }, [open, user]);

    const handleSave = async () => {
        // 1. Save Local (Plain text, safe on user's device)
        localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));

        // 2. Save Cloud (Encrypted)
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

                await storageService.saveConfig('ai_config', cloudConfig, user.id);
                message.success(t('aiConfig.saveSuccessCloud'));
            } catch (err) {
                console.error('Cloud save failed', err);
                message.warning(t('aiConfig.cloudSyncFail'));
            }
        } else {
            message.success(t('aiConfig.saveSuccess'));
        }

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
            message.error(t('aiConfig.noModelId'));
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
        message.success(t('aiConfig.modelAdded'));
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
            // 立即保存到 localStorage
            localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(newConfig));
            return newConfig;
        });
        message.success(t('aiConfig.switchedTo', { model: modelId }));
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
        if (!provider.apiKey || !provider.baseUrl) {
            message.warning(t('aiConfig.testFillRequired'));
            return;
        }
        setIsTesting(true);
        try {
            // Simple ping to chat completion
            const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.apiKey}`
                },
                body: JSON.stringify({
                    model: provider.models[0]?.id || 'test-model',
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 1
                })
            });

            if (response.ok) {
                message.success(t('aiConfig.testSuccess'));
            } else {
                const errText = await response.text();
                // Check if HTML
                if (errText.trim().startsWith('<')) {
                    message.error(t('aiConfig.testFailHtml', { status: response.status }));
                } else {
                    message.error(t('aiConfig.testFail', { status: response.status, message: errText.substring(0, 100) }));
                }
            }
        } catch (error: any) {
            message.error(t('aiConfig.testError', { message: error.message }));
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <Modal
            title={t('aiConfig.title')}
            open={open}
            onOk={handleSave}
            onCancel={onCancel}
            okText={t('aiConfig.saveAll')}
            cancelText={t('aiConfig.cancel')}
            width={900}
            styles={{ body: { padding: 0, height: 550 } }}
        >
            <div style={{ display: 'flex', height: '100%' }}>
                {/* --- Left Sidebar: Providers --- */}
                <div style={{ width: 280, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', backgroundColor: '#fafafa' }}>
                    <div style={{ padding: 12 }}>
                        <Input.Search
                            placeholder={t('aiConfig.searchPlaceholder')}
                            allowClear
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            style={{ marginBottom: 8 }}
                        />
                        <div
                            onClick={() => setSelectedProviderId('global_settings')}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                borderRadius: 6,
                                backgroundColor: selectedProviderId === 'global_settings' ? '#e6f7ff' : (selectedProviderId === 'global' ? '#fff' : 'transparent'),
                                color: selectedProviderId === 'global_settings' ? '#1890ff' : '#333',
                                fontWeight: 500,
                                display: 'flex', alignItems: 'center', gap: 10,
                                border: selectedProviderId === 'global_settings' ? '1px solid #91caff' : '1px solid transparent'
                            }}
                        >
                            <SettingOutlined /> {t('aiConfig.globalSettings')}
                        </div>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px' }}>
                        <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>{t('aiConfig.providerList')}</Text>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {filteredProviders.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedProviderId(item.id)}
                                    style={{
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        borderRadius: 6,
                                        backgroundColor: selectedProviderId === item.id ? '#fff' : 'transparent',
                                        border: selectedProviderId === item.id ? '1px solid #d9d9d9' : '1px solid transparent',
                                        boxShadow: selectedProviderId === item.id ? '0 2px 4px rgba(0,0,0,0.02)' : 'none',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                    }}
                                >
                                    <Space>
                                        <AppstoreOutlined style={{ color: item.enabled ? '#1890ff' : '#ccc' }} />
                                        <Text strong={selectedProviderId === item.id} style={{ color: item.enabled ? 'inherit' : '#999' }}>
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
                    <div style={{ padding: 12, borderTop: '1px solid #f0f0f0' }}>
                        <Button type="dashed" block icon={<PlusOutlined />} onClick={addCustomProvider}>
                            {t('aiConfig.addCustomProvider')}
                        </Button>
                    </div>
                </div>

                {/* --- Right Content: Settings --- */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', overflow: 'hidden' }}>

                    {/* Header */}
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={4} style={{ margin: 0 }}>
                            {selectedProviderId === 'global_settings' ? 'Global Settings' : selectedProvider?.name}
                        </Title>
                        {selectedProvider && selectedProvider.id.startsWith('custom_') && (
                            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => deleteProvider(selectedProvider.id)}>{t('aiConfig.deleteProvider')}</Button>
                        )}
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                        {selectedProviderId === 'global_settings' ? (
                            <Form layout="vertical">
                                <Form.Item label={t('aiConfig.systemPromptLabel')}>
                                    <Paragraph type="secondary">{t('aiConfig.systemPromptDesc')}</Paragraph>
                                    <Input.TextArea
                                        rows={12}
                                        value={config.systemPrompt}
                                        onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
                                        style={{ fontFamily: 'monospace', fontSize: 13, backgroundColor: '#f9f9f9' }}
                                    />
                                </Form.Item>
                            </Form>
                        ) : selectedProvider ? (
                            <Form layout="vertical">
                                {/* Platform Config */}
                                <div style={{ marginBottom: 24, padding: 16, border: '1px solid #f0f0f0', borderRadius: 8, background: '#fafafa' }}>
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
                                        <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setNewModelFormVisible(true)}>{t('aiConfig.addModel')}</Button>
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
                                                                <div key={model.id} style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                        <Space>
                                                                            <Text delete={!model.enabled}>{model.name}</Text>
                                                                            <Text type="secondary" style={{ fontSize: 12 }}>({model.id})</Text>
                                                                        </Space>
                                                                    </div>
                                                                    <Space>
                                                                        <Button
                                                                            type={isGlobalActive ? 'link' : 'text'}
                                                                            icon={isGlobalActive ? <CheckCircleFilled /> : null}
                                                                            disabled={!model.enabled || !selectedProvider.enabled}
                                                                            onClick={() => setActiveModel(selectedProvider.id, model.id)}
                                                                        >
                                                                            {isGlobalActive ? t('aiConfig.currentActive') : t('aiConfig.setActive')}
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
        </Modal>
    );
};

export default AIConfigModal;
