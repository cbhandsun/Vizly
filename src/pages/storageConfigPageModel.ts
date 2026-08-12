import { normalizeS3Endpoint } from '@/services/storageSecurity';

export const S3_CONNECTION_TIMEOUT_MS = 15_000;

export type StorageEndpointValidationError = 'required' | 'invalid';

export const validateStorageEndpoint = (value: unknown): StorageEndpointValidationError | null => {
    if (typeof value !== 'string' || !value.trim()) return 'required';
    return normalizeS3Endpoint(value) ? null : 'invalid';
};

export type StorageConfigFieldName = Array<string | number>;

interface FormValidationErrorField {
    name: StorageConfigFieldName;
}

interface FormValidationFailure {
    errorFields: FormValidationErrorField[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
    value && typeof value === 'object' && !Array.isArray(value),
);

const isFieldNamePart = (value: unknown): value is string | number => (
    typeof value === 'string'
    || (typeof value === 'number' && Number.isSafeInteger(value))
);

const isValidationErrorField = (value: unknown): value is FormValidationErrorField => {
    if (!isRecord(value) || !Array.isArray(value.name)) return false;
    return value.name.length > 0 && value.name.every(isFieldNamePart);
};

export const isFormValidationFailure = (value: unknown): value is FormValidationFailure => {
    if (!isRecord(value) || !Array.isArray(value.errorFields)) return false;
    return value.errorFields.every(isValidationErrorField);
};

export const getFirstInvalidFieldName = (value: unknown): StorageConfigFieldName | null => {
    if (!isFormValidationFailure(value)) return null;
    const firstField = value.errorFields[0];
    return firstField ? [...firstField.name] : null;
};

export const isAbortFailure = (value: unknown): boolean => typeof DOMException !== 'undefined' && value instanceof DOMException
    ? value.name === 'AbortError'
    : Boolean(
        value
        && typeof value === 'object'
        && 'name' in value
        && (value as { name?: unknown }).name === 'AbortError'
    );
