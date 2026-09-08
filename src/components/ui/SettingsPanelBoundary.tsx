import { Suspense, type ReactNode } from 'react';

/** Content-free markers distinguish a requested panel from a suspended import. */
export function SettingsPanelBoundary({ children }: { children: ReactNode }) {
  return <>
    <span hidden data-settings-panel-phase="requested" />
    <Suspense fallback={<span hidden data-settings-panel-phase="loading" />}>
      <span hidden data-settings-panel-phase="ready" />
      {children}
    </Suspense>
  </>;
}
