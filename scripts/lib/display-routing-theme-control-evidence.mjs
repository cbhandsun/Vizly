// Observe only the single public settings shortcut used by this browser audit.
// The microtask sees preventDefault even when a later handler stops propagation.
export const readThemeShortcutEvidence = (doc, start = false) => {
  const win = doc.defaultView;
  if (!win) return null;
  if (start) {
    win.__vizlyThemeShortcutCleanup?.();
    const state = { received: false, defaultPrevented: null };
    win.__vizlyThemeShortcutEvidence = state;
    let timer;
    const cleanup = () => {
      win.removeEventListener('keydown', observe, true);
      win.clearTimeout(timer);
      delete win.__vizlyThemeShortcutCleanup;
    };
    const observe = event => {
      if (event.key !== ',' || !(event.ctrlKey || event.metaKey)) return;
      state.received = true;
      win.queueMicrotask(() => { state.defaultPrevented = event.defaultPrevented === true; });
      cleanup();
    };
    win.__vizlyThemeShortcutCleanup = cleanup;
    win.addEventListener('keydown', observe, true);
    timer = win.setTimeout(cleanup, 5000);
  }
  const state = win.__vizlyThemeShortcutEvidence;
  return state ? { received: state.received, defaultPrevented: state.defaultPrevented } : null;
};

export const projectThemeShortcutEvidence = value => (
  value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.received === 'boolean'
    && (value.defaultPrevented === null || typeof value.defaultPrevented === 'boolean')
    ? { received: value.received, defaultPrevented: value.defaultPrevented } : null
);

// Self-contained because the browser runner serializes this function.
export const readThemeControlEvidence = doc => {
  const scan = selector => {
    const elements = doc.querySelectorAll(selector);
    const result = { found: Math.min(elements.length, 100_000), scanned: 0, clickable: 0,
      disabled: 0, hidden: 0, obscured: 0 };
    for (let index = 0; index < Math.min(elements.length, 64); index += 1) {
      const element = elements[index];
      result.scanned += 1;
      const disabled = element.disabled === true || element.getAttribute('aria-disabled') === 'true';
      const style = doc.defaultView?.getComputedStyle(element);
      const hidden = Boolean(element.closest('[inert], [hidden]')) || element.getAttribute('aria-hidden') === 'true'
        || element.getClientRects().length === 0
        || style?.display === 'none' || style?.visibility === 'hidden';
      if (disabled) result.disabled += 1;
      if (hidden) result.hidden += 1;
      if (element.tagName === 'BUTTON' && !element.disabled
        && !element.closest('[inert], [hidden]') && element.getClientRects().length > 0) result.clickable += 1;
      if (!hidden && typeof doc.elementFromPoint === 'function') {
        const rect = element.getBoundingClientRect();
        const hit = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!hit || (hit !== element && !element.contains(hit))) result.obscured += 1;
      }
    }
    return result;
  };
  const active = doc.activeElement;
  const tag = active?.tagName?.toLowerCase();
  const focus = ['body', 'button', 'input', 'textarea', 'select'].includes(tag)
    ? tag : active ? 'other' : 'none';
  return {
    schema: 'theme-control-evidence-v1',
    readyState: ['loading', 'interactive', 'complete'].includes(doc.readyState) ? doc.readyState : 'unknown',
    visibility: ['visible', 'hidden'].includes(doc.visibilityState) ? doc.visibilityState : 'unknown',
    hasFocus: typeof doc.hasFocus === 'function' ? doc.hasFocus() : null,
    focus,
    editable: Boolean(active?.isContentEditable || ['input', 'textarea', 'select'].includes(tag)),
    trigger: scan('[data-theme-selector-trigger]'),
    settings: scan('[data-settings-close]'),
    dialog: scan('[data-theme-selector-dialog]'),
    modal: scan('[role="dialog"][aria-modal="true"]'),
  };
};

/** Re-project CDP output before it can reach stderr; never retain raw DOM data. */
export const projectThemeControlEvidence = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema !== 'theme-control-evidence-v1') return null;
  const enumeration = (candidate, allowed) => allowed.includes(candidate) ? candidate : 'unknown';
  const boolean = candidate => typeof candidate === 'boolean' ? candidate : null;
  const controls = candidate => Object.fromEntries(
    ['found', 'scanned', 'clickable', 'disabled', 'hidden', 'obscured'].map(key => {
      const number = candidate?.[key];
      const max = key === 'found' ? 100_000 : 64;
      return [key, Number.isSafeInteger(number) && number >= 0 && number <= max ? number : null];
    }),
  );
  return {
    schema: 'theme-control-evidence-v1',
    readyState: enumeration(value.readyState, ['loading', 'interactive', 'complete']),
    visibility: enumeration(value.visibility, ['visible', 'hidden']),
    hasFocus: boolean(value.hasFocus),
    focus: enumeration(value.focus, ['body', 'button', 'input', 'textarea', 'select', 'other', 'none']),
    editable: boolean(value.editable),
    trigger: controls(value.trigger), settings: controls(value.settings), dialog: controls(value.dialog), modal: controls(value.modal),
  };
};
