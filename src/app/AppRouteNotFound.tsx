import React, { useEffect, useRef } from 'react';
import { ArrowLeft, CircleHelp, House } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const projectsButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    projectsButtonRef.current?.focus();
  }, []);

  return (
    <main className="app-route-error" aria-labelledby="app-route-not-found-title">
      <section className="app-route-error__card" role="status" aria-describedby="app-route-not-found-description">
        <div className="app-route-error__icon" aria-hidden="true">
          <CircleHelp />
        </div>
        <p className="app-route-error__eyebrow">{t('routeNotFound.eyebrow')}</p>
        <h1 id="app-route-not-found-title">{t('routeNotFound.title')}</h1>
        <p id="app-route-not-found-description" className="app-route-error__description">
          {t('routeNotFound.description')}
        </p>
        <div className="app-route-error__actions">
          <button
            ref={projectsButtonRef}
            type="button"
            className="app-route-error__button app-route-error__button--primary"
            onClick={onReturnToProjects}
          >
            <House aria-hidden="true" />
            {t('routeNotFound.projects')}
          </button>
          <button
            type="button"
            className="app-route-error__button app-route-error__button--secondary"
            onClick={onGoBack}
          >
            <ArrowLeft aria-hidden="true" />
            {t('routeNotFound.back')}
          </button>
        </div>
        <p className="app-route-error__hint">
          {t('routeNotFound.hint')}
        </p>
      </section>
    </main>
  );
};

export default AppRouteNotFound;
