export const S3_CONNECTION_TIMEOUT_MS = 15_000;

interface FormValidationFailure {
    errorFields: unknown[];
}

export const isFormValidationFailure = (value: unknown): value is FormValidationFailure => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Array.isArray((value as Record<string, unknown>).errorFields);
};

export const isAbortFailure = (value: unknown): boolean => typeof DOMException !== 'undefined' && value instanceof DOMException
    ? value.name === 'AbortError'
    : Boolean(
        value
        && typeof value === 'object'
        && 'name' in value
        && (value as { name?: unknown }).name === 'AbortError'
    );
