import {
  FLOW_SIDEBAR_WIDTH_DEFAULT,
  FLOW_SIDEBAR_WIDTH_MAX,
  FLOW_SIDEBAR_WIDTH_MIN,
  MENU_WIDTH_DEFAULT,
  MENU_WIDTH_MAX,
  MENU_WIDTH_MIN,
  coerceBoundedInteger,
} from '@/core/utils/layoutStorage';

export type DragKind = 'menu' | 'flow';

export interface DragState {
  kind: DragKind;
  startX: number;
  startWidth: number;
}

export interface SidebarOffsetState {
  leftSidebarOffset: number;
  maxSidebarOffset: number;
}

const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.3;
const UI_SCALE_MAX = 3;
const COLLAPSED_MENU_WIDTH = 64;
const SIDEBAR_GAP = 16;

export const coerceUiScale = (value: unknown, fallback = UI_SCALE_DEFAULT): number => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric) || numeric <= UI_SCALE_MIN || numeric > UI_SCALE_MAX) return fallback;
  return numeric;
};

export const resolveUiScale = (
  search: string,
  configuredScale: unknown,
  fallback = UI_SCALE_DEFAULT
): number => {
  try {
    const qs = new URLSearchParams(search);
    const urlScale = coerceUiScale(qs.get('uiScale'), Number.NaN);
    if (Number.isFinite(urlScale)) return urlScale;
  } catch {
    void 0;
  }
  return coerceUiScale(configuredScale, fallback);
};

export const getLayoutPopupContainer = (node?: HTMLElement): HTMLElement => {
  if (typeof document === 'undefined') {
    if (node) return node;
    throw new Error('A popup container requires a DOM document or trigger node.');
  }
  const rootFromNode = node?.closest('#app-root-layout');
  if (rootFromNode instanceof HTMLElement) return rootFromNode;
  const root = document.getElementById('app-root-layout');
  return root || document.body;
};

export const getNextSidebarWidth = (state: DragState, clientX: number): number => {
  const dx = Number.isFinite(clientX) && Number.isFinite(state.startX) ? clientX - state.startX : 0;
  const rawWidth = state.startWidth + dx;
  return state.kind === 'menu'
    ? coerceBoundedInteger(rawWidth, MENU_WIDTH_DEFAULT, MENU_WIDTH_MIN, MENU_WIDTH_MAX)
    : coerceBoundedInteger(rawWidth, FLOW_SIDEBAR_WIDTH_DEFAULT, FLOW_SIDEBAR_WIDTH_MIN, FLOW_SIDEBAR_WIDTH_MAX);
};

export const getSidebarOffsets = (
  isMenuCollapsed: boolean,
  menuWidth: number,
  rightSidebarVisible: boolean,
  rightSidebarWidth: number
): SidebarOffsetState => {
  const safeMenuWidth = coerceBoundedInteger(menuWidth, MENU_WIDTH_DEFAULT, MENU_WIDTH_MIN, MENU_WIDTH_MAX);
  const safeRightWidth = Math.max(0, coerceBoundedInteger(rightSidebarWidth, 0, 0, 2_000));
  const leftSidebarOffset = (isMenuCollapsed ? COLLAPSED_MENU_WIDTH : safeMenuWidth) + SIDEBAR_GAP;
  const rightOffset = rightSidebarVisible ? safeRightWidth + SIDEBAR_GAP : 0;
  return {
    leftSidebarOffset,
    maxSidebarOffset: Math.max(leftSidebarOffset, rightOffset),
  };
};
