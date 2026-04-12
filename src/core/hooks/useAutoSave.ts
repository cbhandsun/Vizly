/**
 * useAutoSave Hook
 * 自动保存状态管理Hook，提供保存状态追踪
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface AutoSaveState {
    saving: boolean;
    lastSaved: number | null;
    error: string | null;
}

export interface UseAutoSaveOptions {
    /** 自动保存延迟时间（毫秒） */
    delay?: number;
    /** 保存函数 */
    onSave?: () => Promise<void> | void;
    /** 是否启用自动保存 */
    enabled?: boolean;
}

export interface UseAutoSaveReturn {
    /** 当前保存状态 */
    saveState: AutoSaveState;
    /** 手动触发保存 */
    save: () => Promise<void>;
    /** 重置保存状态 */
    reset: () => void;
    /** 标记为已保存 */
    markAsSaved: () => void;
    /** 标记为需要保存 */
    markAsDirty: () => void;
}

/**
 * 自动保存Hook
 */
export const useAutoSave = (options: UseAutoSaveOptions = {}): UseAutoSaveReturn => {
    const { delay = 1000, onSave, enabled = true } = options;

    const [saveState, setSaveState] = useState<AutoSaveState>({
        saving: false,
        lastSaved: null,
        error: null
    });

    const [isDirty, setIsDirty] = useState(false);
    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * 执行保存操作
     */
    const save = useCallback(async () => {
        if (!onSave) return;

        setSaveState(prev => ({ ...prev, saving: true, error: null }));

        try {
            await onSave();
            setSaveState({
                saving: false,
                lastSaved: Date.now(),
                error: null
            });
            setIsDirty(false);
        } catch (error) {
            setSaveState({
                saving: false,
                lastSaved: null,
                error: error instanceof Error ? error.message : '保存失败'
            });
        }
    }, [onSave]);

    /**
     * 重置保存状态
     */
    const reset = useCallback(() => {
        setSaveState({
            saving: false,
            lastSaved: null,
            error: null
        });
        setIsDirty(false);
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
    }, []);

    /**
     * 标记为已保存
     */
    const markAsSaved = useCallback(() => {
        setSaveState(prev => ({
            ...prev,
            lastSaved: Date.now(),
            error: null
        }));
        setIsDirty(false);
    }, []);

    /**
     * 标记为需要保存（触发自动保存）
     */
    const markAsDirty = useCallback(() => {
        setIsDirty(true);
    }, []);

    /**
     * 自动保存逻辑
     */
    useEffect(() => {
        if (!enabled || !isDirty || !onSave) {
            return;
        }

        // 清除之前的定时器
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        // 设置新的定时器
        saveTimerRef.current = setTimeout(() => {
            save();
        }, delay);

        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        };
    }, [enabled, isDirty, delay, save, onSave]);

    return {
        saveState,
        save,
        reset,
        markAsSaved,
        markAsDirty
    };
};
