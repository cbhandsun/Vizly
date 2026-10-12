import { isRecord } from './boundary.js';

/** Only bounded canvas coordinates can supplement the server-owned identity. */
export const sanitizePresence = (state: unknown, userId: string) => {
  if (state === null) return null;
  if (!isRecord(state)) throw new Error('Invalid presence state');
  const cursor = state.cursor;
  if (cursor !== undefined && cursor !== null && (!isRecord(cursor)
    || typeof cursor.x !== 'number' || typeof cursor.y !== 'number'
    || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)
    || Math.abs(cursor.x) > 1_000_000 || Math.abs(cursor.y) > 1_000_000)) {
    throw new Error('Invalid presence cursor');
  }
  return {
    user: { name: `User ${userId.slice(0, 8)}`, color: '#0ea5e9' },
    ...(cursor === undefined ? {} : { cursor: cursor === null ? null : { x: cursor.x, y: cursor.y } }),
  };
};
