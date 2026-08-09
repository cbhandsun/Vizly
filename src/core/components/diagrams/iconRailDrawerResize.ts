import {
  clampIconRailDrawerWidth,
  ICON_RAIL_DRAWER_MAX_WIDTH,
  ICON_RAIL_DRAWER_MIN_WIDTH,
} from './iconRailSidebarStorage';

export const ICON_RAIL_DRAWER_KEYBOARD_STEP = 4;
export const ICON_RAIL_DRAWER_KEYBOARD_LARGE_STEP = 20;

interface ResolveIconRailDrawerKeyboardWidthOptions {
  currentWidth: number;
  key: string;
  shiftKey?: boolean;
}

export const resolveIconRailDrawerKeyboardWidth = ({
  currentWidth,
  key,
  shiftKey = false,
}: ResolveIconRailDrawerKeyboardWidthOptions): number | null => {
  const normalizedWidth = clampIconRailDrawerWidth(currentWidth);
  const step = shiftKey
    ? ICON_RAIL_DRAWER_KEYBOARD_LARGE_STEP
    : ICON_RAIL_DRAWER_KEYBOARD_STEP;

  switch (key) {
    case 'ArrowLeft':
      return clampIconRailDrawerWidth(normalizedWidth - step);
    case 'ArrowRight':
      return clampIconRailDrawerWidth(normalizedWidth + step);
    case 'Home':
      return ICON_RAIL_DRAWER_MIN_WIDTH;
    case 'End':
      return ICON_RAIL_DRAWER_MAX_WIDTH;
    default:
      return null;
  }
};
