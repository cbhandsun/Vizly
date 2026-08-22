import { coerceDiagramId } from '@/core/utils/inputBoundary';
import { AUTOSAVE_PREFIX, parseAutoSavePayload } from '@/core/utils/autoSaveStorage';

type ReadStorage = Pick<Storage, 'getItem'>;

export const WORKSPACE_UNKNOWN_TIMESTAMP = -1;

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_DATE_STRING_LENGTH = 64;

const asRecord = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const coerceWorkspaceTimestamp = (value: unknown, now: number): number | null => {
  let timestamp: number;
  if (typeof value === 'number') {
    timestamp = value;
  } else if (value instanceof Date) {
    timestamp = value.getTime();
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_DATE_STRING_LENGTH) return null;
    timestamp = Date.parse(trimmed);
  } else {
    return null;
  }

  return Number.isFinite(timestamp)
    && timestamp > 0
    && timestamp <= now + MAX_FUTURE_SKEW_MS
    ? timestamp
    : null;
};

export const resolveWorkspaceLocalModifiedAt = (
  diagram: unknown,
  storage: ReadStorage | null,
  now = Date.now(),
): number => {
  const safeNow = Number.isFinite(now) && now > 0 ? now : Date.now();
  const record = asRecord(diagram);
  if (!record) return WORKSPACE_UNKNOWN_TIMESTAMP;

  const candidates: number[] = [];
  const metadata = asRecord(record.metadata);
  const updatedAt = coerceWorkspaceTimestamp(metadata?.updatedAt, safeNow);
  const createdAt = coerceWorkspaceTimestamp(metadata?.createdAt, safeNow);
  if (updatedAt !== null) candidates.push(updatedAt);
  if (createdAt !== null) candidates.push(createdAt);

  const diagramId = coerceDiagramId(record.id);
  if (storage && diagramId) {
    try {
      const payload = parseAutoSavePayload(storage.getItem(`${AUTOSAVE_PREFIX}${diagramId}`));
      const payloadMatches = !payload?.diagramId || payload.diagramId === diagramId;
      const autosavedAt = payloadMatches
        ? coerceWorkspaceTimestamp(payload?.timestamp, safeNow)
        : null;
      if (autosavedAt !== null) candidates.push(autosavedAt);
    } catch {
      // Storage access is optional; metadata remains a valid fallback.
    }
  }

  return candidates.length > 0 ? Math.max(...candidates) : WORKSPACE_UNKNOWN_TIMESTAMP;
};

export const formatWorkspaceTimeAgo = (
  timestamp: number,
  locale: string,
  unknownLabel: string,
  now = Date.now(),
): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now + MAX_FUTURE_SKEW_MS) {
    return unknownLabel;
  }
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 1) return relative.format(0, 'minute');
  if (minutes < 60) return relative.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relative.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return relative.format(-days, 'day');
  return new Date(timestamp).toLocaleDateString(locale);
};
