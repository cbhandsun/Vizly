/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 性能监控和错误追踪工具
 * 提供应用性能监控、错误收集和分析功能
 */

import { safeLog } from './consoleCleanup';

// 性能日志记录函数
const perfLog = {
  time: (label: string) => console.time(label),
  timeEnd: (label: string) => console.timeEnd(label),
  measure: (name: string, startMark?: string, endMark?: string) => {
    try {
      if (startMark && endMark) {
        performance.measure(name, startMark, endMark);
      }
      safeLog.info(`Performance: ${name}`);
    } catch (error) {
      console.warn(`Failed to measure ${name}:`, error);
    }
  },
  log: (...args: any[]) => console.log(...args),
};

// 性能指标接口
interface PerformanceMetrics {
  // 页面加载性能
  pageLoadTime?: number;
  domContentLoadedTime?: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  firstInputDelay?: number;
  cumulativeLayoutShift?: number;

  // 组件渲染性能
  componentRenderTime?: number;
  componentMountTime?: number;

  // 内存使用情况
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };

  // 网络性能
  networkLatency?: number;
  resourceLoadTime?: number;

  // 用户交互性能
  interactionLatency?: number;
  scrollPerformance?: number;
}

// 错误信息接口
interface ErrorReport {
  id: string;
  timestamp: number;
  type: 'javascript' | 'promise' | 'resource' | 'network' | 'custom';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  additionalData?: Record<string, any>;
}

// 性能报告接口
interface PerformanceReport {
  id: string;
  timestamp: number;
  metrics: PerformanceMetrics;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
}

/**
 * 性能监控器类
 */
class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private sessionId: string;
  private userId?: string;
  private isEnabled: boolean = true;
  private errorQueue: ErrorReport[] = [];
  private performanceQueue: PerformanceReport[] = [];
  private maxQueueSize: number = 100;

  private constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeMonitoring();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 初始化监控
   */
  private initializeMonitoring(): void {
    if (!this.isEnabled) return;
    if (typeof window === 'undefined' || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test')) {
      return;
    }

    // 监听JavaScript错误
    window.addEventListener('error', this.handleJavaScriptError.bind(this));

    // 监听Promise拒绝
    window.addEventListener('unhandledrejection', this.handlePromiseRejection.bind(this));

    // 监听资源加载错误
    window.addEventListener('error', this.handleResourceError.bind(this), true);

    // 页面加载完成后收集性能指标
    if (document.readyState === 'complete') {
      this.collectPagePerformanceMetrics();
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => this.collectPagePerformanceMetrics(), 1000);
      });
    }

    // 定期收集性能指标
    setInterval(() => {
      this.collectRuntimePerformanceMetrics();
    }, 30000); // 每30秒收集一次

    // 页面卸载时发送剩余数据
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  /**
   * 处理JavaScript错误
   */
  private handleJavaScriptError(event: ErrorEvent): void {
    const errorReport: ErrorReport = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'javascript',
      message: event.message,
      stack: event.error?.stack,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.addErrorReport(errorReport);
  }

  /**
   * 处理Promise拒绝
   */
  private handlePromiseRejection(event: PromiseRejectionEvent): void {
    const errorReport: ErrorReport = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'promise',
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.addErrorReport(errorReport);
  }

  /**
   * 处理资源加载错误
   */
  private handleResourceError(event: Event): void {
    const target = event.target as HTMLElement;
    if (target && target !== (window as any)) {
      const errorReport: ErrorReport = {
        id: this.generateErrorId(),
        timestamp: Date.now(),
        type: 'resource',
        message: `Resource load failed: ${(target as any).src || (target as any).href}`,
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: this.userId,
        sessionId: this.sessionId,
        additionalData: {
          tagName: target.tagName,
          src: (target as any).src,
          href: (target as any).href
        }
      };

      this.addErrorReport(errorReport);
    }
  }

  /**
   * 收集页面性能指标
   */
  private collectPagePerformanceMetrics(): void {
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');

      const metrics: PerformanceMetrics = {
        pageLoadTime: navigation.loadEventEnd - navigation.fetchStart,
        domContentLoadedTime: navigation.domContentLoadedEventEnd - navigation.fetchStart,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
        networkLatency: navigation.responseStart - navigation.requestStart
      };

      // 收集LCP和FID（如果支持）
      if ('PerformanceObserver' in window) {
        this.observeWebVitals(metrics);
      }

      this.addPerformanceReport(metrics);
    } catch (error) {
      safeLog.error('Failed to collect page performance metrics:', error);
    }
  }

  /**
   * 观察Web Vitals指标
   */
  private observeWebVitals(metrics: PerformanceMetrics): void {
    try {
      // LCP观察器
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        metrics.largestContentfulPaint = lastEntry.startTime;
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // FID观察器
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          metrics.firstInputDelay = entry.processingStart - entry.startTime;
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // CLS观察器
      const clsObserver = new PerformanceObserver((list) => {
        let clsValue = 0;
        list.getEntries().forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        });
        metrics.cumulativeLayoutShift = clsValue;
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      safeLog.error('Failed to observe web vitals:', error);
    }
  }

  /**
   * 收集运行时性能指标
   */
  private collectRuntimePerformanceMetrics(): void {
    try {
      const metrics: PerformanceMetrics = {};

      // 内存使用情况
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        metrics.memoryUsage = {
          usedJSHeapSize: memory.usedJSHeapSize,
          totalJSHeapSize: memory.totalJSHeapSize,
          jsHeapSizeLimit: memory.jsHeapSizeLimit
        };
      }

      this.addPerformanceReport(metrics);
    } catch (error) {
      safeLog.error('Failed to collect runtime performance metrics:', error);
    }
  }

  /**
   * 记录组件渲染性能
   */
  public recordComponentRender(componentName: string, renderTime: number): void {
    if (!this.isEnabled) return;

    const metrics: PerformanceMetrics = {
      componentRenderTime: renderTime
    };

    perfLog.measure(`Component ${componentName} render time: ${renderTime}ms`);
    this.addPerformanceReport(metrics, { componentName });
  }

  /**
   * 记录用户交互性能
   */
  public recordInteraction(interactionType: string, latency: number): void {
    if (!this.isEnabled) return;

    const metrics: PerformanceMetrics = {
      interactionLatency: latency
    };

    this.addPerformanceReport(metrics, { interactionType });
  }

  /**
   * 记录自定义错误
   */
  public recordError(error: Error, additionalData?: Record<string, any>): void {
    const errorReport: ErrorReport = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      type: 'custom',
      message: error.message,
      stack: error.stack,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.userId,
      sessionId: this.sessionId,
      additionalData
    };

    this.addErrorReport(errorReport);
  }

  /**
   * 添加错误报告
   */
  private addErrorReport(errorReport: ErrorReport): void {
    this.errorQueue.push(errorReport);

    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift();
    }

    // 立即发送严重错误
    if (this.isCriticalError(errorReport)) {
      this.sendErrorReport(errorReport);
    }
  }

  /**
   * 添加性能报告
   */
  private addPerformanceReport(metrics: PerformanceMetrics, additionalData?: Record<string, any>): void {
    const report: PerformanceReport = {
      id: this.generateReportId(),
      timestamp: Date.now(),
      metrics,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.userId,
      sessionId: this.sessionId,
      ...additionalData
    };

    this.performanceQueue.push(report);

    if (this.performanceQueue.length > this.maxQueueSize) {
      this.performanceQueue.shift();
    }
  }

  /**
   * 判断是否为严重错误
   */
  private isCriticalError(errorReport: ErrorReport): boolean {
    const criticalKeywords = ['chunk', 'network', 'timeout', 'cors'];
    return criticalKeywords.some(keyword =>
      errorReport.message.toLowerCase().includes(keyword)
    );
  }

  /**
   * 发送错误报告
   */
  private async sendErrorReport(errorReport: ErrorReport): Promise<void> {
    try {
      // 这里可以集成实际的错误报告服务，如Sentry、LogRocket等
      if (process.env.NODE_ENV === 'development') {
        console.error('Error Report:', errorReport);
      }

      // 示例：发送到后端API
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });
    } catch (error) {
      safeLog.error('Failed to send error report:', error);
    }
  }

  /**
   * 发送性能报告
   */
  private async sendPerformanceReport(report: PerformanceReport): Promise<void> {
    try {
      if (process.env.NODE_ENV === 'development') {
        perfLog.log('Performance Report:', report);
      }

      // 示例：发送到后端API
      // await fetch('/api/performance', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(report)
      // });
    } catch (error) {
      safeLog.error('Failed to send performance report:', error);
    }
  }

  /**
   * 刷新队列，发送所有待发送的数据
   */
  public flush(): void {
    // 发送所有错误报告
    this.errorQueue.forEach(errorReport => {
      this.sendErrorReport(errorReport);
    });

    // 发送所有性能报告
    this.performanceQueue.forEach(report => {
      this.sendPerformanceReport(report);
    });

    // 清空队列
    this.errorQueue = [];
    this.performanceQueue = [];
  }

  /**
   * 设置用户ID
   */
  public setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * 启用/禁用监控
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * 获取性能摘要
   */
  public getPerformanceSummary(): {
    errorCount: number;
    performanceReportCount: number;
    sessionId: string;
    userId?: string;
  } {
    return {
      errorCount: this.errorQueue.length,
      performanceReportCount: this.performanceQueue.length,
      sessionId: this.sessionId,
      userId: this.userId
    };
  }

  /**
   * 生成错误ID
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成报告ID
   */
  private generateReportId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 导出单例实例
export const performanceMonitor = PerformanceMonitor.getInstance();

// 导出类型
export type { PerformanceMetrics, ErrorReport, PerformanceReport };

// 便捷函数
export const recordError = (error: Error, additionalData?: Record<string, any>) => {
  performanceMonitor.recordError(error, additionalData);
};

export const recordComponentRender = (componentName: string, renderTime: number) => {
  performanceMonitor.recordComponentRender(componentName, renderTime);
};

export const recordInteraction = (interactionType: string, latency: number) => {
  performanceMonitor.recordInteraction(interactionType, latency);
};

export const setUserId = (userId: string) => {
  performanceMonitor.setUserId(userId);
};

export const getPerformanceSummary = () => {
  return performanceMonitor.getPerformanceSummary();
};
