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

  try {
    const meta = document.querySelector('meta[name="vizly-route-preloads"]');
    const content = meta ? meta.getAttribute('content') : '';
    if (!content || content.length > 16384) return;
    const routes = Object.create(null);
    for (const part of content.split(';')) {
      const separator = part.indexOf('=');
      if (separator > 0) routes[part.slice(0, separator)] = part.slice(separator + 1).split(',');
    }
    const location = window.location || {};
    const hash = typeof location.hash === 'string' && location.hash.length <= 4096 ? location.hash : '';
    const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
    const queryIndex = rawHash.indexOf('?');
    let path = (queryIndex >= 0 ? rawHash.slice(0, queryIndex) : rawHash).trim();
    if (!path || path.charAt(0) !== '/') path = '/';
    const search = typeof location.search === 'string' && location.search.length <= 4096 ? location.search : '';
    const searchParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(queryIndex >= 0 ? rawHash.slice(queryIndex + 1) : '');
    const param = name => (searchParams.get(name) || hashParams.get(name) || '').trim();
    if (param('test')) return;
    const diagram = param('diagram');
    const pathname = typeof location.pathname === 'string' ? location.pathname : '';
    if (path === '/' && pathname && pathname !== '/' && pathname !== '/index.html' && !diagram) path = pathname;
    const matches = route => path === route || path.startsWith(route + '/');
    const isRoot = path === '/' || path === '';
    let target = '';
    if (matches('/docs') || matches('/warehouse-3d') || matches('/3d')
      || matches('/storage-config') || matches('/shared')) return;
    if (matches('/manage') || (isRoot && !diagram)) target = 'manage';
    else if (matches('/diagram') || (isRoot && diagram)) target = 'diagram';
    const files = target ? routes[target] : undefined;
    if (!files) return;
    const head = document.head || document.documentElement;
    for (const href of files.slice(0, 64)) {
      if (!/^\/assets\/[A-Za-z0-9_.-]+\.js$/.test(href)) continue;
      if (document.querySelector('link[rel="modulepreload"][href="' + href + '"]')) continue;
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.setAttribute('crossorigin', '');
      link.href = href;
      head.appendChild(link);
    }
  } catch {
    // Route download hints are optional; never interfere with startup recovery.
  }
})();
