import React, { useRef } from "react";
import { Popover, Tooltip } from "antd";
import { PushpinOutlined } from "@ant-design/icons";

import {
  MindMapBoundaryEditor,
  type MindMapBoundaryValue,
} from "./MindMapBoundaryEditor";
import styles from "./FloatingBar.module.css";

interface MindMapBoundaryControlProps {
  boundary?: MindMapBoundaryValue;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => Promise<void> | void;
  onSave: (boundary: MindMapBoundaryValue) => Promise<void> | void;
}

export const MindMapBoundaryControl: React.FC<MindMapBoundaryControlProps> = ({
  boundary,
  open,
  onOpenChange,
  onRemove,
  onSave,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeAndRestoreFocus = () => {
    onOpenChange(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const applyAndClose = async (operation: () => Promise<void> | void) => {
    try {
      await operation();
    } finally {
      closeAndRestoreFocus();
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="top"
      arrow={false}
      destroyOnHidden
      getPopupContainer={() => document.body}
      styles={{
        content: { padding: 0, background: "transparent", boxShadow: "none" },
      }}
      content={
        <MindMapBoundaryEditor
          boundary={boundary}
          onCancel={closeAndRestoreFocus}
          onRemove={() => applyAndClose(onRemove)}
          onSave={(value) => applyAndClose(() => onSave(value))}
        />
      }
    >
      <Tooltip title={boundary ? "编辑外框分组" : "添加外框分组"}>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.btn} ${boundary ? styles.btnActive : ""}`}
          aria-label={boundary ? "编辑外框分组" : "添加外框分组"}
          title={boundary ? "编辑外框分组" : "添加外框分组"}
          aria-expanded={open}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenChange(!open);
          }}
        >
          <PushpinOutlined aria-hidden="true" />
        </button>
      </Tooltip>
    </Popover>
  );
};
