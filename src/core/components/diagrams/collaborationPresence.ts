export interface CollaborationPresenceUser {
  clientId: string | number;
  user: {
    name: string;
    color: string;
  };
  cursor?: {
    x: number;
    y: number;
  };
  isLocal?: boolean;
  isIdle?: boolean;
}

const MAX_ACTIVE_USERS = 100;
const MAX_USER_NAME_CHARS = 80;
const MAX_CLIENT_ID_CHARS = 128;
const MAX_CURSOR_COORDINATE = 10_000_000;
const SAFE_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const DEFAULT_USER_COLOR = '#1890ff';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const coerceClientId = (value: unknown): string | number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_CLIENT_ID_CHARS ? normalized : null;
};

const coerceCursor = (value: unknown): CollaborationPresenceUser['cursor'] => {
  if (!isRecord(value)) return undefined;
  const { x, y } = value;
  if (
    typeof x !== 'number'
    || typeof y !== 'number'
    || !Number.isFinite(x)
    || !Number.isFinite(y)
    || Math.abs(x) > MAX_CURSOR_COORDINATE
    || Math.abs(y) > MAX_CURSOR_COORDINATE
  ) {
    return undefined;
  }
  return { x, y };
};

export const coerceCollaborationPresenceUsers = (value: unknown): CollaborationPresenceUser[] => {
  if (!Array.isArray(value)) return [];

  const users = new Map<string, CollaborationPresenceUser>();
  for (const candidate of value.slice(0, MAX_ACTIVE_USERS)) {
    if (!isRecord(candidate) || !isRecord(candidate.user)) continue;
    const clientId = coerceClientId(candidate.clientId);
    const name = typeof candidate.user.name === 'string'
      ? candidate.user.name.trim().slice(0, MAX_USER_NAME_CHARS)
      : '';
    if (clientId === null || !name) continue;

    const rawColor = typeof candidate.user.color === 'string' ? candidate.user.color.trim() : '';
    const cursor = coerceCursor(candidate.cursor);
    const presenceUser: CollaborationPresenceUser = {
      clientId,
      user: {
        name,
        color: SAFE_COLOR_PATTERN.test(rawColor) ? rawColor : DEFAULT_USER_COLOR,
      },
      ...(cursor ? { cursor } : {}),
      ...(typeof candidate.isLocal === 'boolean' ? { isLocal: candidate.isLocal } : {}),
      ...(typeof candidate.isIdle === 'boolean' ? { isIdle: candidate.isIdle } : {}),
    };
    users.set(String(clientId), presenceUser);
  }

  return [...users.values()];
};
