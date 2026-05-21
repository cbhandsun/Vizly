/**
 * mindmapHistoryStore.ts — 思维导图本地快照历史管理器
 */
import type { NodeObj } from 'mind-elixir';

export interface HistoryRecord {
    id: string;
    time: string;
    description: string;
    data: string; // 序列化后的 NodeObj JSON 字符串
}

type ToggleHistoryListener = (open: boolean) => void;
const toggleListeners = new Set<ToggleHistoryListener>();
let _historyOpen = false;

export function emitToggleHistory() {
    _historyOpen = !_historyOpen;
    toggleListeners.forEach(fn => fn(_historyOpen));
}

export function subscribeToggleHistory(fn: ToggleHistoryListener) {
    toggleListeners.add(fn);
    return () => toggleListeners.delete(fn);
}

export function getHistoryOpen() {
    return _historyOpen;
}

// 采用图表 ID（diagramId）进行数据隔离，防止多张图历史交叉
const diagramHistoryMap: Record<string, HistoryRecord[]> = {};
type HistoryListListener = (list: HistoryRecord[]) => void;
const listListeners = new Set<HistoryListListener>();
let currentDiagramId = '';

export function setCurrentDiagramId(diagramId: string) {
    currentDiagramId = diagramId;
    if (diagramId && !diagramHistoryMap[diagramId]) {
        diagramHistoryMap[diagramId] = [];
    }
    // 触发订阅更新
    const list = getHistoryList();
    listListeners.forEach(fn => fn(list));
}

export function addHistoryRecord(description: string, nodeData: NodeObj) {
    if (!currentDiagramId) return;
    const serialized = JSON.stringify(nodeData);
    const list = diagramHistoryMap[currentDiagramId] || [];

    // 去重：如果跟上一次快照完全一致，则不重复记录
    if (list.length > 0 && list[0].data === serialized) {
        return;
    }

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    const newRecord: HistoryRecord = {
        id: `${Date.now()}`,
        time: timeStr,
        description,
        data: serialized,
    };

    diagramHistoryMap[currentDiagramId] = [newRecord, ...list].slice(0, 50); // 最多保留 50 次记录
    listListeners.forEach(fn => fn(diagramHistoryMap[currentDiagramId]));
}

export function getHistoryList(): HistoryRecord[] {
    if (!currentDiagramId) return [];
    return diagramHistoryMap[currentDiagramId] || [];
}

export function subscribeHistoryList(fn: HistoryListListener) {
    listListeners.add(fn);
    fn(getHistoryList());
    return () => listListeners.delete(fn);
}

export function clearHistory() {
    if (!currentDiagramId) return;
    diagramHistoryMap[currentDiagramId] = [];
    listListeners.forEach(fn => fn([]));
}
