import type { MindElixirData, Topic } from "mind-elixir";

import { getActiveMindMapSelection } from "./mindMapSelectionStore";

export type MindMapSummaryCreationResult =
  | { ok: true; nodeId: string; message: string }
  | {
      ok: false;
      code:
        | "no-selection"
        | "root-not-supported"
        | "node-not-found"
        | "create-failed";
      message: string;
      error?: unknown;
    };

const selectedNodeIdFromDom = (mind: MindMapSummaryHost): string | null => {
  const selected = mind.container.querySelector<HTMLElement>("me-tpc.selected");
  return selected?.dataset.nodeid?.trim() || null;
};

const resolveSummaryNodeId = (
  mind: MindMapSummaryHost,
  preferredNodeId?: string | null,
): string | null => {
  const preferred = preferredNodeId?.trim();
  if (preferred) return preferred;
  const active = getActiveMindMapSelection()?.id?.trim();
  if (active) return active;
  const current = mind.currentNode?.dataset.nodeid?.trim();
  if (current) return current;
  return selectedNodeIdFromDom(mind);
};

export const createMindMapSummaryForSelection = (
  mind: MindMapSummaryHost,
  preferredNodeId?: string | null,
): MindMapSummaryCreationResult => {
  const nodeId = resolveSummaryNodeId(mind, preferredNodeId);
  if (!nodeId) {
    return { ok: false, code: "no-selection", message: "请先选中一个非根节点" };
  }

  const rootId = mind.getData().nodeData.id;
  if (nodeId === rootId) {
    return {
      ok: false,
      code: "root-not-supported",
      message: "根节点不能创建汇总括号",
    };
  }

  let topic: Topic;
  try {
    topic = mind.findEle(nodeId);
  } catch (error) {
    return {
      ok: false,
      code: "node-not-found",
      message: "选中节点已失效，请重新选择",
      error,
    };
  }

  if (!topic) {
    return {
      ok: false,
      code: "node-not-found",
      message: "选中节点已失效，请重新选择",
    };
  }

  try {
    mind.selectNode(topic);
    if (mind.currentNodes.length === 0) {
      return {
        ok: false,
        code: "no-selection",
        message: "请先选中一个非根节点",
      };
    }
    mind.createSummary();
    return { ok: true, nodeId, message: "已创建汇总括号" };
  } catch (error) {
    return {
      ok: false,
      code: "create-failed",
      message: "创建汇总括号失败，请重试",
      error,
    };
  }
};
export interface MindMapSummaryHost {
  container: HTMLElement;
  currentNode: Topic | null;
  currentNodes: Topic[];
  getData: () => MindElixirData;
  findEle: (nodeId: string) => Topic;
  selectNode: (topic: Topic) => void;
  createSummary: () => void;
}
