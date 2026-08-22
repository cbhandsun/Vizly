import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';

import {
    AI_MODEL_ID_MAX_LENGTH,
    AI_MODEL_LABEL_MAX_LENGTH,
    type AIConfigModelDraft,
    type AIConfigModelDraftIssue,
    type AIConfigModelDraftValidation,
} from './aiConfigModelDraft';

const { Text } = Typography;

interface AIConfigNewModelFormProps {
    draft: AIConfigModelDraft;
    validation: AIConfigModelDraftValidation;
    onChange: (draft: AIConfigModelDraft) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

const getIssueField = (issue: AIConfigModelDraftIssue | null): keyof AIConfigModelDraft | null => {
    if (!issue) return null;
    if (issue === 'model-name-too-long') return 'name';
    if (issue === 'model-group-too-long') return 'group';
    return 'id';
};

const getIssueTranslation = (issue: AIConfigModelDraftIssue | null): string | null => {
    if (!issue) return null;
    return `aiConfig.modelValidation.${issue}`;
};

export const AIConfigNewModelForm: React.FC<AIConfigNewModelFormProps> = ({
    draft,
    validation,
    onChange,
    onConfirm,
    onCancel,
}) => {
    const { t } = useTranslation();
    const issue = validation.ok ? null : validation.issue;
    const issueField = getIssueField(issue);
    const issueTranslation = getIssueTranslation(issue);
    const errorId = issue ? 'ai-config-new-model-error' : undefined;
    const errorMessage = issueTranslation
        ? t(issueTranslation, { idMax: AI_MODEL_ID_MAX_LENGTH, labelMax: AI_MODEL_LABEL_MAX_LENGTH })
        : null;

    const accessibilityProps = (field: keyof AIConfigModelDraft) => ({
        'aria-invalid': issueField === field,
        'aria-describedby': issueField === field ? errorId : undefined,
        status: issueField === field ? 'error' as const : undefined,
    });

    return (
        <div className="ai-config-new-model-form">
            <div className="ai-config-new-model-fields">
                <Input
                    {...accessibilityProps('id')}
                    aria-label={t('aiConfig.modelIdLabel')}
                    placeholder={t('aiConfig.modelIdPlaceholder')}
                    value={draft.id}
                    onChange={event => onChange({ ...draft, id: event.target.value })}
                    prefix={<span className="ai-config-new-model-prefix">ID:</span>}
                />
                <Input
                    {...accessibilityProps('name')}
                    aria-label={t('aiConfig.displayNameLabel')}
                    placeholder={t('aiConfig.displayNamePlaceholder')}
                    value={draft.name}
                    onChange={event => onChange({ ...draft, name: event.target.value })}
                    prefix={<span className="ai-config-new-model-prefix">Name:</span>}
                />
                <Input
                    {...accessibilityProps('group')}
                    aria-label={t('aiConfig.groupLabel')}
                    placeholder={t('aiConfig.groupPlaceholder')}
                    value={draft.group}
                    onChange={event => onChange({ ...draft, group: event.target.value })}
                    prefix={<span className="ai-config-new-model-prefix">Group:</span>}
                />
            </div>
            {errorMessage && <Text id={errorId} type="danger" role="alert">{errorMessage}</Text>}
            <Space>
                <Button size="small" type="primary" disabled={!validation.ok} onClick={onConfirm}>
                    {t('aiConfig.confirmAdd')}
                </Button>
                <Button size="small" onClick={onCancel}>{t('aiConfig.cancel')}</Button>
            </Space>
        </div>
    );
};
