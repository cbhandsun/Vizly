export type MindMapPropertyAITranslator = (key: string) => string;

const KNOWN_AI_ERROR_KEYS: Readonly<Record<string, string>> = {
    '请先在 AI 设置中配置有效的 Provider 和 API Key': 'plugins.mindmap.propertyAI.configurationRequired',
    '请在 AI 设置中选择一个模型': 'plugins.mindmap.propertyAI.modelRequired',
    '模型未返回有效的子主题，请重试': 'plugins.mindmap.propertyAI.noValidSuggestions',
};

export const presentMindMapPropertyAIError = (
    error: string,
    translate: MindMapPropertyAITranslator,
): string => {
    const key = KNOWN_AI_ERROR_KEYS[error.trim()];
    return key ? translate(key) : error;
};
