import { setTimeout as delay } from 'node:timers/promises';

import {
  DISPLAY_ROUTING_LAYOUT_CASES,
} from './display-routing-matrix-cases.mjs';
import {
  assertRequestedLayoutSelected,
  clickLayout,
} from './display-routing-matrix-layout-command.mjs';

const resolveLayoutCase = variantId => DISPLAY_ROUTING_LAYOUT_CASES.find(
  layoutCase => layoutCase.id === variantId,
) ?? null;

export const clickPrecompiledDisplayRouteLayoutVariant = async (
  session,
  variantId,
  wait = delay,
) => {
  const layoutCase = resolveLayoutCase(variantId);
  if (!layoutCase) throw new Error(`Unknown precompiled layout variant ${variantId}`);
  const clickedAt = await clickLayout(session, layoutCase, wait);
  await assertRequestedLayoutSelected(session, layoutCase.id, {
    attempts: 80,
    failFastRecognizedMismatch: false,
    waitMs: 250,
    wait,
  });
  return clickedAt;
};
