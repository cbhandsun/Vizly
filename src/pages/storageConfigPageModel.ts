import {
    normalizeS3AccessKeyId,
    normalizeS3Bucket,
    normalizeS3Endpoint,
    normalizeS3Region,
    normalizeS3SecretAccessKey,
} from '@/services/storageSecurity';

export const S3_CONNECTION_TIMEOUT_MS = 15_000;

export type StorageEndpointValidationError = 'required' | 'invalid';
export type StorageNamedFieldValidationError = 'required' | 'invalid';

export const validateStorageEndpoint = (value: unknown): StorageEndpointValidationError | null => {
    if (typeof value !== 'string' || !value.trim()) return 'required';
    return normalizeS3Endpoint(value) ? null : 'invalid';
};

const classifyNormalizedField = (
    value: unknown,
    normalize: (candidate: unknown) => string | null,
): StorageNamedFieldValidationError | null => {
    if (typeof value !== 'string' || !value.trim()) return 'required';
    return normalize(value) ? null : 'invalid';
};

export const validateStorageBucket = (value: unknown): StorageNamedFieldValidationError | null =>
    classifyNormalizedField(value, normalizeS3Bucket);

export const validateStorageRegion = (value: unknown): StorageNamedFieldValidationError | null =>
    classifyNormalizedField(value, normalizeS3Region);

export const validateStorageAccessKeyId = (value: unknown): StorageNamedFieldValidationError | null =>
    classifyNormalizedField(value, normalizeS3AccessKeyId);

export const validateStorageSecretAccessKey = (
    value: unknown,
    hasSessionSecret: boolean,
): StorageNamedFieldValidationError | null => {
    if ((typeof value !== 'string' || !value.trim()) && hasSessionSecret) return null;
    return classifyNormalizedField(value, normalizeS3SecretAccessKey);
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
