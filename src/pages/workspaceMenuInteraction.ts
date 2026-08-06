export interface WorkspaceMenuPoint {
  x: number;
  y: number;
}

export interface WorkspaceMenuSize {
  width: number;
  height: number;
}

export type WorkspaceMenuNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

const finiteOrZero = (value: number): number => Number.isFinite(value) ? value : 0;

export const clampWorkspaceMenuPosition = (
  point: WorkspaceMenuPoint,
  menu: WorkspaceMenuSize,
  viewport: WorkspaceMenuSize,
  padding = 8,
): WorkspaceMenuPoint => {
  const safePadding = Math.max(0, finiteOrZero(padding));
  const maxX = Math.max(safePadding, finiteOrZero(viewport.width) - Math.max(0, finiteOrZero(menu.width)) - safePadding);
  const maxY = Math.max(safePadding, finiteOrZero(viewport.height) - Math.max(0, finiteOrZero(menu.height)) - safePadding);

  return {
    x: Math.min(Math.max(finiteOrZero(point.x), safePadding), maxX),
    y: Math.min(Math.max(finiteOrZero(point.y), safePadding), maxY),
  };
};

export const getNextWorkspaceMenuIndex = (
  currentIndex: number,
  itemCount: number,
  key: WorkspaceMenuNavigationKey,
): number => {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;

  const normalizedIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < itemCount
    ? currentIndex
    : 0;
  return key === 'ArrowDown'
    ? (normalizedIndex + 1) % itemCount
    : (normalizedIndex - 1 + itemCount) % itemCount;
};

export const focusWorkspaceTarget = (
  preferred: HTMLElement | null | undefined,
  fallback?: HTMLElement | null,
): boolean => {
  const focusConnectedTarget = (target: HTMLElement | null | undefined): boolean => {
    if (!target?.isConnected) return false;
    target.focus({ preventScroll: true });
    return document.activeElement === target;
  };

  if (focusConnectedTarget(preferred)) return true;
  if (fallback === preferred) return false;
  return focusConnectedTarget(fallback);
};
