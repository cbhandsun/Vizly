import type { LogEntry } from './Logger';

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const REDACTED = '[redacted]';
const MAX_REDACTION_DEPTH = 8;
const MAX_LOG_STRING_CHARS = 20_000;

const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|token|secret|credential|password|apikey|api_key|accesskey|access_key|privatekey|private_key|sessionid|session_id|refresh)/i;
const SENSITIVE_URL_PARAM_PATTERN = /(?:authorization|auth|cookie|token|secret|credential|password|apikey|api_key|accesskey|access_key|privatekey|private_key|sessionid|session_id|refresh|code)/i;
const BLOCKED_LOG_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const SENSITIVE_STRING_PATTERNS: Array<[RegExp, string]> = [
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`],
  [/\b(Basic\s+)[A-Za-z0-9+/=-]+/gi, `$1${REDACTED}`],
  [/\b(sk-[A-Za-z0-9_-]{8,})\b/g, REDACTED],
  [/(authorization|cookie|token|secret|credential|password|api[_-]?key|access[_-]?key)(["':=\s]+)([^"',\s;&]+)/gi, `$1$2${REDACTED}`],
  [/(AWS4-HMAC-SHA256\s+Credential=)[^,\s]+/gi, `$1${REDACTED}`],
  [/(Signature=)[a-f0-9]+/gi, `$1${REDACTED}`],
  [/(X-Amz-Signature=)[a-f0-9]+/gi, `$1${REDACTED}`],
];

export const normalizeRemoteLogEndpoint = (rawEndpoint: string): string | null => {
  const trimmed = rawEndpoint.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;

  try {
    const parsed = new URL(trimmed);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname);
    if (!isHttps && !isLocalHttp) return null;
    if (parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.toString().replaceAll(encodeURIComponent(REDACTED), REDACTED);
  } catch {
    return null;
  }
};

export const redactSensitiveLogValue = (value: unknown): unknown => {
  return redactValue(value, new WeakSet<object>(), 0);
};

export const sanitizeUrlForLog = (rawUrl: unknown): string => {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) return '';

  const trimmed = rawUrl.slice(0, 4096);
  if (!/^(?:[a-z][a-z\d+.-]*:|[/?#])/i.test(trimmed)) {
    return redactSensitiveString(trimmed);
  }

  try {
    const parsed = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    parsed.username = '';
    parsed.password = '';
    parsed.searchParams.forEach((_value, key) => {
      if (SENSITIVE_URL_PARAM_PATTERN.test(key)) {
        parsed.searchParams.set(key, REDACTED);
      }
    });
    return parsed.toString().replaceAll(encodeURIComponent(REDACTED), REDACTED);
  } catch {
    return redactSensitiveString(trimmed);
  }
};

export const sanitizeLogEntry = (entry: LogEntry): LogEntry => ({
  ...entry,
  message: redactSensitiveString(entry.message),
  data: entry.data ? redactSensitiveLogValue(entry.data) as Record<string, unknown> : undefined,
});

const redactValue = (value: unknown, seen: WeakSet<object>, depth: number): unknown => {
  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
      stack: value.stack ? redactSensitiveString(value.stack) : undefined,
    };
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[circular]';
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return '[truncated]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, seen, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!key || BLOCKED_LOG_KEYS.has(key)) continue;
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry, seen, depth + 1);
  }
  return sanitized;
};

const redactSensitiveString = (value: string): string => {
  const bounded = value.length > MAX_LOG_STRING_CHARS ? value.slice(0, MAX_LOG_STRING_CHARS) : value;
  const redacted = SENSITIVE_STRING_PATTERNS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    bounded
  );
  return redacted.replace(/(\[redacted\])(?:\s+\[redacted\])+/g, REDACTED);
};
