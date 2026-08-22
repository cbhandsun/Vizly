interface ExportIsolationSnapshot {
  ariaHidden: string | null;
  inert: string | null;
}

const restoreAttribute = (
  element: HTMLElement,
  name: 'aria-hidden' | 'inert',
  value: string | null,
): void => {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
};

export const markExportCaptureElementHidden = (element: HTMLElement): void => {
  element.setAttribute('data-vizly-export-capture', 'true');
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('inert', '');
};

export const isolateExportOverlaySiblings = (overlay: HTMLElement): (() => void) => {
  const parent = overlay.parentElement;
  if (!parent) return () => undefined;

  const snapshots = new Map<HTMLElement, ExportIsolationSnapshot>();
  const isolate = (element: HTMLElement): void => {
    if (element === overlay || snapshots.has(element)) return;
    snapshots.set(element, {
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.getAttribute('inert'),
    });
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('inert', '');
  };

  Array.from(parent.children).forEach((child) => {
    if (child instanceof HTMLElement) isolate(child);
  });

  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement && node.parentElement === parent) isolate(node);
        });
      });
    })
    : null;
  observer?.observe(parent, { childList: true });

  return () => {
    observer?.disconnect();
    snapshots.forEach((snapshot, element) => {
      restoreAttribute(element, 'aria-hidden', snapshot.ariaHidden);
      restoreAttribute(element, 'inert', snapshot.inert);
    });
  };
};

export const focusAvailableExportTrigger = (trigger: HTMLButtonElement | null): boolean => {
  if (!trigger || !trigger.isConnected || trigger.disabled) return false;
  trigger.focus();
  return trigger.ownerDocument.activeElement === trigger;
};
