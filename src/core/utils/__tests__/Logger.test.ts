import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

import { Logger, LocalStorageAppender, LogLevel, LogType, coerceStoredLogEntries, type LogAppender, type LogEntry } from '../Logger';

class CaptureAppender implements LogAppender {
  name = 'capture';
  minLevel = LogLevel.DEBUG;
  entries: LogEntry[] = [];

  append(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

describe('Logger', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sanitizes entries before dispatching them to appenders', () => {
    const capture = new CaptureAppender();
    const logger = Logger.getInstance();
    logger.addAppender(capture);
    logger.updateConfig({
      enabled: true,
      minLevel: LogLevel.DEBUG,
      defaultUserId: 'user-token-secret',
      defaultSessionId: 'session-cookie-secret',
    });

    try {
      logger.error('Authorization: Bearer console-secret', {
        token: 'data-secret',
        nested: { apiKey: 'nested-secret' },
      });

      expect(capture.entries).toHaveLength(1);
      const payload = JSON.stringify(capture.entries[0]);
      expect(payload).toContain('[redacted]');
      expect(payload).not.toContain('console-secret');
      expect(payload).not.toContain('data-secret');
      expect(payload).not.toContain('nested-secret');
      expect(payload).not.toContain('user-token-secret');
      expect(payload).not.toContain('session-cookie-secret');
    } finally {
      logger.removeAppender(capture.name);
    }
  });
});

describe('LocalStorageAppender', () => {
  beforeEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
  });

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
    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[Logger.LocalStorageAppender.getLogs] Failed to read "diagram_logs":',
      expect.anything()
    );
  });

  it('skips oversized persisted log payloads before parsing', () => {
    const appender = new LocalStorageAppender(LogLevel.DEBUG, 'diagram_logs');
    localStorage.setItem('diagram_logs', 'x'.repeat(2 * 1024 * 1024 + 1));

    expect(appender.getStoredLogs()).toEqual([]);
  });

  it('redacts local storage appender failures before warning', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Authorization: Bearer sk-live-secret');
    });
    const appender = new LocalStorageAppender(LogLevel.DEBUG, 'diagram_logs');

    appender.append({
      id: 'new',
      timestamp: 2,
      level: LogLevel.ERROR,
      type: LogType.SECURITY,
      message: 'api_key=live-secret',
    });

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[Logger.LocalStorageAppender.append] Failed to write "diagram_logs":',
      expect.anything()
    );
    expect(safeLogState.warn).toHaveBeenCalledWith('本地存储日志失败:', expect.anything());
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.warn.mock.calls[0]?.[1])).not.toContain('sk-live-secret');
    setItemSpy.mockRestore();
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
