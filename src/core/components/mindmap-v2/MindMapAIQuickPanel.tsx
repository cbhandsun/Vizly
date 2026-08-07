import React, { useId } from "react";
import { Input } from "antd";
import {
  BulbOutlined,
  FileTextOutlined,
  LoadingOutlined,
  PlusOutlined,
  SettingOutlined,
} from "@ant-design/icons";

import { isMindMapAIConfigurationError } from "./mindMapAIErrorPresentation";
import styles from "./FloatingBar.module.css";

interface MindMapAIQuickPanelProps {
  error: string;
  expanding: boolean;
  suggestions: string[];
  hasChildren: boolean;
  summarizing: boolean;
  customPrompt: string;
  customLoading: boolean;
  onApplySuggestion: (topic: string) => void;
  onSummarize: () => void;
  onCustomPromptChange: (value: string) => void;
  onCustomSubmit: () => void;
  onOpenConfig: () => void;
}

export const MindMapAIQuickPanel: React.FC<MindMapAIQuickPanelProps> = ({
  error,
  expanding,
  suggestions,
  hasChildren,
  summarizing,
  customPrompt,
  customLoading,
  onApplySuggestion,
  onSummarize,
  onCustomPromptChange,
  onCustomSubmit,
  onOpenConfig,
}) => {
  const titleId = useId();
  const promptLabelId = useId();
  const isConfigurationError = isMindMapAIConfigurationError(error);
  const trimmedPrompt = customPrompt.trim();

  return (
    <div
      className={styles.aiPopover}
      role="dialog"
      aria-labelledby={titleId}
      aria-busy={expanding || summarizing || customLoading}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.aiHeader}>
        <strong id={titleId}>
          <BulbOutlined aria-hidden="true" /> AI 节点助手
        </strong>
        {expanding && (
          <span>
            <LoadingOutlined aria-hidden="true" /> 生成中
          </span>
        )}
      </div>

      {error && (
        <div className={styles.aiError} role="alert">
          <span>{error}</span>
          {isConfigurationError && (
            <button
              type="button"
              className={styles.aiErrorAction}
              onClick={onOpenConfig}
            >
              <SettingOutlined aria-hidden="true" /> 打开 AI 配置
            </button>
          )}
        </div>
      )}

      {!expanding && suggestions.length === 0 && !error && (
        <div className={styles.aiEmpty}>暂无建议，可在下方输入自定义指令。</div>
      )}

      {suggestions.map((suggestion) => (
        <button
          type="button"
          key={suggestion}
          onClick={() => onApplySuggestion(suggestion)}
          className={styles.aiSuggestion}
        >
          <PlusOutlined aria-hidden="true" />
          <span>{suggestion}</span>
        </button>
      ))}

      {hasChildren && (
        <div className={styles.aiSummarizeSection}>
          <button
            type="button"
            className={styles.aiSummarizeBtn}
            onClick={onSummarize}
            disabled={summarizing}
          >
            {summarizing ? (
              <LoadingOutlined aria-hidden="true" />
            ) : (
              <FileTextOutlined aria-hidden="true" />
            )}
            AI 智能归纳当前节点
          </button>
        </div>
      )}

      <div className={styles.aiPromptSection}>
        <label id={promptLabelId} htmlFor={`${promptLabelId}-input`}>
          自定义 AI 指令
        </label>
        <div className={styles.aiPromptControls}>
          <Input
            id={`${promptLabelId}-input`}
            aria-labelledby={promptLabelId}
            placeholder="如：翻译成英文、补充详细备注"
            value={customPrompt}
            maxLength={500}
            onChange={(event) => onCustomPromptChange(event.target.value)}
            onPressEnter={() => {
              if (trimmedPrompt && !customLoading) onCustomSubmit();
            }}
            disabled={customLoading}
            className={styles.aiPromptInput}
            allowClear
          />
          <button
            type="button"
            className={styles.aiPromptRun}
            onClick={onCustomSubmit}
            disabled={!trimmedPrompt || customLoading}
            aria-label="运行自定义 AI 指令"
          >
            {customLoading ? <LoadingOutlined aria-hidden="true" /> : "运行"}
          </button>
        </div>
        <span className={styles.aiPromptHint}>
          {trimmedPrompt ? `${trimmedPrompt.length}/500` : "输入内容后运行"}
        </span>
      </div>
    </div>
  );
};
