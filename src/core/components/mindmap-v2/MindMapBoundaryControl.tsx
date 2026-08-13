import React, { useRef } from "react";
import { Popover, Tooltip } from "antd";
import { PushpinOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = t(boundary
    ? "plugins.mindmap.floatingBar.editBoundary"
    : "plugins.mindmap.floatingBar.addBoundary");

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
      <Tooltip title={label}>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.btn} ${boundary ? styles.btnActive : ""}`}
          aria-label={label}
          title={label}
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
