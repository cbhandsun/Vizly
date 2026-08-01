const ICON_RAIL_WIDTH = 64;
const MIN_DRAWER_WIDTH = 240;
const MAX_DRAWER_WIDTH = 400;

export interface FlowchartLeftClearanceInput {
  isSidebarHidden: boolean;
  leftDrawerOpen: boolean;
  leftDrawerWidth: number;
}

/** Reserves horizontal space so bottom canvas controls remain clickable beside left chrome. */
export const resolveFlowchartLeftClearance = ({
  isSidebarHidden,
  leftDrawerOpen,
  leftDrawerWidth,
}: FlowchartLeftClearanceInput): number => {
  if (isSidebarHidden) return 0;
  if (!leftDrawerOpen) return ICON_RAIL_WIDTH;

  const safeDrawerWidth = Number.isFinite(leftDrawerWidth)
    ? Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, leftDrawerWidth))
    : MIN_DRAWER_WIDTH;
  return ICON_RAIL_WIDTH + safeDrawerWidth;
};
