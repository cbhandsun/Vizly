/* Independent of the application module graph. Version the URL on changes. */
(() => {
  const startedAt = performance.now();
  let active = true;
  let failed = false;
  const renderFailure = () => {
    if (!active || !failed) return;
    const panel = document.createElement('main');
    panel.className = 'startup-recovery';
    panel.setAttribute('role', 'alert');
    Object.assign(panel.style, { margin: '12vh auto', padding: '2rem', maxWidth: '38rem',
      boxSizing: 'border-box', background: '#fff', color: '#172033', fontFamily: 'system-ui, sans-serif' });
    const title = document.createElement('h1');
    title.textContent = 'Vizly could not finish starting';
    const message = document.createElement('p');
    message.textContent = 'An application resource could not load. Reload to try again, or share the diagnostic summary with support.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload Vizly';
    reload.addEventListener('click', () => window.location.reload());
    const summary = document.createElement('textarea');
    summary.readOnly = true;
    summary.rows = 7;
    summary.setAttribute('aria-label', 'Startup diagnostic summary');
    Object.assign(summary.style, { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '1rem' });
    const elapsed = performance.now() - startedAt;
    summary.value = JSON.stringify({ schema: 'vizly-startup-failure-v1', stage: 'resources',
      code: 'entry-resource-failed', elapsedMs: Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 600000
        ? Math.round(elapsed) : null }, null, 2);
    panel.append(title, message, reload, summary);
    (document.getElementById('root') || document.body).replaceChildren(panel);
    reload.focus();
  };
  const onError = event => {
    if (!active || failed || !(event.target instanceof HTMLScriptElement) || event.target.type !== 'module') return;
    failed = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderFailure, { once: true });
    } else renderFailure();
  };
  const release = () => {
    active = false;
    window.removeEventListener('error', onError, true);
    document.removeEventListener('DOMContentLoaded', renderFailure);
    window.removeEventListener('vizly:entry-ready', release);
  };
  window.addEventListener('error', onError, true);
  window.addEventListener('vizly:entry-ready', release, { once: true });
})();
