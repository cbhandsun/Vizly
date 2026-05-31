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
    const parsed = JSON.parse(extractJsonArray(content));
    if (!Array.isArray(parsed)) {
        throw new Error('AI 返回的任务分类不是数组');
    }

    return parsed.flatMap((item): TaskClassificationResult[] => {
        if (!item || typeof item !== 'object') return [];
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (!id) return [];

        const status = TASK_STATUS_VALUES.has(item.status) ? item.status : 'todo';
        const priority = TASK_PRIORITY_VALUES.has(item.priority) ? item.priority : '中';
        return [{ id, status, priority }];
    });
}
