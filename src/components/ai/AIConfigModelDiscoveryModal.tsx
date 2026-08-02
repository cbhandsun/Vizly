import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from 'antd/es/modal';
import Input from 'antd/es/input';
import Checkbox from 'antd/es/checkbox';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import Tag from 'antd/es/tag';

import type { AIModel } from './aiConfigStorage';
import {
    COMMERCIAL_VIEWPORT_MODAL_CLASS,
    COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
    getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';

const { Text } = Typography;

interface AIConfigModelDiscoveryModalProps {
    open: boolean;
    groupedModels: Record<string, AIModel[]>;
    searchText: string;
    selectedIds: string[];
    onSearchTextChange: (value: string) => void;
    onToggleModel: (id: string, checked: boolean) => void;
    onToggleGroup: (models: AIModel[], checked: boolean) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

export const AIConfigModelDiscoveryModal: React.FC<AIConfigModelDiscoveryModalProps> = ({
    open,
    groupedModels,
    searchText,
    selectedIds,
    onSearchTextChange,
    onToggleModel,
    onToggleGroup,
    onConfirm,
    onCancel,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            title={t('aiConfig.discoveryTitle')}
            open={open}
            onOk={onConfirm}
            onCancel={onCancel}
            getContainer={getViewportOverlayContainer}
            rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} ai-config-discovery-modal`}
            zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX + 10}
            okText={t('aiConfig.confirmAdd')}
            width={700}
            styles={{ body: { padding: '16px 0', height: 500, overflowY: 'auto' } }}
        >
            <div style={{ padding: '0 24px', marginBottom: 16 }}>
                <Input.Search
                    aria-label={t('aiConfig.discoverySearchLabel')}
                    placeholder={t('aiConfig.discoverySearchPlaceholder')}
                    allowClear
                    value={searchText}
                    onChange={event => onSearchTextChange(event.target.value)}
                />
            </div>

            <div style={{ padding: '0 24px' }}>
                {Object.entries(groupedModels).map(([groupName, groupModels]) => {
                    const allSelected = groupModels.length > 0 && groupModels.every(model => selectedIds.includes(model.id));
                    const indeterminate = groupModels.some(model => selectedIds.includes(model.id)) && !allSelected;

                    return (
                        <div key={groupName} style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Space>
                                    <Checkbox
                                        aria-label={t('aiConfig.discoveryGroupToggleLabel', { name: groupName })}
                                        indeterminate={indeterminate}
                                        checked={allSelected}
                                        onChange={event => onToggleGroup(groupModels, event.target.checked)}
                                    />
                                    <Text strong>
                                        {groupName}
                                        <Tag color="blue" style={{ marginLeft: 8, border: 'none', background: '#e6f7ff' }}>{groupModels.length}</Tag>
                                    </Text>
                                </Space>
                            </div>
                            <div style={{ padding: '0 12px' }}>
                                {groupModels.map(model => (
                                    <div key={model.id} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center' }}>
                                        <Checkbox
                                            aria-label={t('aiConfig.discoveryModelToggleLabel', { name: model.name || model.id })}
                                            checked={selectedIds.includes(model.id)}
                                            onChange={event => onToggleModel(model.id, event.target.checked)}
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
    );
};
