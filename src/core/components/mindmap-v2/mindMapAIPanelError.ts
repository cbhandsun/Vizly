export type MindMapAIPanelErrorKey =
    | 'configurationRequired'
    | 'modelRequired'
    | 'invalidSuggestions'
    | 'invalidTaskPlan'
    | 'requestFailed';

const KNOWN_ERROR_KEYS: Readonly<Record<string, MindMapAIPanelErrorKey>> = {
    '请先在 AI 设置中配置有效的 Provider 和 API Key': 'configurationRequired',
    '请在 AI 设置中选择一个模型': 'modelRequired',
    '模型未返回有效的子主题，请重试': 'invalidSuggestions',
    'AI 未返回可用的任务分类结果': 'invalidTaskPlan',
};

export function getMindMapAIPanelErrorKey(error: unknown): MindMapAIPanelErrorKey {
    if (typeof error !== 'string') return 'requestFailed';
    return KNOWN_ERROR_KEYS[error.trim()] ?? 'requestFailed';
}
