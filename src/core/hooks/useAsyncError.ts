/**
 * 异步错误处理Hook
 * 优雅地处理async/await错误
 */

import { useState, useCallback } from 'react';
import { errorLogger } from '../utils/errorLogger';
import { errorNotification } from '../utils/errorNotification';

export interface UseAsyncErrorOptions {
    onError?: (error: Error) => void;
    showNotification?: boolean;
    logError?: boolean;
    source?: string;
}

export interface UseAsyncErrorReturn<T> {
    error: Error | null;
    loading: boolean;
    data: T | null;
    execute: (asyncFn: () => Promise<T>) => Promise<T | null>;
    reset: () => void;
}

/**
 * 异步错误处理Hook
 */
export function useAsyncError<T = unknown>(
    options: UseAsyncErrorOptions = {}
): UseAsyncErrorReturn<T> {
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<T | null>(null);

    const {
        onError,
        showNotification = true,
        logError: shouldLogError = true,
        source,
    } = options;

    const execute = useCallback(
        async (asyncFn: () => Promise<T>): Promise<T | null> => {
            try {
                setLoading(true);
                setError(null);

                const result = await asyncFn();
                setData(result);
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setError(error);

                // 记录错误日志
                if (shouldLogError) {
                    errorLogger.log(error, { level: 'error', source });
                }

                // 显示通知
                if (showNotification) {
                    errorNotification.toast(error.message);
                }

                // 调用自定义错误处理
                if (onError) {
                    onError(error);
                }

                return null;
            } finally {
                setLoading(false);
            }
        },
        [onError, showNotification, shouldLogError, source]
    );

    const reset = useCallback(() => {
        setError(null);
        setLoading(false);
        setData(null);
    }, []);

    return { error, loading, data, execute, reset };
}

/**
 * 安全的状态更新Hook
 * 防止组件卸载后的状态更新导致的内存泄漏
 */
export function useSafeState<T>(initialState: T): [T, (value: T | ((prev: T) => T)) => void] {
    const [state, setState] = useState<T>(initialState);
    const isMountedRef = useCallback(() => {
        let mounted = true;
        return {
            get: () => mounted,
            set: (value: boolean) => { mounted = value; }
        };
    }, []);

    const mountedState = isMountedRef();

    const safeSetState = useCallback((value: T | ((prev: T) => T)) => {
        if (mountedState.get()) {
            setState(value);
        }
    }, [mountedState]);

    useCallback(() => {
        return () => {
            mountedState.set(false);
        };
    }, [mountedState]);

    return [state, safeSetState];
}

/**
 * Promise错误处理辅助函数
 */
export async function handleAsync<T>(
    promise: Promise<T>,
    options: {
        errorMessage?: string;
        source?: string;
    } = {}
): Promise<[T | null, Error | null]> {
    try {
        const data = await promise;
        return [data, null];
    } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        // 记录错误
        errorLogger.log(error, { level: 'error', source: options.source });

        // 显示错误消息
        if (options.errorMessage) {
            errorNotification.toast(options.errorMessage);
        }

        return [null, error];
    }
}

/**
 * 重试辅助函数
 */
export async function retryAsync<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        delay?: number;
        onRetry?: (attempt: number) => void;
    } = {}
): Promise<T> {
    const { maxRetries = 3, delay = 1000, onRetry } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));

            if (attempt < maxRetries) {
                if (onRetry) {
                    onRetry(attempt);
                }

                // 指数退避
                const waitTime = delay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw lastError!;
}
