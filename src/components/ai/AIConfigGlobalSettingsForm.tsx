import type { ChangeEvent } from 'react';
import type { TFunction } from 'i18next';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Typography from 'antd/es/typography';

import { AI_SYSTEM_PROMPT_MAX_LENGTH } from './aiConfigStorage';

interface AIConfigGlobalSettingsFormProps {
    systemPrompt: string;
    t: TFunction;
    onChange: (value: string) => void;
}

export const AIConfigGlobalSettingsForm = ({
    systemPrompt,
    t,
    onChange,
}: AIConfigGlobalSettingsFormProps) => (
    <Form layout="vertical">
        <Form.Item label={t('aiConfig.systemPromptLabel')}>
            <Typography.Paragraph type="secondary">
                {t('aiConfig.systemPromptDesc')}
            </Typography.Paragraph>
            <Input.TextArea
                aria-label={t('aiConfig.systemPromptLabel')}
                rows={12}
                value={systemPrompt}
                maxLength={AI_SYSTEM_PROMPT_MAX_LENGTH}
                showCount
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
                className="ai-config-system-prompt"
            />
        </Form.Item>
    </Form>
);
