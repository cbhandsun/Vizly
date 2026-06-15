/**
 * 统一日志系统
 */

import { normalizeRemoteLogEndpoint, sanitizeLogEntry } from './logSecurity';

const MAX_STORED_LOG_ENTRIES = 1000;
const MAX_LOG_STRING_LENGTH = 4000;
const MAX_LOG_ID_LENGTH = 120;
const MAX_LOG_TAGS = 20;
const MAX_LOG_DATA_KEYS = 50;
const MAX_LOG_DATA_ARRAY_ITEMS = 50;
const MAX_LOG_DATA_DEPTH = 4;
const MAX_STORED_LOGS_JSON_LENGTH = 2 * 1024 * 1024;

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

// 日志类型
export enum LogType {
  SYSTEM = 'system',
  USER_ACTION = 'user_action',
  PERFORMANCE = 'performance',
  BUSINESS = 'business',
  SECURITY = 'security'
}

// 日志条目接口
export interface LogEntry {
  /** 唯一标识 */
  id: string;
  /** 时间戳 */
  timestamp: number;
  /** 日志级别 */
  level: LogLevel;
  /** 日志类型 */
  type: LogType;
  /** 消息内容 */
  message: string;
  /** 相关数据 */
  data?: Record<string, unknown>;
  /** 来源组件 */
  source?: string;
  /** 用户ID */
  userId?: string;
  /** 会话ID */
  sessionId?: string;
  /** 标签 */
  tags?: string[];
}

const LOG_LEVEL_VALUES = new Set<number>(Object.values(LogLevel).filter((value): value is number => typeof value === 'number'));
const LOG_TYPE_VALUES = new Set<string>(Object.values(LogType));

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const cleanString = (value: unknown, maxLength: number, fallback = ''): string => {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
};

const cleanOptionalString = (value: unknown, maxLength: number): string | undefined => {
  const cleaned = cleanString(value, maxLength);
  return cleaned ? cleaned : undefined;
};

const cleanTimestamp = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now();
};

const boundLogDataValue = (value: unknown, depth: number): unknown => {
  if (typeof value === 'string') return value.slice(0, MAX_LOG_STRING_LENGTH);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value === null) return value;
  if (depth >= MAX_LOG_DATA_DEPTH) return '[truncated]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_LOG_DATA_ARRAY_ITEMS)
      .map(item => boundLogDataValue(item, depth + 1));
  }

  if (!isRecord(value)) return String(value).slice(0, MAX_LOG_STRING_LENGTH);

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_LOG_DATA_KEYS)
      .map(([key, entry]) => [
        key.slice(0, MAX_LOG_ID_LENGTH),
        boundLogDataValue(entry, depth + 1),
      ])
  );
};

const cleanLogData = (value: unknown): Record<string, unknown> | undefined => {
  if (!isRecord(value)) return undefined;
  return boundLogDataValue(value, 0) as Record<string, unknown>;
};

const cleanTags = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .slice(0, MAX_LOG_TAGS)
    .map(tag => tag.slice(0, MAX_LOG_ID_LENGTH));
  return tags.length > 0 ? tags : undefined;
};

const cleanStoredLogEntry = (value: unknown): LogEntry | null => {
  if (!isRecord(value)) return null;

  const id = cleanString(value.id, MAX_LOG_ID_LENGTH);
  const message = cleanString(value.message, MAX_LOG_STRING_LENGTH);
  if (!id || !message) return null;

  const level = LOG_LEVEL_VALUES.has(value.level as LogLevel)
    ? value.level as LogLevel
    : LogLevel.INFO;
  const type = LOG_TYPE_VALUES.has(value.type as LogType)
    ? value.type as LogType
    : LogType.SYSTEM;

  const sanitized = sanitizeLogEntry({
    id,
    timestamp: cleanTimestamp(value.timestamp),
    level,
    type,
    message,
    data: cleanLogData(value.data),
    source: cleanOptionalString(value.source, MAX_LOG_ID_LENGTH),
    userId: cleanOptionalString(value.userId, MAX_LOG_ID_LENGTH),
    sessionId: cleanOptionalString(value.sessionId, MAX_LOG_ID_LENGTH),
    tags: cleanTags(value.tags),
  });

  return {
    ...sanitized,
    id: cleanString(sanitized.id, MAX_LOG_ID_LENGTH),
    message: cleanString(sanitized.message, MAX_LOG_STRING_LENGTH),
    source: cleanOptionalString(sanitized.source, MAX_LOG_ID_LENGTH),
    userId: cleanOptionalString(sanitized.userId, MAX_LOG_ID_LENGTH),
    sessionId: cleanOptionalString(sanitized.sessionId, MAX_LOG_ID_LENGTH),
    tags: cleanTags(sanitized.tags),
  };
};

export const coerceStoredLogEntries = (value: unknown, maxEntries: number = MAX_STORED_LOG_ENTRIES): LogEntry[] => {
  if (!Array.isArray(value)) return [];
  const limit = Math.max(0, Math.min(maxEntries, MAX_STORED_LOG_ENTRIES));
  return value
    .slice(-limit)
    .map(cleanStoredLogEntry)
    .filter((entry): entry is LogEntry => entry !== null);
};

// 日志输出器接口
export interface LogAppender {
  /** 输出器名称 */
  name: string;
  /** 最小日志级别 */
  minLevel: LogLevel;
  /** 输出日志 */
  append(entry: LogEntry): void | Promise<void>;
}

// 控制台输出器
export class ConsoleAppender implements LogAppender {
  public readonly name = 'console';
  public readonly minLevel: LogLevel;

  constructor(minLevel: LogLevel = LogLevel.DEBUG) {
    this.minLevel = minLevel;
  }

  append(entry: LogEntry): void {
    if (entry.level < this.minLevel) return;

    const timestamp = new Date(entry.timestamp).toISOString();
    const levelName = LogLevel[entry.level];
    const prefix = `[${timestamp}] [${levelName}] [${entry.type}]`;
    
    const logMethod = this.getConsoleMethod(entry.level);
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      console[logMethod](`${prefix} ${entry.message}`, entry.data);
    } else {
      console[logMethod](`${prefix} ${entry.message}`);
    }
  }

  private getConsoleMethod(level: LogLevel): 'debug' | 'log' | 'warn' | 'error' {
    switch (level) {
      case LogLevel.DEBUG:
        return 'debug';
      case LogLevel.INFO:
        return 'log';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return 'error';
      default:
        return 'log';
    }
  }
}

// 本地存储输出器
export class LocalStorageAppender implements LogAppender {
  public readonly name = 'localStorage';
  public readonly minLevel: LogLevel;
  private readonly storageKey: string;
  private readonly maxEntries: number;

  constructor(
    minLevel: LogLevel = LogLevel.INFO,
    storageKey: string = 'diagram_logs',
    maxEntries: number = MAX_STORED_LOG_ENTRIES
  ) {
    this.minLevel = minLevel;
    this.storageKey = storageKey;
    this.maxEntries = Math.max(0, Math.min(maxEntries, MAX_STORED_LOG_ENTRIES));
  }

  append(entry: LogEntry): void {
    if (entry.level < this.minLevel) return;

    try {
      const existingLogs = this.getLogs();
      existingLogs.push(sanitizeLogEntry(entry));

      // 限制日志数量
      if (existingLogs.length > this.maxEntries) {
        existingLogs.splice(0, existingLogs.length - this.maxEntries);
      }

      localStorage.setItem(this.storageKey, JSON.stringify(existingLogs));
    } catch (error) {
      console.warn('本地存储日志失败:', error);
    }
  }

  private getLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored && stored.length > MAX_STORED_LOGS_JSON_LENGTH) return [];
      return stored ? coerceStoredLogEntries(JSON.parse(stored), this.maxEntries) : [];
    } catch {
      return [];
    }
  }

  /**
   * 获取存储的日志
   */
  public getStoredLogs(): LogEntry[] {
    return this.getLogs();
  }

  /**
   * 清空存储的日志
   */
  public clearLogs(): void {
    localStorage.removeItem(this.storageKey);
  }
}

// 远程输出器
export class RemoteAppender implements LogAppender {
  public readonly name = 'remote';
  public readonly minLevel: LogLevel;
  private readonly endpoint: string;
  private readonly batchSize: number;
  private readonly flushInterval: number;
  private batch: LogEntry[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(
    endpoint: string,
    minLevel: LogLevel = LogLevel.WARN,
    batchSize: number = 10,
    flushInterval: number = 5000
  ) {
    this.minLevel = minLevel;
    const normalizedEndpoint = normalizeRemoteLogEndpoint(endpoint);
    if (!normalizedEndpoint) {
      throw new Error('Remote log endpoint must use HTTPS, or local HTTP localhost/127.0.0.1.');
    }
    this.endpoint = normalizedEndpoint;
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
    
    this.startFlushTimer();
  }

  append(entry: LogEntry): void {
    if (entry.level < this.minLevel) return;

    this.batch.push(entry);

    if (this.batch.length >= this.batchSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.batch.length > 0) {
        this.flush();
      }
    }, this.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.batch.length === 0) return;

    const logsToSend = this.batch.map(sanitizeLogEntry);
    this.batch = [];

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs: logsToSend })
      });
    } catch (error) {
      console.warn('远程日志发送失败:', error);
      // 将失败的日志重新加入批次
      this.batch.unshift(...logsToSend);
    }
  }

  /**
   * 销毁输出器
   */
  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

// 日志器配置
export interface LoggerConfig {
  /** 全局最小日志级别 */
  minLevel?: LogLevel;
  /** 是否启用 */
  enabled?: boolean;
  /** 默认来源 */
  defaultSource?: string;
  /** 默认用户ID */
  defaultUserId?: string;
  /** 默认会话ID */
  defaultSessionId?: string;
  /** 输出器列表 */
  appenders?: LogAppender[];
}

/**
 * 日志器类
 */
export class Logger {
  private static instance: Logger;
  private config: Required<LoggerConfig>;
  private appenders: LogAppender[] = [];
  private logCount = 0;

  private constructor(config: LoggerConfig = {}) {
    this.config = {
      minLevel: LogLevel.DEBUG,
      enabled: true,
      defaultSource: 'DiagramApp',
      defaultUserId: '',
      defaultSessionId: this.generateSessionId(),
      appenders: [new ConsoleAppender()],
      ...config
    };

    this.appenders = this.config.appenders;
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成日志ID
   */
  private generateLogId(): string {
    return `log_${Date.now()}_${++this.logCount}`;
  }

  /**
   * 记录日志
   */
  private log(
    level: LogLevel,
    type: LogType,
    message: string,
    data?: Record<string, unknown>,
    source?: string,
    tags?: string[]
  ): void {
    if (!this.config.enabled || level < this.config.minLevel) {
      return;
    }

    const entry: LogEntry = {
      id: this.generateLogId(),
      timestamp: Date.now(),
      level,
      type,
      message,
      data,
      source: source || this.config.defaultSource,
      userId: this.config.defaultUserId,
      sessionId: this.config.defaultSessionId,
      tags
    };

    // 输出到所有输出器
    this.appenders.forEach(appender => {
      try {
        appender.append(entry);
      } catch (error) {
        console.error(`日志输出器 ${appender.name} 执行失败:`, error);
      }
    });
  }

  /**
   * DEBUG 级别日志
   */
  public debug(
    message: string,
    data?: Record<string, unknown>,
    source?: string,
    tags?: string[]
  ): void {
    this.log(LogLevel.DEBUG, LogType.SYSTEM, message, data, source, tags);
  }

  /**
   * INFO 级别日志
   */
  public info(
    message: string,
    data?: Record<string, unknown>,
    source?: string,
    tags?: string[]
  ): void {
    this.log(LogLevel.INFO, LogType.SYSTEM, message, data, source, tags);
  }

  /**
   * WARN 级别日志
   */
  public warn(
    message: string,
    data?: Record<string, unknown>,
    source?: string,
    tags?: string[]
  ): void {
    this.log(LogLevel.WARN, LogType.SYSTEM, message, data, source, tags);
  }

  /**
   * ERROR 级别日志
   */
  public error(
    message: string,
    data?: Record<string, unknown>,
    source?: string,
    tags?: string[]
  ): void {
    this.log(LogLevel.ERROR, LogType.SYSTEM, message, data, source, tags);
  }

  /**
   * FATAL 级别日志
   */
  public fatal(
    message: string,
    data?: Record<string, unknown>,
    source?: string,
    tags?: string[]
  ): void {
    this.log(LogLevel.FATAL, LogType.SYSTEM, message, data, source, tags);
  }

  /**
   * 用户行为日志
   */
  public userAction(
    action: string,
    data?: Record<string, unknown>,
    source?: string
  ): void {
    this.log(LogLevel.INFO, LogType.USER_ACTION, `用户操作: ${action}`, data, source, ['user-action']);
  }

  /**
   * 性能日志
   */
  public performance(
    operation: string,
    duration: number,
    data?: Record<string, unknown>,
    source?: string
  ): void {
    this.log(
      LogLevel.INFO,
      LogType.PERFORMANCE,
      `性能监控: ${operation} 耗时 ${duration}ms`,
      { duration, ...data },
      source,
      ['performance']
    );
  }

  /**
   * 业务日志
   */
  public business(
    event: string,
    data?: Record<string, unknown>,
    source?: string
  ): void {
    this.log(LogLevel.INFO, LogType.BUSINESS, `业务事件: ${event}`, data, source, ['business']);
  }

  /**
   * 安全日志
   */
  public security(
    event: string,
    data?: Record<string, unknown>,
    source?: string
  ): void {
    this.log(LogLevel.WARN, LogType.SECURITY, `安全事件: ${event}`, data, source, ['security']);
  }

  /**
   * 添加输出器
   */
  public addAppender(appender: LogAppender): void {
    this.appenders.push(appender);
  }

  /**
   * 移除输出器
   */
  public removeAppender(appenderName: string): void {
    this.appenders = this.appenders.filter(appender => appender.name !== appenderName);
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 设置用户ID
   */
  public setUserId(userId: string): void {
    this.config.defaultUserId = userId;
  }

  /**
   * 获取会话ID
   */
  public getSessionId(): string {
    return this.config.defaultSessionId;
  }

  /**
   * 创建子日志器
   */
  public createChild(source: string): ChildLogger {
    return new ChildLogger(this, source);
  }
}

/**
 * 子日志器类
 */
export class ChildLogger {
  constructor(
    private parent: Logger,
    private source: string
  ) {}

  debug(message: string, data?: Record<string, unknown>, tags?: string[]): void {
    this.parent.debug(message, data, this.source, tags);
  }

  info(message: string, data?: Record<string, unknown>, tags?: string[]): void {
    this.parent.info(message, data, this.source, tags);
  }

  warn(message: string, data?: Record<string, unknown>, tags?: string[]): void {
    this.parent.warn(message, data, this.source, tags);
  }

  error(message: string, data?: Record<string, unknown>, tags?: string[]): void {
    this.parent.error(message, data, this.source, tags);
  }

  fatal(message: string, data?: Record<string, unknown>, tags?: string[]): void {
    this.parent.fatal(message, data, this.source, tags);
  }

  userAction(action: string, data?: Record<string, unknown>): void {
    this.parent.userAction(action, data, this.source);
  }

  performance(operation: string, duration: number, data?: Record<string, unknown>): void {
    this.parent.performance(operation, duration, data, this.source);
  }

  business(event: string, data?: Record<string, unknown>): void {
    this.parent.business(event, data, this.source);
  }

  security(event: string, data?: Record<string, unknown>): void {
    this.parent.security(event, data, this.source);
  }
}

// 导出默认实例
export const logger = Logger.getInstance();

// 便捷函数
export const createLogger = (source: string) => logger.createChild(source);

// 性能监控装饰器
export function logPerformance(operation?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const operationName = operation || `${target.constructor.name}.${propertyName}`;

    descriptor.value = function (...args: any[]) {
      const startTime = performance.now();
      const result = method.apply(this, args);

      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - startTime;
          logger.performance(operationName, duration);
        });
      } else {
        const duration = performance.now() - startTime;
        logger.performance(operationName, duration);
        return result;
      }
    };

    return descriptor;
  };
}
