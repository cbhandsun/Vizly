import { describe, expect, it, vi, afterEach } from 'vitest';
import { LocalStorageAppender, LogLevel, LogType, coerceStoredLogEntries, type LogEntry } from '../Logger';

describe('LocalStorageAppender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('coerces polluted stored log entries before appending', () => {
    localStorage.setItem('diagram_logs', JSON.stringify([
      null,
      { id: '', message: 'missing id', timestamp: 1, level: LogLevel.INFO, type: LogType.SYSTEM },
      {
        id: 'kept',
        timestamp: -1,
        level: 999,
        type: 'unknown',
        message: `Authorization: Bearer stored-secret ${'x'.repeat(5000)}`,
        data: {
          token: 'data-secret',
          nested: {
            secret: 'nested-secret',
            long: 'y'.repeat(5000),
          },
        },
        tags: ['safe', '', 123, 'z'.repeat(200)],
      },
    ]));

    const appender = new LocalStorageAppender(LogLevel.DEBUG, 'diagram_logs', 2);
    appender.append({
      id: 'new',
      timestamp: 2,
      level: LogLevel.ERROR,
      type: LogType.SECURITY,
      message: 'api_key=live-secret',
      data: { password: 'plain-secret' },
    });

    const stored = JSON.parse(localStorage.getItem('diagram_logs') ?? '[]') as LogEntry[];
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe('kept');
    expect(stored[0].level).toBe(LogLevel.INFO);
    expect(stored[0].type).toBe(LogType.SYSTEM);
    expect(stored[0].message).toContain('Authorization: [redacted]');
    expect(stored[0].message.length).toBeLessThanOrEqual(4000);
    expect(stored[0].data?.token).toBe('[redacted]');
    expect(stored[0].data?.nested).toMatchObject({ secret: '[redacted]' });
    expect(stored[0].tags).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toContain('live-secret');
    expect(JSON.stringify(stored)).not.toContain('plain-secret');
  });

  it('returns empty stored logs for non-array or invalid JSON payloads', () => {
    const appender = new LocalStorageAppender(LogLevel.DEBUG, 'diagram_logs');

    localStorage.setItem('diagram_logs', '{"push":"not-array"}');
    expect(appender.getStoredLogs()).toEqual([]);

    localStorage.setItem('diagram_logs', '{bad json');
    expect(appender.getStoredLogs()).toEqual([]);
  });

  it('skips oversized persisted log payloads before parsing', () => {
    const appender = new LocalStorageAppender(LogLevel.DEBUG, 'diagram_logs');
    localStorage.setItem('diagram_logs', 'x'.repeat(2 * 1024 * 1024 + 1));

    expect(appender.getStoredLogs()).toEqual([]);
  });
});

describe('coerceStoredLogEntries', () => {
  it('keeps only the configured number of recent valid log entries', () => {
    const entries = Array.from({ length: 5 }, (_, index) => ({
      id: `log-${index}`,
      timestamp: index,
      level: LogLevel.INFO,
      type: LogType.SYSTEM,
      message: `message-${index}`,
    }));

    expect(coerceStoredLogEntries(entries, 2).map(entry => entry.id)).toEqual(['log-3', 'log-4']);
  });
});
