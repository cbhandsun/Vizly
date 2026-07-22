/**
 * Console清理工具
 * 用于在生产环境中管理console输出
 */

// 环境检测
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// 日志级别枚举
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

// 生产环境日志级别配置
const PRODUCTION_LOG_LEVEL = LogLevel.ERROR;

/**
 * 安全的console.log替代方案
 * 在生产环境中根据配置决定是否输出
 */
export const safeLog = {
  debug: (...args: unknown[]) => {
    if (isDevelopment || PRODUCTION_LOG_LEVEL <= LogLevel.DEBUG) {
      console.debug(...args);
    }
  },

  info: (...args: unknown[]) => {
    if (isDevelopment || PRODUCTION_LOG_LEVEL <= LogLevel.INFO) {
      console.info(...args);
    }
  },

  warn: (...args: unknown[]) => {
    if (isDevelopment || PRODUCTION_LOG_LEVEL <= LogLevel.WARN) {
      console.warn(...args);
    }
  },

  error: (...args: unknown[]) => {
    if (isDevelopment || PRODUCTION_LOG_LEVEL <= LogLevel.ERROR) {
      console.error(...args);
    }
  },

  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  }
};

/**
 * 性能监控日志
 * 仅在开发环境中输出
 */
export const perfLog = {
  time: (label: string) => {
    if (isDevelopment) {
      console.time(label);
    }
  },

  timeEnd: (label: string) => {
    if (isDevelopment) {
      console.timeEnd(label);
    }
  },

  measure: (name: string, startMark?: string, endMark?: string) => {
    if (isDevelopment && 'performance' in window) {
      try {
        performance.measure(name, startMark, endMark);
        const measure = performance.getEntriesByName(name)[0];
        console.log(`⏱️ ${name}: ${measure.duration.toFixed(2)}ms`);
      } catch (error) {
        console.warn('Performance measurement failed:', error);
      }
    }
  }
};

/**
 * 调试工具
 * 仅在开发环境中可用
 */
export const debugUtils = {
  /**
   * 条件日志输出
   */
  logIf: (condition: boolean, ...args: unknown[]) => {
    if (isDevelopment && condition) {
      console.log(...args);
    }
  },

  /**
   * 对象深度检查
   */
  inspect: (obj: unknown, label?: string) => {
    if (isDevelopment) {
      console.group(label || 'Object Inspection');
      console.log('Type:', typeof obj);
      console.log('Value:', obj);
      if (obj && typeof obj === 'object') {
        console.log('Keys:', Object.keys(obj));
        console.log('Prototype:', Object.getPrototypeOf(obj));
      }
      console.groupEnd();
    }
  },

  /**
   * 函数执行追踪
   */
  trace: <TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult,
    context?: string,
  ): ((...args: TArgs) => TResult) => {
    if (!isDevelopment) return fn;

    return function (this: unknown, ...args: TArgs): TResult {
      console.log(`🔍 ${context || fn.name || 'Anonymous'} called with:`, args);
      const result = fn.apply(this, args);
      console.log(`✅ ${context || fn.name || 'Anonymous'} returned:`, result);
      return result;
    };
  }
};

/**
 * 清理现有的console语句
 * 在生产环境构建时使用
 */
export const cleanupConsole = () => {
  if (isProduction) {
    // 重写console方法以减少生产环境输出
    const noop = () => { };

    // 保留error和warn，但可以选择性禁用
    if (PRODUCTION_LOG_LEVEL > LogLevel.ERROR) {
      console.error = noop;
    }
    if (PRODUCTION_LOG_LEVEL > LogLevel.WARN) {
      console.warn = noop;
    }
    if (PRODUCTION_LOG_LEVEL > LogLevel.INFO) {
      console.info = noop;
    }
    if (PRODUCTION_LOG_LEVEL > LogLevel.DEBUG) {
      console.debug = noop;
    }

    // 总是禁用log
    console.log = noop;
  }
};

// 自动执行清理
cleanupConsole();

/**
 * 开发环境特定的控制台过滤器
 * 用于屏蔽某些已知的、非关键的第三方服务连接错误，以及实现 Debug 模式切换 (Ctrl+Shift+D)
 */
let isDebugMode = false;
try {
  isDebugMode = localStorage.getItem('__diagram_debug_mode__') === 'true';
} catch {
  // Ignore localStorage errors
}

export const initDevConsoleFilters = () => {
  if (process.env.NODE_ENV === 'development') {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const originalError = console.error;

    // 监听按键 Ctrl+Shift+D 切換 Debug 模式
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        isDebugMode = !isDebugMode;
        try {
          localStorage.setItem('__diagram_debug_mode__', String(isDebugMode));
        } catch {}
        
        if (isDebugMode) {
          originalLog.call(console, '🚀 [DiagramView] Debug Mode ENABLED! (Logs will show now)');
        } else {
          originalLog.call(console, '🛑 [DiagramView] Debug Mode DISABLED! (Logs are hidden)');
        }
      }
    });

    // 代理常规日志，仅在 isDebugMode 开启时输出
    console.log = (...args: unknown[]) => {
      if (isDebugMode) originalLog.apply(console, args);
    };
    console.info = (...args: unknown[]) => {
      if (isDebugMode) originalInfo.apply(console, args);
    };
    console.debug = (...args: unknown[]) => {
      if (isDebugMode) originalDebug.apply(console, args);
    };

    // 原本的特殊错误和警告过滤逻辑
    console.error = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');

      // 过滤 iepose.cn 或 localhost WebSocket 连接失败的噪音
      // 这些通常是因为使用了内网穿透工具但未正确配置 WebSocket 转发导致的
      // 过滤 iepose.cn 或 localhost WebSocket 连接失败的噪音
      // 这些通常是因为使用了内网穿透工具但未正确配置 WebSocket 转发导致的
      // 匹配模式：
      // 1. "WebSocket connection to ... failed"
      // 2. "net::ERR_CONNECTION_TIMED_OUT"
      // 3. "Global error: Event" (即使我们修复了 globalErrorHandler，保留此过滤作为双重保险)
      if (
        (msg.includes('WebSocket connection to') ||
          msg.includes('net::ERR_CONNECTION_TIMED_OUT') ||
          msg.includes('Global error: Event') ||
          msg.includes('Uncaught Event')) &&
        (msg.includes('iepose.cn') || msg.includes('token=') || msg.includes('localhost'))
      ) {
        return;
      }

      // 过滤已修复的 Monaco 加载错误残留
      if (msg.includes('cdn.jsdelivr.net/npm/monaco-editor')) {
        return;
      }

      originalError.apply(console, args);
    };

    // 同时过滤 console.warn 中的相关噪音
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (msg.includes('WebSocket connection to') && msg.includes('iepose.cn')) {
        return;
      }
      originalWarn.apply(console, args);
    };
  }
};
