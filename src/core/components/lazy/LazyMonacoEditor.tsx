/**
 * 可靠的 JSON 文本编辑器。
 *
 * 保留原组件名以兼容现有入口，但不再依赖远程 Monaco 运行时；
 * JSON 的格式化、校验、下载和保存仍由上层操作提供。
 */

import { useEffect } from 'react';
import type { EditorProps } from '@monaco-editor/react';
import { useTranslation } from 'react-i18next';

export type LazyMonacoEditorMode = 'loading' | 'basic';

export interface LazyMonacoEditorProps {
    value?: string;
    onChange?: (value: string | undefined) => void;
    options?: EditorProps['options'];
    language?: string;
    onModeChange?: (mode: LazyMonacoEditorMode) => void;
}

export const LazyMonacoEditor: React.FC<LazyMonacoEditorProps> = ({
    value,
    onChange,
    options,
    onModeChange,
}) => {
    const { t } = useTranslation();

    useEffect(() => {
        onModeChange?.('basic');
    }, [onModeChange]);

    return (
        <textarea
            aria-label={t('designer.jsonEditor.basicEditorLabel', { defaultValue: 'JSON 基础编辑器' })}
            value={value ?? ''}
            onChange={event => onChange?.(event.target.value)}
            readOnly={options?.readOnly === true}
            spellCheck={false}
            wrap="off"
            style={{
                width: '100%',
                height: '100%',
                minHeight: 240,
                resize: 'none',
                border: 0,
                outline: 0,
                padding: 12,
                color: 'var(--ant-color-text, #1f2328)',
                background: 'var(--ant-color-bg-container, #fff)',
                font: '13px/1.55 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
                tabSize: 2,
            }}
        />
    );
};

export default LazyMonacoEditor;
