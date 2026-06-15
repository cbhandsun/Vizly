import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagramError, ErrorHandler, ErrorSeverity, ErrorType } from '../ErrorHandler';
import { LogLevel, LogType, RemoteAppender, type LogEntry } from '../Logger';
import {
  normalizeRemoteLogEndpoint,
  redactSensitiveLogValue,
  sanitizeLogEntry,
  sanitizeUrlForLog,
} from '../logSecurity';

const createLogEntry = (data?: Record<string, unknown>): LogEntry => ({
  id: 'log-1',
  timestamp: 1710000000000,
  level: LogLevel.ERROR,
  type: LogType.SECURITY,
  message: 'failed with Authorization: Bearer super-secret-token',
  data,
  source: 'test',
  userId: 'user-1',
  sessionId: 'session-1',
});

describe('logSecurity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('normalizes HTTPS and local HTTP log endpoints only', () => {
    expect(normalizeRemoteLogEndpoint('https://logs.example.com/ingest#debug')).toBe('https://logs.example.com/ingest');
    expect(normalizeRemoteLogEndpoint('http://localhost:8787/logs')).toBe('http://localhost:8787/logs');

    expect(normalizeRemoteLogEndpoint('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(normalizeRemoteLogEndpoint('//logs.example.com/ingest')).toBeNull();
    expect(normalizeRemoteLogEndpoint('javascript:alert(1)')).toBeNull();
    expect(normalizeRemoteLogEndpoint('https://user:pass@logs.example.com/ingest')).toBeNull();
  });

  it('redacts nested secrets while preserving non-sensitive context', () => {
    const input = {
      status: 401,
      authorization: 'Bearer live-token',
      headers: {
        cookie: 'session_id=abc123',
        requestId: 'req-1',
      },
      error: new Error('request failed with api_key=sk-test-secret-value'),
      list: ['Bearer nested-token', { refreshToken: 'refresh-secret' }],
    };

    const redacted = redactSensitiveLogValue(input) as Record<string, unknown>;

    expect(redacted.status).toBe(401);
    expect(redacted.authorization).toBe('[redacted]');
    expect(redacted.headers).toMatchObject({
      cookie: '[redacted]',
      requestId: 'req-1',
    });
    expect(JSON.stringify(redacted)).not.toContain('live-token');
    expect(JSON.stringify(redacted)).not.toContain('sk-test-secret-value');
    expect(JSON.stringify(redacted)).not.toContain('refresh-secret');
  });

  it('sanitizes URLs before they are stored or sent in logs', () => {
    expect(sanitizeUrlForLog('https://user:pass@app.example.test/diagram?token=live-token&code=oauth-code&requestId=req-1#frag'))
      .toBe('https://app.example.test/diagram?token=[redacted]&code=[redacted]&requestId=req-1#frag');

    expect(sanitizeUrlForLog('request failed with Authorization: Bearer live-token'))
      .toBe('request failed with Authorization: [redacted]');
  });

  it('sanitizes log entry messages and data before remote submission', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const appender = new RemoteAppender('https://logs.example.com/ingest', LogLevel.WARN, 1, 60_000);
    appender.append(createLogEntry({
      apiKey: 'sk-test-api-key-placeholder',
      nested: { token: 'nested-secret' },
    }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    appender.destroy();

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));

    expect(payload.logs).toHaveLength(1);
    expect(payload.logs[0].message).toContain('Authorization: [redacted]');
    expect(payload.logs[0].data.apiKey).toBe('[redacted]');
    expect(payload.logs[0].data.nested.token).toBe('[redacted]');
    expect(JSON.stringify(payload)).not.toContain('sk-live-secret-value');
    expect(JSON.stringify(payload)).not.toContain('super-secret-token');
  });

  it('rejects unsafe remote appender endpoints', () => {
    expect(() => new RemoteAppender('http://example.com/logs')).toThrow('Remote log endpoint must use HTTPS');
    expect(() => new RemoteAppender('file:///tmp/logs')).toThrow('Remote log endpoint must use HTTPS');
  });

  it('redacts ErrorHandler remote payloads and skips invalid endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    const handler = ErrorHandler.getInstance();
    handler.clearErrorCache();
    handler.updateConfig({
      enableConsoleLog: false,
      enableRemoteLog: true,
      remoteLogEndpoint: 'https://logs.example.com/errors',
      showUserNotification: false,
      enableErrorRecovery: false,
    });

    handler.handleError(new DiagramError(
      'request failed with token=live-token',
      ErrorType.NETWORK,
      ErrorSeverity.HIGH,
      { data: { authorization: 'Bearer secret-token', requestId: 'req-1' } }
    ));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(request.body));
    expect(payload.message).toContain('token=[redacted]');
    expect(payload.context.data.authorization).toBe('[redacted]');
    expect(payload.context.data.requestId).toBe('req-1');
    expect(JSON.stringify(payload)).not.toContain('secret-token');

    fetchMock.mockClear();
    handler.updateConfig({ remoteLogEndpoint: 'http://example.com/errors' });
    handler.handleError(new Error('unsafe endpoint test'));

    await vi.waitFor(() => expect(warnMock).toHaveBeenCalledWith('远程日志端点无效，已跳过发送'));
    expect(fetchMock).not.toHaveBeenCalled();

    handler.updateConfig({
      enableRemoteLog: false,
      remoteLogEndpoint: undefined,
      showUserNotification: true,
      enableErrorRecovery: true,
    });
  });

  it('handles circular log objects safely', () => {
    const circular: Record<string, unknown> = { requestId: 'req-1' };
    circular.self = circular;

    expect(sanitizeLogEntry(createLogEntry({ circular })).data).toEqual({
      circular: {
        requestId: 'req-1',
        self: '[circular]',
      },
    });
  });

  it('drops prototype-pollution keys and bounds oversized log strings', () => {
    const redacted = redactSensitiveLogValue(JSON.parse(`{
      "safe": "ok",
      "constructor": { "polluted": true },
      "nested": {
        "__proto__": { "polluted": true },
        "message": "${'x'.repeat(20_010)}"
      }
    }`)) as Record<string, any>;

    expect(redacted.safe).toBe('ok');
    expect(Object.hasOwn(redacted, 'constructor')).toBe(false);
    expect(Object.hasOwn(redacted.nested, '__proto__')).toBe(false);
    expect(redacted.nested.message).toHaveLength(20_000);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
});
