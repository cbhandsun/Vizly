/**
 * 增强的错误边界组件
 * 提供优雅的错误处理和恢复机制
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { safeLog } from '../../utils/consoleCleanup';
import './ErrorBoundary.css';

// 错误信息接口
interface ErrorDetails {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  userAgent: string;
  url: string;
  userId?: string;
}

// 错误边界状态接口
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

// 错误边界属性接口
export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, errorInfo: ErrorInfo, retry: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo, errorDetails: ErrorDetails) => void;
  maxRetries?: number;
  enableReporting?: boolean;
  level?: 'page' | 'component' | 'feature';
}

/**
 * 生成错误ID
 */
const generateErrorId = (): string => {
  return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 收集错误详细信息
 */
const collectErrorDetails = (error: Error, errorInfo: ErrorInfo): ErrorDetails => {
  return {
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack || undefined,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    // 可以从用户上下文中获取用户ID
    userId: undefined
  };
};

/**
 * 默认错误回退UI
 */
const DefaultErrorFallback: React.FC<{
  error: Error;
  errorInfo: ErrorInfo;
  retry: () => void;
  level: string;
}> = ({ error, errorInfo, retry, level }) => {
  const isPageLevel = level === 'page';
  
  return (
    <div 
      className={`error-boundary ${isPageLevel ? 'error-boundary--page' : 'error-boundary--component'}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="error-boundary__container">
        <div className="error-boundary__icon">
          {isPageLevel ? '💥' : '⚠️'}
        </div>
        
        <div className="error-boundary__content">
          <h2 className="error-boundary__title">
            {isPageLevel ? '页面出现错误' : '组件加载失败'}
          </h2>
          
          <p className="error-boundary__message">
            {isPageLevel 
              ? '抱歉，页面遇到了意外错误。请尝试刷新页面或联系技术支持。'
              : '该功能模块暂时无法使用，但不会影响其他功能的正常使用。'
            }
          </p>
          
          {process.env.NODE_ENV === 'development' && (
            <details className="error-boundary__details">
              <summary>错误详情（开发模式）</summary>
              <pre className="error-boundary__stack">
                <strong>错误信息:</strong> {error.message}
                {error.stack && (
                  <>
                    <br /><br />
                    <strong>错误堆栈:</strong>
                    <br />{error.stack}
                  </>
                )}
                {errorInfo.componentStack && (
                  <>
                    <br /><br />
                    <strong>组件堆栈:</strong>
                    <br />{errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
          
          <div className="error-boundary__actions">
            <button 
              className="error-boundary__button error-boundary__button--primary"
              onClick={retry}
              type="button"
            >
              重试
            </button>
            
            {isPageLevel && (
              <button 
                className="error-boundary__button error-boundary__button--secondary"
                onClick={() => window.location.reload()}
                type="button"
              >
                刷新页面
              </button>
            )}
          </div>
        </div>
      </div>
      
      <style>{`
        .error-boundary {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          padding: 2rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          margin: 1rem;
        }
        
        .error-boundary--page {
          min-height: 50vh;
          background: linear-gradient(135deg, #fef2f2 0%, #fdf2f8 100%);
        }
        
        .error-boundary__container {
          text-align: center;
          max-width: 600px;
        }
        
        .error-boundary__icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        
        .error-boundary__title {
          color: #dc2626;
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }
        
        .error-boundary__message {
          color: #7f1d1d;
          font-size: 1rem;
          line-height: 1.6;
          margin-bottom: 2rem;
        }
        
        .error-boundary__details {
          text-align: left;
          margin-bottom: 2rem;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 1rem;
        }
        
        .error-boundary__details summary {
          cursor: pointer;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }
        
        .error-boundary__stack {
          font-size: 0.875rem;
          color: #6b7280;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .error-boundary__actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        
        .error-boundary__button {
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }
        
        .error-boundary__button--primary {
          background: #dc2626;
          color: white;
        }
        
        .error-boundary__button--primary:hover {
          background: #b91c1c;
        }
        
        .error-boundary__button--secondary {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }
        
        .error-boundary__button--secondary:hover {
          background: #e5e7eb;
        }
      `}</style>
    </div>
  );
};

/**
 * 增强的错误边界组件
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: generateErrorId()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorDetails = collectErrorDetails(error, errorInfo);
    
    this.setState({
      errorInfo
    });

    // 记录错误日志
    safeLog.error('ErrorBoundary caught an error:', {
      error,
      errorInfo,
      errorDetails,
      errorId: this.state.errorId
    });

    // 调用自定义错误处理器
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo, errorDetails);
      } catch (handlerError) {
        safeLog.error('Error in onError handler:', handlerError);
      }
    }

    // 错误上报（如果启用）
    if (this.props.enableReporting) {
      this.reportError(errorDetails);
    }
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  /**
   * 上报错误到监控系统
   */
  private reportError = async (errorDetails: ErrorDetails) => {
    try {
      // 这里可以集成错误监控服务，如 Sentry、LogRocket 等
      // await errorReportingService.report(errorDetails);
      safeLog.info('Error reported:', errorDetails);
    } catch (reportError) {
      safeLog.error('Failed to report error:', reportError);
    }
  };

  /**
   * 重试机制
   */
  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      safeLog.warn('Max retry attempts reached');
      return;
    }

    safeLog.info(`Retrying... Attempt ${retryCount + 1}/${maxRetries}`);

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: retryCount + 1
    });

    // 延迟重试，避免立即失败
    this.retryTimeoutId = setTimeout(() => {
      // 强制重新渲染
      this.forceUpdate();
    }, 100);
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, level = 'component' } = this.props;

    if (hasError && error && errorInfo) {
      // 使用自定义回退UI或默认UI
      if (fallback) {
        return fallback(error, errorInfo, this.handleRetry);
      }

      return (
        <DefaultErrorFallback
          error={error}
          errorInfo={errorInfo}
          retry={this.handleRetry}
          level={level}
        />
      );
    }

    return children;
  }
}

export default ErrorBoundary;
