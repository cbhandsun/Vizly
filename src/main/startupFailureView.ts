import type { StartupFailureSummary } from './applicationStartup';
import './startupFailureView.css';

/** Pre-React recovery uses text nodes only and never accepts a raw exception. */
export const showStartupFailure = (
  summary: StartupFailureSummary,
  documentRef: Document = document,
  reload: () => void = () => window.location.reload(),
): void => {
  const host = documentRef.getElementById('root') ?? documentRef.body;
  const panel = documentRef.createElement('main');
  panel.className = 'startup-recovery';
  panel.setAttribute('role', 'alert');
  const title = documentRef.createElement('h1');
  title.textContent = 'Vizly could not finish starting';
  const description = documentRef.createElement('p');
  description.textContent = 'Reload to try again. If this continues, share the diagnostic summary below with support.';
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.textContent = 'Reload Vizly';
  button.addEventListener('click', reload);
  const details = documentRef.createElement('textarea');
  details.readOnly = true;
  details.rows = 7;
  details.setAttribute('aria-label', 'Startup diagnostic summary');
  // Project explicitly: extra properties on an internal value are never exported.
  details.value = JSON.stringify({ schema: summary.schema, stage: summary.stage,
    code: summary.code, elapsedMs: summary.elapsedMs }, null, 2);
  panel.append(title, description, button, details);
  host.replaceChildren(panel);
  button.focus();
};
