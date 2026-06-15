export interface TaskItemInput {
    id: string;
    topic: string;
    context: string;
}

export interface TaskClassificationResult {
    id: string;
    status: 'todo' | 'doing' | 'done';
    priority: '高' | '中' | '低';
}

const TASK_STATUS_VALUES = new Set<TaskClassificationResult['status']>(['todo', 'doing', 'done']);
const TASK_PRIORITY_VALUES = new Set<TaskClassificationResult['priority']>(['高', '中', '低']);
const MAX_AI_TASK_RESPONSE_CHARS = 64 * 1024;
const MAX_TASK_CLASSIFICATIONS = 500;
const MAX_TASK_ID_CHARS = 128;

function cleanTaskId(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, MAX_TASK_ID_CHARS);
}

export function normalizeTaskClassification(value: unknown): TaskClassificationResult | null {
    if (!value || typeof value !== 'object') return null;

    const item = value as Partial<TaskClassificationResult>;
    const id = cleanTaskId(item.id);
    if (!id) return null;

    const status = TASK_STATUS_VALUES.has(item.status as TaskClassificationResult['status'])
        ? item.status as TaskClassificationResult['status']
        : 'todo';
    const priority = TASK_PRIORITY_VALUES.has(item.priority as TaskClassificationResult['priority'])
        ? item.priority as TaskClassificationResult['priority']
        : '中';

    return { id, status, priority };
}

function extractJsonArray(content: string): string {
    const cleaned = content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    if (cleaned.startsWith('[') && cleaned.endsWith(']')) return cleaned;

    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start >= 0 && end > start) return cleaned.slice(start, end + 1);

    throw new Error('AI 返回内容中未找到 JSON 数组');
}

export function parseTaskClassifications(content: string): TaskClassificationResult[] {
    if (content.length > MAX_AI_TASK_RESPONSE_CHARS) {
        throw new Error('AI 返回的任务分类内容过大');
    }

    const parsed = JSON.parse(extractJsonArray(content));
    if (!Array.isArray(parsed)) {
        throw new Error('AI 返回的任务分类不是数组');
    }

    const result: TaskClassificationResult[] = [];
    const seen = new Set<string>();

    for (const item of parsed) {
        if (result.length >= MAX_TASK_CLASSIFICATIONS) break;

        const classification = normalizeTaskClassification(item);
        if (!classification || seen.has(classification.id)) continue;

        seen.add(classification.id);
        result.push(classification);
    }

    return result;
}
