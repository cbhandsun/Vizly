import {
    getAICommandAction,
    getAICommandIds,
    validateAutonomousAICommand,
    type AICommandPolicyResult,
} from './aiCommandPolicy';

export const AI_COMMAND_SCAN_MAX_CHARS = 200_000;
export const AI_COMMAND_MAX_COMMANDS = 10;
export const AI_COMMAND_MAX_JSON_CHARS = 4_096;

export interface AICommandRejection {
    action: string;
    reason: string;
}

export interface AICommandExtractionResult {
    commands: AIValidatedCommand[];
    rejected: AICommandRejection[];
    truncated: boolean;
}

export type AIValidatedCommand =
    | {
        action: 'addNode' | 'addChild';
        label?: string;
        shape?: string;
        type?: string;
        parentId?: string;
        side?: string;
    }
    | { action: 'connectNodes'; source: string; target: string; label?: string }
    | { action: 'layout' | 'triggerLayout'; strategy?: string }
    | { action: 'groupNodes'; ids: string[]; name?: string; label?: string }
    | { action: 'updateTheme'; style: Record<string, unknown> }
    | { action: 'presentation'; active?: boolean }
    | {
        action: 'animatePath';
        ids: string[];
        params: { edgeIds: string[]; options: { duration?: number; loop?: boolean } };
        duration?: number;
        loop?: boolean;
    }
    | { action: 'collapse'; id: string; collapsed?: boolean };

const COMMAND_PREFIX = '[COMMAND:';

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const cloneStyle = (value: unknown): Record<string, unknown> | undefined => {
    if (!isRecord(value)) return undefined;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
        if (isRecord(nested)) return [key, cloneStyle(nested) || {}];
        return [key, nested];
    }));
};

const optionalString = (value: unknown): string | undefined => (
    typeof value === 'string' ? value : undefined
);

const optionalBoolean = (value: unknown): boolean | undefined => (
    typeof value === 'boolean' ? value : undefined
);

const optionalNumber = (value: unknown): number | undefined => (
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

export const sanitizeValidatedAICommand = (cmd: unknown): AIValidatedCommand | null => {
    const policy = validateAutonomousAICommand(cmd);
    if (!policy.allowed || !isRecord(cmd)) return null;

    const action = getAICommandAction(cmd);
    if (!action) return null;

    switch (action) {
        case 'addNode':
        case 'addChild':
            return {
                action,
                ...(optionalString(cmd.label) ? { label: optionalString(cmd.label) } : {}),
                ...(optionalString(cmd.shape) ? { shape: optionalString(cmd.shape) } : {}),
                ...(optionalString(cmd.type) ? { type: optionalString(cmd.type) } : {}),
                ...(optionalString(cmd.parentId) ? { parentId: optionalString(cmd.parentId) } : {}),
                ...(optionalString(cmd.side) ? { side: optionalString(cmd.side) } : {}),
            };
        case 'connectNodes': {
            const source = optionalString(cmd.source);
            const target = optionalString(cmd.target);
            if (!source || !target) return null;
            return {
                action,
                source,
                target,
                ...(optionalString(cmd.label) ? { label: optionalString(cmd.label) } : {}),
            };
        }
        case 'layout':
        case 'triggerLayout':
            return {
                action,
                ...(optionalString(cmd.strategy) ? { strategy: optionalString(cmd.strategy) } : {}),
            };
        case 'groupNodes': {
            const ids = getAICommandIds(cmd);
            if (!ids) return null;
            return {
                action,
                ids,
                ...(optionalString(cmd.name) ? { name: optionalString(cmd.name) } : {}),
                ...(optionalString(cmd.label) ? { label: optionalString(cmd.label) } : {}),
            };
        }
        case 'updateTheme':
            return {
                action,
                style: cloneStyle(cmd.style) || {},
            };
        case 'presentation':
            return {
                action,
                ...(optionalBoolean(cmd.active) !== undefined ? { active: optionalBoolean(cmd.active) } : {}),
            };
        case 'animatePath': {
            const ids = getAICommandIds(cmd);
            if (!ids) return null;
            const params = isRecord(cmd.params) ? cmd.params : {};
            const options = isRecord(params.options) ? params.options : {};
            return {
                action,
                ids,
                params: {
                    edgeIds: ids,
                    options: {
                        ...(optionalNumber(cmd.duration ?? options.duration) !== undefined
                            ? { duration: optionalNumber(cmd.duration ?? options.duration) }
                            : {}),
                        ...(optionalBoolean(cmd.loop ?? options.loop) !== undefined
                            ? { loop: optionalBoolean(cmd.loop ?? options.loop) }
                            : {}),
                    },
                },
                ...(optionalNumber(cmd.duration ?? options.duration) !== undefined
                    ? { duration: optionalNumber(cmd.duration ?? options.duration) }
                    : {}),
                ...(optionalBoolean(cmd.loop ?? options.loop) !== undefined
                    ? { loop: optionalBoolean(cmd.loop ?? options.loop) }
                    : {}),
            };
        }
        case 'collapse': {
            const id = optionalString(cmd.id);
            if (!id) return null;
            return {
                action,
                id,
                ...(optionalBoolean(cmd.collapsed) !== undefined ? { collapsed: optionalBoolean(cmd.collapsed) } : {}),
            };
        }
        default:
            return null;
    }
};

const rejection = (cmd: unknown, reason: string): AICommandRejection => ({
    action: getAICommandAction(cmd) || 'unknown',
    reason,
});

const findJsonObjectEnd = (text: string, startIndex: number): number | null => {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
        const char = text[index];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }

        if (char === '{') {
            depth += 1;
            continue;
        }

        if (char === '}') {
            depth -= 1;
            if (depth === 0) return index + 1;
            if (depth < 0) return null;
        }

    }

    return null;
};

const extractCommandJsonBlocks = (content: string): Array<{ json?: string; reason?: string }> => {
    const blocks: Array<{ json?: string; reason?: string }> = [];
    let searchFrom = 0;

    while (searchFrom < content.length) {
        const prefixIndex = content.indexOf(COMMAND_PREFIX, searchFrom);
        if (prefixIndex < 0) break;

        let cursor = prefixIndex + COMMAND_PREFIX.length;
        while (/\s/.test(content[cursor] || '')) cursor += 1;

        if (content[cursor] !== '{') {
            blocks.push({ reason: 'invalid command JSON' });
            searchFrom = cursor + 1;
            continue;
        }

        const jsonEnd = findJsonObjectEnd(content, cursor);
        if (jsonEnd === null) {
            blocks.push({ reason: 'invalid command JSON' });
            searchFrom = cursor + 1;
            continue;
        }

        const cmdJson = content.slice(cursor, jsonEnd);
        let endCursor = jsonEnd;
        while (/\s/.test(content[endCursor] || '')) endCursor += 1;

        if (content[endCursor] !== ']') {
            blocks.push({ reason: 'invalid command JSON' });
            searchFrom = jsonEnd;
            continue;
        }

        blocks.push({ json: cmdJson });
        searchFrom = endCursor + 1;
    }

    return blocks;
};

export const extractValidatedAICommands = (content: string): AICommandExtractionResult => {
    const scanContent = content.slice(0, AI_COMMAND_SCAN_MAX_CHARS);
    const result: AICommandExtractionResult = {
        commands: [],
        rejected: [],
        truncated: content.length > AI_COMMAND_SCAN_MAX_CHARS,
    };

    for (const block of extractCommandJsonBlocks(scanContent)) {
        if (result.commands.length >= AI_COMMAND_MAX_COMMANDS) {
            result.rejected.push({ action: 'unknown', reason: 'too many commands' });
            break;
        }

        if (!block.json) {
            result.rejected.push({ action: 'unknown', reason: block.reason || 'invalid command JSON' });
            continue;
        }

        const cmdJson = block.json;
        if (cmdJson.length > AI_COMMAND_MAX_JSON_CHARS) {
            result.rejected.push({ action: 'unknown', reason: 'command JSON too large' });
            continue;
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(cmdJson);
        } catch {
            result.rejected.push({ action: 'unknown', reason: 'invalid command JSON' });
            continue;
        }

        const policy: AICommandPolicyResult = validateAutonomousAICommand(parsed);
        if (!policy.allowed) {
            result.rejected.push(rejection(parsed, policy.reason || 'blocked'));
            continue;
        }

        const sanitized = sanitizeValidatedAICommand(parsed);
        if (!sanitized) {
            result.rejected.push(rejection(parsed, 'invalid command payload'));
            continue;
        }

        result.commands.push(sanitized);
    }

    if (result.truncated) {
        result.rejected.push({ action: 'unknown', reason: 'command scan limit reached' });
    }

    return result;
};
