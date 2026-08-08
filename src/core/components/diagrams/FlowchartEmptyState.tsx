import React from 'react';
import { Typography } from 'antd';
import Button from 'antd/es/button';
import { useTranslation } from 'react-i18next';
import { FaPlus, FaMousePointer, FaKeyboard } from 'react-icons/fa';
import './FlowchartEmptyState.css';

const { Text, Title } = Typography;

export const FlowchartEmptyState: React.FC<{
  visible: boolean;
  pluginId?: string;
  onOpenShapePicker?: () => void;
}> = ({ visible, pluginId, onOpenShapePicker }) => {
  const { t } = useTranslation();
  const copyKey = pluginId === 'architecture-diagram'
    ? 'designer.architecture.emptyState'
    : 'designer.flowchart.emptyState';
  
  if (!visible) return null;

  return (
    <div className="flowchart-empty-state">
      <Title level={4} className="flowchart-empty-title">
        {t(`${copyKey}.title`)}
      </Title>
      <Text type="secondary" className="flowchart-empty-description flowchart-empty-description-desktop">
        {t(`${copyKey}.desktopDescription`)}
      </Text>
      <Text type="secondary" className="flowchart-empty-description flowchart-empty-description-mobile">
        {t(`${copyKey}.mobileDescription`)}
      </Text>

      {onOpenShapePicker && (
        <Button
          type="primary"
          className="flowchart-empty-action"
          icon={<FaPlus aria-hidden="true" />}
          onClick={onOpenShapePicker}
        >
          {t(`${copyKey}.primaryAction`)}
        </Button>
      )}

      <div className="flowchart-empty-hints">
        <div className="flowchart-empty-hint">
          <div className="flowchart-empty-hint-icon">
            <FaMousePointer size={14} color="#64748b" />
          </div>
          <Text type="secondary">{t('designer.flowchart.emptyState.contextMenuHint')}</Text>
        </div>
        <div className="flowchart-empty-hint">
          <div className="flowchart-empty-hint-icon">
            <FaKeyboard size={14} color="#64748b" />
          </div>
          <Text type="secondary">{t('designer.flowchart.emptyState.panHint')}</Text>
        </div>
        <div className="flowchart-empty-hint">
          <div className="flowchart-empty-hint-icon">
            <FaPlus size={14} color="#64748b" />
          </div>
          <Text type="secondary">{t('designer.flowchart.emptyState.duplicateHint')}</Text>
        </div>
      </div>
    </div>
  );
};

export default FlowchartEmptyState;
