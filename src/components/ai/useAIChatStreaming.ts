export const AI_STREAM_JSON_MAX_CHARS = 5 * 1024 * 1024;

const hasDiagramJsonShape = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Array.isArray(record.nodes) || Array.isArray(record.edges);
};

export const extractJson = (content: string, isStreaming: boolean = false): string | null => {
    if (content.length > AI_STREAM_JSON_MAX_CHARS) return null;

    // 尝试匹配完整包裹的 ```json 块
    const jsonMatch = content.match(/```json\n([\s\S]*?)(?:\n```|$)/);
    const rawStr = jsonMatch ? jsonMatch[1] : content;
    if (rawStr.length > AI_STREAM_JSON_MAX_CHARS) return null;

    // 如果不是在流传输中或者本来就能 parse，直接过
    try {
        const potentialJson = JSON.parse(rawStr);
        if (hasDiagramJsonShape(potentialJson)) {
            return rawStr;
        }
    } catch { }

    // 如果正在 streaming，尝试主动修补残缺的 JSON 结构
    if (isStreaming) {
        try {
            // 更健壮的流式 JSON 补全策略 (Bracket matching auto-patcher)
            let inString = false;
            let escapeNext = false;
            const stack: ('{' | '[')[] = [];
            
            for (let i = 0; i < rawStr.length; i++) {
                const char = rawStr[i];
                if (escapeNext) {
                    escapeNext = false;
                    continue;
                }
                if (char === '\\') {
                    escapeNext = true;
                    continue;
                }
                if (char === '"') {
                    inString = !inString;
                    continue;
                }
                if (!inString) {
                    if (char === '{') stack.push('{');
                    else if (char === '[') stack.push('[');
                    else if (char === '}') {
                        if (stack[stack.length - 1] === '{') stack.pop();
                    } else if (char === ']') {
                        if (stack[stack.length - 1] === '[') stack.pop();
                    }
                }
            }

            let patchedStr = rawStr;
            // 补全正在打开的字符串
            if (inString) patchedStr += '"';

            // 移除可能导致 JSON.parse 失败的尾部逗号
            patchedStr = patchedStr.replace(/,\s*$/, '');

            // 逆序补全所有未闭合的括号
            for (let i = stack.length - 1; i >= 0; i--) {
                patchedStr += stack[i] === '{' ? '}' : ']';
            }
            if (patchedStr.length > AI_STREAM_JSON_MAX_CHARS) return null;

            // 尝试解析补全后的字符串
            const parsed = JSON.parse(patchedStr);
            if (hasDiagramJsonShape(parsed)) {
                return patchedStr;
            }
        } catch {
            // 终极 fallback：如果精准修补失败，尝试简单截断并强行闭合
            try {
                const lastBraceIdx = rawStr.lastIndexOf('}');
                if (lastBraceIdx !== -1) {
                    const trimStr = rawStr.substring(0, lastBraceIdx + 1);
                    const patched = trimStr + ']}';
                    if (patched.length > AI_STREAM_JSON_MAX_CHARS) return null;
                    const parsed = JSON.parse(patched);
                    if (hasDiagramJsonShape(parsed) && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
                        return patched;
                    }
                }
            } catch {
                // 如果进一步尝试修补还是失败，也无妨，下一个 chunk 再说
            }
        }
    }

    return null;
};
