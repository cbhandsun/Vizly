import React, { useEffect, useRef } from 'react';
import { ArrowLeftOutlined, HomeOutlined, QuestionCircleOutlined } from '@ant-design/icons';

import './AppRouteError.css';

export interface AppRouteNotFoundProps {
  onGoBack?: () => void;
  onReturnToProjects?: () => void;
}

const goBack = (): void => {
  window.history.back();
};

const returnToProjects = (): void => {
  window.location.hash = '#/manage';
};

const AppRouteNotFound: React.FC<AppRouteNotFoundProps> = ({
  onGoBack = goBack,
  onReturnToProjects = returnToProjects,
}) => {
  const projectsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    projectsButtonRef.current?.focus();
  }, []);

  return (
    <main className="app-route-error" aria-labelledby="app-route-not-found-title">
      <section className="app-route-error__card" role="status" aria-describedby="app-route-not-found-description">
        <div className="app-route-error__icon" aria-hidden="true">
          <QuestionCircleOutlined />
        </div>
        <p className="app-route-error__eyebrow">Vizly navigation</p>
        <h1 id="app-route-not-found-title">This page doesn&apos;t exist</h1>
        <p id="app-route-not-found-description" className="app-route-error__description">
          The address may be incomplete or no longer available. Return to Projects to choose a diagram safely.
        </p>
        <div className="app-route-error__actions">
          <button
            ref={projectsButtonRef}
            type="button"
            className="app-route-error__button app-route-error__button--primary"
            onClick={onReturnToProjects}
          >
            <HomeOutlined aria-hidden="true" />
            Return to Projects
          </button>
          <button
            type="button"
            className="app-route-error__button app-route-error__button--secondary"
            onClick={onGoBack}
          >
            <ArrowLeftOutlined aria-hidden="true" />
            Go back
          </button>
        </div>
        <p className="app-route-error__hint">
          Your diagrams have not been changed.
        </p>
      </section>
    </main>
  );
};

export default AppRouteNotFound;
