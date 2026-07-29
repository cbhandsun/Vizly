import type { NodeTemplate } from './hooks/useNodeTemplates';

const MAX_TEMPLATE_ID_LENGTH = 128;

export const findFlowchartTemplateById = (
    templates: readonly NodeTemplate[],
    templateId: string,
): NodeTemplate | undefined => {
    const normalizedId = templateId.trim();
    if (!normalizedId || normalizedId.length > MAX_TEMPLATE_ID_LENGTH) return undefined;
    return templates.find(template => template.id === normalizedId);
};
