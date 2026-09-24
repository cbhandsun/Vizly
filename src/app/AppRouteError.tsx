import React, { useEffect, useRef } from 'react';
import { House, RotateCw, ShieldCheck } from 'lucide-react';

import './AppRouteError.css';

export interface AppRouteErrorProps {
  onRetry?: () => void;
  onReturnToProjects?: () => void;
}

const retryCurrentRoute = (): void => {
  window.location.reload();
};

const returnToProjects = (): void => {
  window.location.hash = '#/manage';
  window.location.reload();
};

/**
 * Safe, provider-independent route recovery UI.
 *
 * Route errors are unknown external failures. Their raw messages may contain
 * module URLs or implementation details, so this boundary intentionally does
 * not render them.
 */
const AppRouteError: React.FC<AppRouteErrorProps> = ({
  onRetry = retryCurrentRoute,
  onReturnToProjects = returnToProjects,
}) => {
  const retryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryButtonRef.current?.focus();
  }, []);

  return (
    <main className="app-route-error" aria-labelledby="app-route-error-title">
      <section className="app-route-error__card" role="alert" aria-describedby="app-route-error-description">
        <div className="app-route-error__icon" aria-hidden="true">
          <ShieldCheck />
        </div>
        <p className="app-route-error__eyebrow">Vizly recovery</p>
        <h1 id="app-route-error-title">We couldn&apos;t open this screen</h1>
        <p id="app-route-error-description" className="app-route-error__description">
          This screen stopped loading. Reload to try again, or return to Projects and reopen the diagram.
        </p>
        <div className="app-route-error__actions">
          <button
            ref={retryButtonRef}
            type="button"
            className="app-route-error__button app-route-error__button--primary"
            onClick={onRetry}
          >
            <RotateCw aria-hidden="true" />
            Reload screen
          </button>
          <button
            type="button"
            className="app-route-error__button app-route-error__button--secondary"
            onClick={onReturnToProjects}
          >
            <House aria-hidden="true" />
            Return to Projects
          </button>
        </div>
        <p className="app-route-error__hint">
          If this keeps happening, reopen Vizly after checking your network connection.
        </p>
      </section>
    </main>
  );
};

export default AppRouteError;
