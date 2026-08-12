const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REDACTED = '[redacted]';
export const S3_STORAGE_INPUT_LIMITS = {
    endpoint: 2_048,
    accessKeyId: 512,
    secretAccessKey: 8_000,
    bucket: 255,
    region: 128,
} as const;

const MAX_ENDPOINT_LENGTH = S3_STORAGE_INPUT_LIMITS.endpoint;
const MAX_ACCESS_KEY_LENGTH = S3_STORAGE_INPUT_LIMITS.accessKeyId;
const MAX_SECRET_LENGTH = S3_STORAGE_INPUT_LIMITS.secretAccessKey;
const MAX_BUCKET_LENGTH = S3_STORAGE_INPUT_LIMITS.bucket;
const MAX_REGION_LENGTH = S3_STORAGE_INPUT_LIMITS.region;

export interface PersistedS3StorageConfig {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey?: string;
    bucket: string;
    region: string;
    s3ForcePathStyle?: boolean;
}

export type ValidatedS3StorageConfig = Omit<PersistedS3StorageConfig, 'secretAccessKey'> & {
    secretAccessKey: string;
};

export const hasPersistedS3SecretField = (rawConfig: unknown): boolean =>
    !!rawConfig
    && typeof rawConfig === 'object'
    && !Array.isArray(rawConfig)
    && Object.hasOwn(rawConfig, 'secretAccessKey');

export const normalizeS3Endpoint = (rawEndpoint: string): string | null => {
    const trimmed = rawEndpoint.trim();
    if (!trimmed || trimmed.length > MAX_ENDPOINT_LENGTH || trimmed.startsWith('//')) return null;

    try {
        const parsed = new URL(trimmed);
        const isHttps = parsed.protocol === 'https:';
        const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);
        if (!isHttps && !isLocalHttp) return null;
        if (parsed.username || parsed.password) return null;
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
};

const hasControlCharacter = (value: string): boolean =>
    value.split('').some(char => {
        const code = char.charCodeAt(0);
        return code <= 31 || code === 127;
    });

const getString = (value: unknown, maxLength: number): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > maxLength || hasControlCharacter(trimmed)) return null;
    return trimmed;
};

export const normalizeS3Bucket = (value: unknown): string | null => {
    const bucket = getString(value, MAX_BUCKET_LENGTH);
    if (!bucket || bucket.includes('/') || bucket.includes('\\') || bucket === '.' || bucket === '..') return null;
    return bucket;
};

export const normalizeS3Region = (value: unknown): string | null => {
    const region = getString(value, MAX_REGION_LENGTH);
    if (!region || !/^[A-Za-z0-9_.-]+$/.test(region)) return null;
    return region;
};

export const normalizeS3AccessKeyId = (value: unknown): string | null => {
    const accessKeyId = getString(value, MAX_ACCESS_KEY_LENGTH);
    if (!accessKeyId || /\s/.test(accessKeyId)) return null;
    return accessKeyId;
};

export const normalizeS3SecretAccessKey = (value: unknown): string | null =>
    getString(value, MAX_SECRET_LENGTH);

export const coerceS3StorageConfig = (
    rawConfig: unknown,
    sessionSecret = ''
): ValidatedS3StorageConfig | null => {
    if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
        return null;
    }

    const record = rawConfig as Record<string, unknown>;
    const endpoint = getString(record.endpoint, MAX_ENDPOINT_LENGTH);
    const normalizedEndpoint = endpoint ? normalizeS3Endpoint(endpoint) : null;
    const accessKeyId = normalizeS3AccessKeyId(record.accessKeyId);
    const bucket = normalizeS3Bucket(record.bucket);
    const region = normalizeS3Region(record.region);
    const persistedSecret = normalizeS3SecretAccessKey(record.secretAccessKey) || '';
    const effectiveSecret = normalizeS3SecretAccessKey(sessionSecret) || persistedSecret;

    if (!normalizedEndpoint || !accessKeyId || !bucket || !region || !effectiveSecret) {
        return null;
    }

    return {
        endpoint: normalizedEndpoint,
        accessKeyId,
        secretAccessKey: effectiveSecret,
        bucket,
        region,
        s3ForcePathStyle: typeof record.s3ForcePathStyle === 'boolean' ? record.s3ForcePathStyle : undefined,
    };
};

export const redactSensitiveValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
        return value
            .replace(/(AWS4-HMAC-SHA256\s+Credential=)[^,\s]+/gi, `$1${REDACTED}`)
            .replace(/(Signature=)[a-f0-9]+/gi, `$1${REDACTED}`)
            .replace(/(X-Amz-Signature=)[a-f0-9]+/gi, `$1${REDACTED}`)
            .replace(/(accessKeyId|secretAccessKey|secret|token|authorization)(["':=\s]+)([^"',\s]+)/gi, `$1$2${REDACTED}`);
    }

    if (Array.isArray(value)) {
        return value.map(redactSensitiveValue);
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                /secret|token|authorization|credential|accesskey/i.test(key)
                    ? REDACTED
                    : redactSensitiveValue(entry),
            ])
        );
    }

    return value;
};
