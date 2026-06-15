import React, { useCallback, useRef, useState } from 'react';
import { A11yContext } from './A11yAnnouncerContext';

/**
 * A11yAnnouncer — Screen Reader 公告组件
 *
 * 使用 ARIA live region 向 Screen Reader 推送操作反馈。
 * 替代 message.success/info 等视觉 toasts 为听觉反馈。
 *
 * 用法：
 * 1. 在 App 层包装 <A11yAnnouncerProvider>
 * 2. 在任意组件中 const { announce } = useA11yAnnounce();
 * 3. announce('已复制 3 个节点');
 */

export const A11yAnnouncerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [politeMessage, setPoliteMessage] = useState('');
    const [assertiveMessage, setAssertiveMessage] = useState('');
    const clearTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
        // 先清空再设值，确保相同消息也能触发 SR 朗读
        if (priority === 'assertive') {
            setAssertiveMessage('');
            requestAnimationFrame(() => setAssertiveMessage(message));
        } else {
            setPoliteMessage('');
            requestAnimationFrame(() => setPoliteMessage(message));
        }

        // 3 秒后清空
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
        clearTimerRef.current = setTimeout(() => {
            setPoliteMessage('');
            setAssertiveMessage('');
        }, 3000);
    }, []);

    return (
        <A11yContext.Provider value={{ announce }}>
            {children}
            {/* ARIA Live Regions — 视觉隐藏，仅 Screen Reader 可见 */}
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                }}
            >
                {politeMessage}
            </div>
            <div
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                }}
            >
                {assertiveMessage}
            </div>
        </A11yContext.Provider>
    );
};
