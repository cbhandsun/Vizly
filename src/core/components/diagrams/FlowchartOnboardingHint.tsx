import React, { useMemo } from 'react';
import Card from 'antd/es/card';
import Typography from 'antd/es/typography';
import Button from 'antd/es/button';
import Space from 'antd/es/space';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export const FlowchartOnboardingHint: React.FC<{
  visible: boolean;
  mod: string;
  onOpenCommandPalette: () => void;
  onDismiss: () => void;
}> = ({ visible, mod, onOpenCommandPalette, onDismiss }) => {
  const { t } = useTranslation();

  const steps = useMemo(() => {
    return [
      t('designer.flowchart.onboarding.step.drag'),
      t('designer.flowchart.onboarding.step.connect'),
      t('designer.flowchart.onboarding.step.palette', { mod }),
      t('designer.flowchart.onboarding.step.pan')
    ];
  }, [mod, t]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: 'calc(84px + env(safe-area-inset-top))',
        transform: 'translateX(-50%)',
        zIndex: 450,
        width: 520,
        maxWidth: 'calc(100% - 32px)',
        pointerEvents: 'auto'
      }}
    >
      <Card
        size="small"
        style={{
          borderRadius: 16,
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.15)',
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.45)'
        }}
        styles={{ body: { padding: 14 } }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <Text strong>{t('designer.flowchart.onboarding.title')}</Text>
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              {steps.map((s, i) => (
                <Text key={i} type="secondary" style={{ fontSize: 12 }}>
                  {i + 1}. {s}
                </Text>
              ))}
            </div>
          </div>
          <Space size={6} style={{ flex: '0 0 auto' }}>
            <Button size="small" onClick={onOpenCommandPalette}>
              {t('designer.flowchart.onboarding.openPalette', { mod })}
            </Button>
            <Button size="small" type="text" onClick={onDismiss}>
              {t('designer.flowchart.onboarding.dismiss')}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default FlowchartOnboardingHint;
