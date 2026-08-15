import React, { useEffect, useState, useCallback, useRef } from "react";
import type { NodeObj, Topic } from "mind-elixir";
import { useTranslation } from "react-i18next";
import {
  getMindElixirInstance,
  subscribeMindElixir,
  subscribeKanban,
  toggleKanban,
} from "./mindElixirStore";
import { classifyTasksWithAI, type TaskItemInput } from "./mindmapAIService";
import { Button, Checkbox, Tooltip, Tag } from "antd";
import {
  ProjectOutlined,
  CloseOutlined,
  CloudSyncOutlined,
  CopyOutlined,
  CheckCircleOutlined,
  IssuesCloseOutlined,
} from "@ant-design/icons";
import { Clock } from "lucide-react";
import {
  applyTaskMeta,
  type MindMapTaskMeta,
  type TaskPriority,
  type TaskStatus,
} from "./mindmapTaskModel";
import { cleanMindMapNodePatch } from "./mindmapNodePatchSecurity";
import { logMindmapKanbanRefreshFailure } from "./mindmapPanelLogging";
import { extractKanbanTasks, type KanbanTask } from "./mindmapKanbanTasks";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import { appMessage } from "@/core/utils/antdStaticBridge";
import "./MindMapTaskKanban.css";
type TaskNode = NodeObj & { task?: MindMapTaskMeta };

const reshapeTaskNode = (
  mind: NonNullable<ReturnType<typeof getMindElixirInstance>>,
  element: Topic,
  node: TaskNode,
): void => {
  const patch = cleanMindMapNodePatch({ task: node.task, tags: node.tags });
  mind.reshapeNode(element, { ...node, ...patch } as NodeObj);
};
export const MindMapTaskKanban: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mind, setMind] = useState(getMindElixirInstance());
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const aiRequestIdRef = useRef(0);
  const invalidateAIRequest = useCallback(() => {
    openRef.current = false;
    aiRequestIdRef.current += 1;
    setAiClassifying(false);
  }, []);
  const closeKanban = useCallback(() => {
    invalidateAIRequest();
    toggleKanban(false);
  }, [invalidateAIRequest]);
  const { containerRef, handleKeyDown } = useModalFocusTrap<HTMLDivElement>({
    active: open,
    initialFocusRef: closeButtonRef,
    onClose: closeKanban,
  });

  // 订阅实例和开闭状态
  useEffect(() => subscribeMindElixir((m) => setMind(m)), []);
  useEffect(() => subscribeKanban((nextOpen) => {
    openRef.current = nextOpen;
    if (!nextOpen) {
      aiRequestIdRef.current += 1;
      setAiClassifying(false);
    }
    setOpen(nextOpen);
  }), []);

  const refreshTasks = useCallback(() => {
    if (!mind) return;
    try {
      const data = mind.getData();
      const leafTasks = extractKanbanTasks(data.nodeData);
      setTasks(leafTasks);
    } catch (err) {
      logMindmapKanbanRefreshFailure(err);
    }
  }, [mind]);

  // 监听脑图变化，同步刷新看板
  useEffect(() => {
    if (!mind || !open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refreshTasks();
    });

    const handleOp = () => {
      setTimeout(refreshTasks, 80);
    };

    mind.bus.addListener("operation", handleOp);
    return () => {
      cancelled = true;
      mind?.bus?.removeListener("operation", handleOp);
    };
  }, [mind, open, refreshTasks]);

  const updateTaskMeta = useCallback(
    (
      taskId: string,
      targetStatus: TaskStatus,
      targetPriority?: TaskPriority,
    ) => {
      if (!mind) return;
      const tpcEl = mind.findEle(taskId);
      if (!tpcEl) return;

      const data = mind.getData();
      const node = mind.getObjById(taskId, data.nodeData);
      if (!node) return;

      const prio =
        targetPriority !== undefined
          ? targetPriority
          : tasks.find((t) => t.id === taskId)?.priority || "无";
      const taskNode = node as TaskNode;
      applyTaskMeta(taskNode, { status: targetStatus, priority: prio });
      reshapeTaskNode(mind, tpcEl, taskNode);
      mind.bus.fire("operation", {
        name: "reshapeNode",
        obj: node,
        origin: node,
      });

      refreshTasks();
      setAnnouncement(
        t("plugins.mindmap.kanban.statusChanged", {
          task: tasks.find((item) => item.id === taskId)?.topic ?? "",
          status: t(`plugins.mindmap.kanban.columns.${targetStatus}`),
        }),
      );
    },
    [mind, refreshTasks, t, tasks],
  );

  // ─── Drag and Drop ────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, colName: string) => {
    e.preventDefault();
    setDragOverColumn(colName);
  };

  const handleDrop = (
    e: React.DragEvent,
    colName: "todo" | "doing" | "done",
  ) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId && tasks.some((task) => task.id === taskId)) {
      updateTaskMeta(taskId, colName);
    }
  };

  const handleCheckboxChange = (taskId: string, checked: boolean) => {
    updateTaskMeta(taskId, checked ? "done" : "todo");
  };

  // ─── AI 智能整理看板 ────────────────────────────────────────────────────────
  const handleAIClassify = async () => {
    if (!mind || tasks.length === 0) return;
    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    setAiClassifying(true);
    const hideLoading = appMessage.loading(
      t("plugins.mindmap.kanban.aiPlanning"),
      0,
    );
    const requestIsCurrent = () => openRef.current && aiRequestIdRef.current === requestId;

    const taskInputs: TaskItemInput[] = tasks.map((t) => ({
      id: t.id,
      topic: t.topic,
      context: t.ancestors.join(" > "),
    }));

    try {
      const result = await classifyTasksWithAI(taskInputs);
      if (!requestIsCurrent()) return;

      if ("error" in result) {
        appMessage.error(t("plugins.mindmap.kanban.planningFailed"));
        setAnnouncement(t("plugins.mindmap.kanban.planningFailed"));
      } else {
        let updatedCount = 0;
        result.classifications.forEach((item) => {
          const tpcEl = mind.findEle(item.id);
          if (tpcEl) {
            const data = mind.getData();
            const node = mind.getObjById(item.id, data.nodeData);
            if (node) {
              const taskNode = node as TaskNode;
              applyTaskMeta(taskNode, {
                status: item.status,
                priority: item.priority,
              });
              reshapeTaskNode(mind, tpcEl, taskNode);
              updatedCount++;
            }
          }
        });

        if (updatedCount > 0) {
          const data = mind.getData();
          mind.bus.fire("operation", {
            name: "reshapeNode",
            obj: data.nodeData,
            origin: data.nodeData,
          });
          refreshTasks();
          const successMessage = t("plugins.mindmap.kanban.planningSuccess", {
            count: updatedCount,
          });
          appMessage.success(successMessage);
          setAnnouncement(successMessage);
        } else {
          const emptyMessage = t("plugins.mindmap.kanban.noEligibleTasks");
          appMessage.warning(emptyMessage);
          setAnnouncement(emptyMessage);
        }
      }
    } catch (error: unknown) {
      if (!requestIsCurrent()) return;
      logMindmapKanbanRefreshFailure(error);
      const failureMessage = t("plugins.mindmap.kanban.planningFailed");
      appMessage.error(failureMessage);
      setAnnouncement(failureMessage);
    } finally {
      hideLoading();
      if (aiRequestIdRef.current === requestId) setAiClassifying(false);
    }
  };

  const handleCopyMarkdown = async () => {
    const todoList = tasks.filter((t) => t.status === "todo");
    const doingList = tasks.filter((t) => t.status === "doing");
    const doneList = tasks.filter((t) => t.status === "done");

    const formatTask = (t: KanbanTask) => {
      const prioStr = t.priority !== "无" ? ` [${t.priority}优先级]` : "";
      const ownerStr = t.assignee ? ` @${t.assignee}` : "";
      const dueStr = t.dueDate ? ` due:${t.dueDate}` : "";
      const progressStr = t.progress ? ` ${t.progress}%` : "";
      const pathStr =
        t.ancestors.length > 0 ? ` (来自: ${t.ancestors.join(" > ")})` : "";
      return `- [ ] ${t.topic}${prioStr}${ownerStr}${dueStr}${progressStr}${pathStr}${t.note ? `\n  > 备注: ${t.note}` : ""}`;
    };

    const formatDoneTask = (t: KanbanTask) => {
      const pathStr =
        t.ancestors.length > 0 ? ` (来自: ${t.ancestors.join(" > ")})` : "";
      return `- [x] ${t.topic}${pathStr}`;
    };

    const mdText = [
      `# ${t("plugins.mindmap.kanban.title")} — ${document.title || t("plugins.mindmap.kanban.defaultDocumentTitle")}`,
      `${t("plugins.mindmap.kanban.updatedAt")}: ${new Date().toLocaleString()}`,
      "",
      `## ${t("plugins.mindmap.kanban.columns.todo")}`,
      todoList.length > 0
        ? todoList.map(formatTask).join("\n")
        : `- ${t("plugins.mindmap.kanban.noTasks")}`,
      "",
      `## ${t("plugins.mindmap.kanban.columns.doing")}`,
      doingList.length > 0
        ? doingList.map(formatTask).join("\n")
        : `- ${t("plugins.mindmap.kanban.noTasks")}`,
      "",
      `## ${t("plugins.mindmap.kanban.columns.done")}`,
      doneList.length > 0
        ? doneList.map(formatDoneTask).join("\n")
        : `- ${t("plugins.mindmap.kanban.noTasks")}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(mdText);
      const copySuccess = t("plugins.mindmap.kanban.copySuccess");
      appMessage.success(copySuccess);
      setAnnouncement(copySuccess);
    } catch {
      const copyFailure = t("plugins.mindmap.kanban.copyFailed");
      appMessage.error(copyFailure);
      setAnnouncement(copyFailure);
    }
  };

  const renderColumn = (
    colName: "todo" | "doing" | "done",
    title: string,
    icon: React.ReactNode,
    color: string,
  ) => {
    const filtered = tasks.filter((t) => t.status === colName);
    const isOver = dragOverColumn === colName;
    const headingId = `mindmap-kanban-column-${colName}`;

    return (
      <section
        aria-labelledby={headingId}
        className={`mindmap-kanban-column${isOver ? " is-drag-over" : ""}`}
        data-kanban-column={colName}
        style={{
          background: isOver
            ? "rgba(255,255,255,0.06)"
            : "rgba(255,255,255,0.02)",
          borderColor: isOver ? color : "rgba(255,255,255,0.04)",
        }}
        onDragOver={(e) => handleDragOver(e, colName)}
        onDragLeave={() => setDragOverColumn(null)}
        onDrop={(e) => handleDrop(e, colName)}
      >
        <div className="mindmap-kanban-column-header">
          <div className="mindmap-kanban-column-title-wrap" style={{ color }}>
            {icon}
            <h3 className="mindmap-kanban-column-title" id={headingId}>
              {title}
            </h3>
          </div>
          <span
            className="mindmap-kanban-badge"
            style={{ backgroundColor: color }}
          >
            {filtered.length}
          </span>
        </div>

        <div className="mindmap-kanban-column-body" role="list">
          {filtered.length === 0 ? (
            <div className="mindmap-kanban-empty-column" role="status">
              {t("plugins.mindmap.kanban.emptyColumn")}
            </div>
          ) : (
            filtered.map((task) => (
              <div
                className="mindmap-kanban-card"
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragEnd={() => setDragOverColumn(null)}
                role="listitem"
                style={{
                  borderLeft:
                    task.priority === "高"
                      ? "3px solid #f97316"
                      : task.priority === "中"
                        ? "3px solid #eab308"
                        : task.priority === "低"
                          ? "3px solid #3b82f6"
                          : "3px solid rgba(255,255,255,0.1)",
                  opacity: task.status === "done" ? 0.65 : 1,
                }}
              >
                <div className="mindmap-kanban-card-header">
                  <Checkbox
                    aria-label={t("plugins.mindmap.kanban.toggleDone", {
                      task: task.topic,
                    })}
                    checked={task.status === "done"}
                    onChange={(e) =>
                      handleCheckboxChange(task.id, e.target.checked)
                    }
                    className="mindmap-kanban-checkbox"
                  />
                  <span
                    className="mindmap-kanban-card-topic"
                    style={{
                      textDecoration:
                        task.status === "done" ? "line-through" : "none",
                      color:
                        task.status === "done"
                          ? "rgba(255,255,255,0.35)"
                          : "#fff",
                    }}
                  >
                    {task.topic}
                  </span>
                </div>

                {task.note && (
                  <div className="mindmap-kanban-card-note">{task.note}</div>
                )}

                <div className="mindmap-kanban-card-footer">
                  <span className="mindmap-kanban-card-path">
                    {task.ancestors.slice(-2).join(" > ") ||
                      t("plugins.mindmap.kanban.rootNode")}
                  </span>
                  <div className="mindmap-kanban-card-meta">
                    {task.assignee && (
                      <span className="mindmap-kanban-meta-pill">
                        @{task.assignee}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className="mindmap-kanban-meta-pill">
                        {task.dueDate}
                      </span>
                    )}
                    {typeof task.progress === "number" && task.progress > 0 && (
                      <span className="mindmap-kanban-meta-pill">
                        {task.progress}%
                      </span>
                    )}
                    {task.priority !== "无" && (
                      <Tag
                        color={
                          task.priority === "高"
                            ? "error"
                            : task.priority === "中"
                              ? "warning"
                              : "processing"
                        }
                        className="mindmap-kanban-priority-tag"
                      >
                        {task.priority}
                      </Tag>
                    )}
                  </div>
                </div>

                <label className="mindmap-kanban-status-control">
                  <span>{t("plugins.mindmap.kanban.moveTask")}</span>
                  <select
                    aria-label={t("plugins.mindmap.kanban.moveTaskLabel", {
                      task: task.topic,
                    })}
                    onChange={(event) =>
                      updateTaskMeta(task.id, event.target.value as TaskStatus)
                    }
                    value={task.status}
                  >
                    <option value="todo">
                      {t("plugins.mindmap.kanban.columns.todo")}
                    </option>
                    <option value="doing">
                      {t("plugins.mindmap.kanban.columns.doing")}
                    </option>
                    <option value="done">
                      {t("plugins.mindmap.kanban.columns.done")}
                    </option>
                  </select>
                </label>
              </div>
            ))
          )}
        </div>
      </section>
    );
  };

  if (!open) return null;

  return (
    <div
      aria-describedby="mindmap-kanban-description"
      aria-labelledby="mindmap-kanban-title"
      aria-modal="true"
      className="mindmap-kanban-panel"
      onKeyDown={handleKeyDown}
      ref={containerRef}
      role="dialog"
      tabIndex={-1}
    >
      <span aria-live="polite" className="sr-only" role="status">
        {announcement}
      </span>
      {/* 头部 */}
      <div className="mindmap-kanban-header">
        <div className="mindmap-kanban-title-wrap">
          <ProjectOutlined
            aria-hidden="true"
            className="mindmap-kanban-title-icon"
          />
          <h2 className="mindmap-kanban-title" id="mindmap-kanban-title">
            {t("plugins.mindmap.kanban.title")}
          </h2>
        </div>
        <div className="mindmap-kanban-actions">
          <Tooltip title={t("plugins.mindmap.kanban.copyMarkdown")}>
            <Button
              aria-label={t("plugins.mindmap.kanban.copyMarkdown")}
              className="mindmap-kanban-icon-button"
              type="text"
              icon={<CopyOutlined />}
              onClick={handleCopyMarkdown}
            />
          </Tooltip>
          <Tooltip title={t("plugins.mindmap.kanban.close")}>
            <Button
              aria-label={t("plugins.mindmap.kanban.close")}
              className="mindmap-kanban-icon-button"
              type="text"
              icon={<CloseOutlined />}
              onClick={closeKanban}
              ref={closeButtonRef}
            />
          </Tooltip>
        </div>
      </div>

      {/* AI 规划栏 */}
      <div className="mindmap-kanban-ai-bar">
        <div
          className="mindmap-kanban-ai-description"
          id="mindmap-kanban-description"
        >
          {t("plugins.mindmap.kanban.description")}
        </div>
        <Button
          aria-label={t("plugins.mindmap.kanban.planWithAi")}
          className="mindmap-kanban-ai-button"
          disabled={tasks.length === 0}
          type="primary"
          icon={<CloudSyncOutlined />}
          loading={aiClassifying}
          onClick={handleAIClassify}
        >
          {t("plugins.mindmap.kanban.planWithAi")}
        </Button>
      </div>

      {/* 看板列网格 */}
      <div className="mindmap-kanban-grid">
        {renderColumn(
          "todo",
          t("plugins.mindmap.kanban.columns.todo"),
          <Clock aria-hidden="true" size={14} strokeWidth={2} />,
          "#818cf8",
        )}
        {renderColumn(
          "doing",
          t("plugins.mindmap.kanban.columns.doing"),
          <CheckCircleOutlined aria-hidden="true" />,
          "#fbbf24",
        )}
        {renderColumn(
          "done",
          t("plugins.mindmap.kanban.columns.done"),
          <IssuesCloseOutlined aria-hidden="true" />,
          "#34d399",
        )}
      </div>
    </div>
  );
};
