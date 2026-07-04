/**
 * 统一错误处理系统
 */

import { safeLog } from './consoleCleanup';
import { normalizeRemoteLogEndpoint, redactSensitiveLogValue } from './logSecurity';

// 错误类型枚举
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  EXPORT = 'EXPORT',
  LAYOUT = 'LAYOUT',
  RENDER = 'RENDER',
  CONFIG = 'CONFIG',
  UNKNOWN = 'UNKNOWN'
}

// 错误严重级别
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 错误上下文接口
export interface ErrorContext {
  /** 组件名称 */
  component?: string;
  /** 用户操作 */
  action?: string;
  /** 相关数据 */
  data?: Record<string, unknown>;
  /** 时间戳 */
  timestamp?: number;
  /** 用户ID */
  userId?: string;
  /** 会话ID */
  sessionId?: string;
}

/**
 * 自定义图表错误类
 */
export class DiagramError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly code: string;
  public readonly timestamp: number;

  /**
   * 构造函数
   * 先初始化时间戳，再生成错误码，避免对 undefined 调用 toString。
   */
  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    code?: string
  ) {
    super(message);
    this.name = 'DiagramError';
    this.type = type;
    this.severity = severity;
    this.timestamp = Date.now();
    this.context = {
      timestamp: this.timestamp,
      ...context
    };
    this.code = code || this.generateErrorCode();

    // 确保错误堆栈正确
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DiagramError);
    }
  }

  /**
   * 生成错误代码
   */
  /**
   * 生成错误代码
   * 使用已初始化的时间戳，若缺失则回退至当前时间。
   */
  private generateErrorCode(): string {
    const typePrefix = this.type.substring(0, 3);
    const severityPrefix = this.severity.substring(0, 1).toUpperCase();
    const ts = this.timestamp ?? Date.now();
    const timestamp = ts.toString().slice(-6);
    return `${typePrefix}${severityPrefix}${timestamp}`;
  }

  /**
   * 转换为JSON格式
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserMessage(): string {
    switch (this.type) {
      case ErrorType.EXPORT:
        return '导出功能暂时不可用，请稍后重试';
      case ErrorType.LAYOUT:
        return '图表布局出现问题，正在尝试修复';
      case ErrorType.NETWORK:
        return '网络连接异常，请检查网络设置';
      case ErrorType.VALIDATION:
        return '输入数据格式不正确，请检查后重试';
      case ErrorType.CONFIG:
        return '配置加载失败，将使用默认设置';
      case ErrorType.RENDER:
        return '图表渲染出现问题，正在重新加载';
      default:
        return '操作失败，请稍后重试';
    }
  }
}

/**
 * 错误处理器配置
 */
export interface ErrorHandlerConfig {
  /** 是否启用控制台日志 */
  enableConsoleLog?: boolean;
  /** 是否启用远程日志 */
  enableRemoteLog?: boolean;
  /** 远程日志端点 */
  remoteLogEndpoint?: string;
  /** 是否显示用户通知 */
  showUserNotification?: boolean;
  /** 最大错误缓存数量 */
  maxErrorCache?: number;
  /** 是否启用错误恢复 */
  enableErrorRecovery?: boolean;
}

/**
 * 错误处理器类
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private config: ErrorHandlerConfig;
  private errorCache: DiagramError[] = [];
  private errorListeners: ((error: DiagramError) => void)[] = [];

  private constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      enableConsoleLog: true,
      enableRemoteLog: false,
      showUserNotification: true,
      maxErrorCache: 100,
      enableErrorRecovery: true,
      ...config
    };
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: ErrorHandlerConfig): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler(config);
    }
    return ErrorHandler.instance;
  }

  /**
   * 处理错误
   */
  public handleError(error: Error | DiagramError, context?: ErrorContext): void {
    let diagramError: DiagramError;

    if (error instanceof DiagramError) {
      diagramError = error;
    } else {
      // 将普通错误转换为DiagramError
      diagramError = new DiagramError(
        error.message,
        this.inferErrorType(error),
        ErrorSeverity.MEDIUM,
        context
      );
    }

    // 添加到错误缓存
    this.addToCache(diagramError);

    // 控制台日志
    if (this.config.enableConsoleLog) {
      this.logToConsole(diagramError);
    }

    // 远程日志
    if (this.config.enableRemoteLog && this.config.remoteLogEndpoint) {
      this.logToRemote(diagramError);
    }

    // 用户通知
    if (this.config.showUserNotification) {
      this.showUserNotification(diagramError);
    }

    // 通知监听器
    this.notifyListeners(diagramError);

    // 错误恢复
    if (this.config.enableErrorRecovery) {
      this.attemptRecovery(diagramError);
    }
  }

  /**
   * 推断错误类型
   */
  private inferErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    
    if (message.includes('export') || message.includes('导出')) {
      return ErrorType.EXPORT;
    }
    if (message.includes('layout') || message.includes('布局')) {
      return ErrorType.LAYOUT;
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('网络')) {
      return ErrorType.NETWORK;
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('验证')) {
      return ErrorType.VALIDATION;
    }
    if (message.includes('config') || message.includes('配置')) {
      return ErrorType.CONFIG;
    }
    if (message.includes('render') || message.includes('渲染')) {
      return ErrorType.RENDER;
    }
    
    return ErrorType.UNKNOWN;
  }

  /**
   * 添加到错误缓存
   */
  private addToCache(error: DiagramError): void {
    this.errorCache.push(error);
    
    // 限制缓存大小
    if (this.errorCache.length > (this.config.maxErrorCache || 100)) {
      this.errorCache.shift();
    }
  }

  /**
   * 控制台日志
   */
  private logToConsole(error: DiagramError): void {
    const logPayload = redactSensitiveLogValue({
      message: error.message,
      severity: error.severity,
      context: error.context,
      stack: error.stack
    });

    if (error.severity === ErrorSeverity.CRITICAL) {
      safeLog.error(`[${error.code}] ${error.type}:`, logPayload);
      return;
    }

    if (error.severity === ErrorSeverity.HIGH) {
      safeLog.warn(`[${error.code}] ${error.type}:`, logPayload);
      return;
    }

    safeLog.info(`[${error.code}] ${error.type}:`, logPayload);
  }

  /**
   * 远程日志
   */
  private async logToRemote(error: DiagramError): Promise<void> {
    try {
      if (!this.config.remoteLogEndpoint) return;
      const endpoint = normalizeRemoteLogEndpoint(this.config.remoteLogEndpoint);
      if (!endpoint) {
        safeLog.warn('远程日志端点无效，已跳过发送');
        return;
      }

      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(redactSensitiveLogValue(error.toJSON()))
      });
    } catch (logError) {
      safeLog.warn('远程日志发送失败:', redactSensitiveLogValue(logError));
    }
  }

  /**
   * 显示用户通知
   */
  private showUserNotification(error: DiagramError): void {
    // 只对中等及以上严重级别显示通知
    if (error.severity === ErrorSeverity.LOW) return;

    const message = error.getUserMessage();
    
    // 这里可以集成具体的通知系统，如 toast、modal 等
    if (error.severity === ErrorSeverity.CRITICAL) {
      alert(`严重错误: ${message}`);
    } else {
      safeLog.warn('用户通知:', redactSensitiveLogValue(message));
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(error: DiagramError): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        safeLog.error('错误监听器执行失败:', redactSensitiveLogValue(listenerError));
      }
    });
  }

  /**
   * 尝试错误恢复
   */
  private attemptRecovery(error: DiagramError): void {
    switch (error.type) {
      case ErrorType.LAYOUT:
        // 尝试重新计算布局
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('diagram:recalculate-layout'));
        }, 1000);
        break;
      
      case ErrorType.RENDER:
        // 尝试重新渲染
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('diagram:force-rerender'));
        }, 500);
        break;
      
      case ErrorType.CONFIG:
        // 重置为默认配置
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('diagram:reset-config'));
        }, 100);
        break;
    }
  }

  /**
   * 添加错误监听器
   */
  public addErrorListener(listener: (error: DiagramError) => void): void {
    this.errorListeners.push(listener);
  }

  /**
   * 移除错误监听器
   */
  public removeErrorListener(listener: (error: DiagramError) => void): void {
    const index = this.errorListeners.indexOf(listener);
    if (index > -1) {
      this.errorListeners.splice(index, 1);
    }
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): Record<string, unknown> {
    const stats = {
      total: this.errorCache.length,
      byType: {} as Record<ErrorType, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      recent: this.errorCache.slice(-10)
    };

    this.errorCache.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
    });

    return stats;
  }

  /**
   * 清空错误缓存
   */
  public clearErrorCache(): void {
    this.errorCache = [];
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// 导出默认实例
export const errorHandler = ErrorHandler.getInstance();

// 便捷函数
export const handleError = (error: Error | DiagramError, context?: ErrorContext) => {
  errorHandler.handleError(error, context);
};

export const createError = (
  message: string,
  type: ErrorType = ErrorType.UNKNOWN,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM,
  context: ErrorContext = {}
) => {
  return new DiagramError(message, type, severity, context);
};
