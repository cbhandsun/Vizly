import React, { useEffect, useId, useRef, useState } from "react";
import { CheckOutlined, DeleteOutlined } from "@ant-design/icons";

import { cleanMindMapColor, cleanMindMapTopic } from "./mindmapTreeSanitizer";
import styles from "./FloatingBar.module.css";

export interface MindMapBoundaryValue {
  color: string;
  title: string;
}

interface MindMapBoundaryEditorProps {
  boundary?: MindMapBoundaryValue;
  onCancel: () => void;
  onRemove: () => Promise<void> | void;
  onSave: (boundary: MindMapBoundaryValue) => Promise<void> | void;
}

const BOUNDARY_COLORS = [
  { value: "#818cf8", label: "靛蓝" },
  { value: "#0ea5e9", label: "天蓝" },
  { value: "#14b8a6", label: "青绿" },
  { value: "#22c55e", label: "绿色" },
  { value: "#f59e0b", label: "琥珀" },
  { value: "#f43f5e", label: "玫红" },
] as const;

export const MindMapBoundaryEditor: React.FC<MindMapBoundaryEditorProps> = ({
  boundary,
  onCancel,
  onRemove,
  onSave,
}) => {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const initialColor = cleanMindMapColor(boundary?.color) ?? BOUNDARY_COLORS[0].value;
  const colorOptions: ReadonlyArray<{ value: string; label: string }> = BOUNDARY_COLORS.some(
    option => option.value === initialColor,
  )
    ? BOUNDARY_COLORS
    : [{ value: initialColor, label: "当前颜色" }, ...BOUNDARY_COLORS];
  const [title, setTitle] = useState(cleanMindMapTopic(boundary?.title, "新建分组"));
  const [color, setColor] = useState(initialColor);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = async (operation: () => Promise<void> | void) => {
    if (pending) return;
    setPending(true);
    try {
      await operation();
    } finally {
      if (mountedRef.current) setPending(false);
    }
  };

  return (
    <div
      className={styles.boundaryPopover}
      role="dialog"
      aria-labelledby={titleId}
      aria-busy={pending}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") onCancel();
      }}
    >
      <div className={styles.boundaryHeader}>
        <strong id={titleId}>
          {boundary ? "编辑外框分组" : "添加外框分组"}
        </strong>
        <span>Esc 关闭</span>
      </div>

      <label className={styles.boundaryField}>
        <span>外框标题</span>
        <input
          ref={inputRef}
          type="text"
          value={title}
          maxLength={120}
          aria-label="外框标题"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className={styles.boundaryField}>
        <span>外框颜色</span>
        <div
          className={styles.boundaryColorGrid}
          role="radiogroup"
          aria-label="选择外框颜色"
        >
          {colorOptions.map((option) => {
            const selected = option.value === color;
            return (
              <button
                type="button"
                role="radio"
                key={option.value}
                className={`${styles.boundaryColor} ${selected ? styles.boundaryColorSelected : ""}`}
                aria-label={`外框颜色：${option.label}`}
                aria-checked={selected}
                title={option.label}
                onClick={() => setColor(option.value)}
                style={{ background: option.value }}
                disabled={pending}
              >
                {selected && <CheckOutlined aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.boundaryActions}>
        {boundary && (
          <button
            type="button"
            className={styles.boundaryRemove}
            onClick={() => void run(onRemove)}
            disabled={pending}
          >
            <DeleteOutlined aria-hidden="true" /> 移除外框
          </button>
        )}
        <button
          type="button"
          className={styles.boundaryCancel}
          onClick={onCancel}
          disabled={pending}
        >
          取消
        </button>
        <button
          type="button"
          className={styles.boundarySave}
          onClick={() =>
            void run(() => onSave({ title: title.trim() || "分组", color }))
          }
          disabled={pending}
        >
          保存
        </button>
      </div>
    </div>
  );
};
