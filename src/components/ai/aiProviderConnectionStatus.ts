export type AIProviderConnectionOperation = 'test-connection' | 'model-sync';

export type AIProviderConnectionStatus =
    | { kind: 'untested' }
    | { kind: 'testing'; operation: AIProviderConnectionOperation }
    | { kind: 'success'; operation: AIProviderConnectionOperation }
    | { kind: 'failure'; operation: AIProviderConnectionOperation; message: string };

export type AIProviderConnectionFeedback = {
    tone: 'info' | 'success' | 'error';
    messageKey:
        | 'untested'
        | 'testing'
        | 'syncing'
        | 'verified'
        | 'models-verified'
        | 'test-failed'
        | 'sync-failed';
    role: 'status' | 'alert';
};

export type AIProviderConnectionStatusMap = Readonly<Record<string, AIProviderConnectionStatus>>;

const UNTESTED_STATUS: AIProviderConnectionStatus = Object.freeze({ kind: 'untested' });
const MAX_STATUS_MESSAGE_LENGTH = 160;

const replaceControlCharacters = (value: string): string => Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    const isControlCharacter = codePoint !== undefined
        && ((codePoint >= 0 && codePoint <= 31) || codePoint === 127);

    return isControlCharacter ? ' ' : character;
}).join('');

export const normalizeAIProviderConnectionStatusMessage = (value: unknown): string => {
    if (typeof value !== 'string') return '';

    return replaceControlCharacters(value)
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, MAX_STATUS_MESSAGE_LENGTH);
};

export const getAIProviderConnectionStatus = (
    statuses: AIProviderConnectionStatusMap,
    providerId: string,
): AIProviderConnectionStatus => statuses[providerId] ?? UNTESTED_STATUS;

export const setAIProviderConnectionStatus = (
    statuses: AIProviderConnectionStatusMap,
    providerId: string,
    status: AIProviderConnectionStatus,
): AIProviderConnectionStatusMap => ({
    ...statuses,
    [providerId]: status,
});

export const invalidateAIProviderConnectionStatus = (
    statuses: AIProviderConnectionStatusMap,
    providerId: string,
): AIProviderConnectionStatusMap => {
    if (!(providerId in statuses)) return statuses;

    const nextStatuses = { ...statuses };
    delete nextStatuses[providerId];
    return nextStatuses;
};

export const createAIProviderConnectionFailure = (
    operation: AIProviderConnectionOperation,
    message: unknown,
): AIProviderConnectionStatus => ({
    kind: 'failure',
    operation,
    message: normalizeAIProviderConnectionStatusMessage(message),
});

export const getAIProviderConnectionFeedback = (
    status: AIProviderConnectionStatus,
): AIProviderConnectionFeedback => {
    switch (status.kind) {
        case 'untested':
            return { tone: 'info', messageKey: 'untested', role: 'status' };
        case 'testing':
            return {
                tone: 'info',
                messageKey: status.operation === 'model-sync' ? 'syncing' : 'testing',
                role: 'status',
            };
        case 'success':
            return {
                tone: 'success',
                messageKey: status.operation === 'model-sync' ? 'models-verified' : 'verified',
                role: 'status',
            };
        case 'failure':
            return {
                tone: 'error',
                messageKey: status.operation === 'model-sync' ? 'sync-failed' : 'test-failed',
                role: 'alert',
            };
    }
};
