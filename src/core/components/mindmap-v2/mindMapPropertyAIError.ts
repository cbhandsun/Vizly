export type MindMapPropertyAITranslator = (key: string) => string;

const aiKey = (suffix: string): string => `plugins.mindmap.propertyAI.${suffix}`;

const KNOWN_AI_ERROR_KEYS: Readonly<Record<string, string>> = {
    '请先在 AI 设置中配置有效的 Provider 和 API Key': aiKey('configurationRequired'),
    '请在 AI 设置中选择一个模型': aiKey('modelRequired'),
    '模型未返回有效的子主题，请重试': aiKey('noValidSuggestions'),
};

export const presentMindMapPropertyAIError = (
    error: string,
    translate: MindMapPropertyAITranslator,
    fallbackKey = aiKey('expandFailed'),
): string => {
    const key = KNOWN_AI_ERROR_KEYS[error.trim()];
    return translate(key ?? fallbackKey);
};
