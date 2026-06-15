const SAFE_AUTONOMOUS_ACTIONS = new Set([
    'addNode',
    'connectNodes',
    'triggerLayout',
    'layout',
    'groupNodes',
    'updateTheme',
    'presentation',
    'animatePath',
    'addChild',
    'collapse',
]);

const HIGH_RISK_ACTIONS = new Set([
    'deleteNodes',
    'export',
    'exportMindmapMd',
    'save',
    'share',
]);

const MAX_IDS_PER_COMMAND = 50;
const MAX_LABEL_LENGTH = 200;
const MAX_ACTION_LENGTH = 80;
const MAX_ID_LENGTH = 120;
const MAX_STYLE_KEYS = 40;
const MAX_STYLE_DEPTH = 2;
const MAX_STYLE_STRING_LENGTH = 200;
const MAX_ANIMATION_DURATION_MS = 60_000;

const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const SAFE_STYLE_KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;
const BLOCKED_STYLE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const BLOCKED_ID_VALUES = new Set(['__proto__', 'prototype', 'constructor']);

export interface AICommandPolicyResult {
    allowed: boolean;
    reason?: string;
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
};

const hasString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const hasBoundedString = (value: unknown, maxLength: number): value is string => {
    return hasString(value) && value.length <= maxLength;
};

const hasSafeToken = (value: unknown, maxLength = MAX_ACTION_LENGTH): value is string => {
    return hasBoundedString(value, maxLength) && SAFE_TOKEN_PATTERN.test(value);
};

const hasSafeId = (value: unknown): value is string => {
    return hasSafeToken(value, MAX_ID_LENGTH) && !BLOCKED_ID_VALUES.has(value.trim());
};

const hasSafeIds = (value: unknown): value is string[] => {
    return Array.isArray(value)
        && value.length > 0
        && value.length <= MAX_IDS_PER_COMMAND
        && value.every(hasSafeId);
};

const hasSafeOptionalLabel = (value: unknown): boolean => {
    return value === undefined || hasBoundedString(value, MAX_LABEL_LENGTH);
};

const hasSafeStyleValue = (value: unknown, depth = 0): boolean => {
    if (value === null) return true;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'string') return value.length <= MAX_STYLE_STRING_LENGTH;
    if (!isPlainRecord(value) || depth >= MAX_STYLE_DEPTH) return false;

    const entries = Object.entries(value);
    if (entries.length > MAX_STYLE_KEYS) return false;
    return entries.every(([key, nestedValue]) => (
        key.length > 0
        && key.length <= MAX_ACTION_LENGTH
        && !BLOCKED_STYLE_KEYS.has(key)
        && SAFE_STYLE_KEY_PATTERN.test(key)
        && hasSafeStyleValue(nestedValue, depth + 1)
    ));
};

const hasSafeStyle = (value: unknown): boolean => {
    return isPlainRecord(value) && hasSafeStyleValue(value);
};

const getAnimationOptions = (command: Record<string, unknown>): Record<string, unknown> => {
    const params = command.params;
    if (!isPlainRecord(params)) return {};
    const options = params.options;
    return isPlainRecord(options) ? options : {};
};

const hasSafeOptionalDuration = (value: unknown): boolean => {
    return value === undefined
        || (typeof value === 'number'
            && Number.isFinite(value)
            && value > 0
            && value <= MAX_ANIMATION_DURATION_MS);
};

const hasSafeOptionalBoolean = (value: unknown): boolean => value === undefined || typeof value === 'boolean';

export const getAICommandIds = (cmd: unknown): string[] | null => {
    if (!isPlainRecord(cmd)) return null;
    const command = cmd;
    if (hasSafeIds(command.ids)) return command.ids;

    const params = command.params;
    if (isPlainRecord(params)) {
        const edgeIds = params.edgeIds;
        if (hasSafeIds(edgeIds)) return edgeIds;
    }

    return null;
};

export const getAICommandAction = (cmd: unknown): string | null => {
    if (!isPlainRecord(cmd)) return null;
    const action = (cmd as { action?: unknown }).action;
    if (typeof action !== 'string') return null;
    const trimmed = action.trim();
    return trimmed.length <= MAX_ACTION_LENGTH ? trimmed : null;
};

export const validateAutonomousAICommand = (cmd: unknown): AICommandPolicyResult => {
    const action = getAICommandAction(cmd);
    if (!action) return { allowed: false, reason: 'missing action' };
    if (HIGH_RISK_ACTIONS.has(action)) return { allowed: false, reason: `${action} requires explicit user action` };
    if (!SAFE_AUTONOMOUS_ACTIONS.has(action)) return { allowed: false, reason: `${action} is not an allowed AI action` };

    if (!isPlainRecord(cmd)) return { allowed: false, reason: 'invalid command payload' };
    const command = cmd;
    switch (action) {
        case 'addNode':
            if (!hasSafeOptionalLabel(command.label)) {
                return { allowed: false, reason: 'invalid label' };
            }
            if (command.shape !== undefined && !hasSafeToken(command.shape)) {
                return { allowed: false, reason: 'invalid shape' };
            }
            if (command.type !== undefined && !hasSafeToken(command.type)) {
                return { allowed: false, reason: 'invalid type' };
            }
            break;
        case 'addChild':
            if (!hasSafeOptionalLabel(command.label)) {
                return { allowed: false, reason: 'invalid label' };
            }
            if (!hasSafeId(command.parentId)) {
                return { allowed: false, reason: 'missing parentId' };
            }
            if (command.side !== undefined && !hasSafeToken(command.side, 16)) {
                return { allowed: false, reason: 'invalid side' };
            }
            break;
        case 'connectNodes':
            if (!hasSafeId(command.source) || !hasSafeId(command.target)) {
                return { allowed: false, reason: 'missing source or target' };
            }
            if (!hasSafeOptionalLabel(command.label)) return { allowed: false, reason: 'invalid label' };
            break;
        case 'layout':
        case 'triggerLayout':
            if (command.strategy !== undefined && !hasSafeToken(command.strategy)) {
                return { allowed: false, reason: 'invalid layout strategy' };
            }
            break;
        case 'groupNodes':
            if (!getAICommandIds(command)) return { allowed: false, reason: 'invalid ids' };
            if (!hasSafeOptionalLabel(command.name) || !hasSafeOptionalLabel(command.label)) {
                return { allowed: false, reason: 'invalid label' };
            }
            break;
        case 'updateTheme':
            if (!hasSafeStyle(command.style)) return { allowed: false, reason: 'invalid style' };
            break;
        case 'presentation':
            if (!hasSafeOptionalBoolean(command.active)) return { allowed: false, reason: 'invalid active flag' };
            break;
        case 'animatePath': {
            if (!getAICommandIds(command)) return { allowed: false, reason: 'invalid ids' };
            const options = getAnimationOptions(command);
            const duration = command.duration ?? options.duration;
            const loop = command.loop ?? options.loop;
            if (!hasSafeOptionalDuration(duration)) return { allowed: false, reason: 'invalid duration' };
            if (!hasSafeOptionalBoolean(loop)) return { allowed: false, reason: 'invalid loop flag' };
            break;
        }
        case 'collapse':
            if (!hasSafeId(command.id)) return { allowed: false, reason: 'missing id' };
            if (!hasSafeOptionalBoolean(command.collapsed)) return { allowed: false, reason: 'invalid collapsed flag' };
            break;
    }

    return { allowed: true };
};
