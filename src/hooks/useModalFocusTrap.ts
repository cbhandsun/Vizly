import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

interface UseModalFocusTrapOptions {
  active: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export const useModalFocusTrap = <T extends HTMLElement>({
  active,
  initialFocusRef,
  onClose,
}: UseModalFocusTrapOptions) => {
  const containerRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    queueMicrotask(() => (initialFocusRef?.current ?? containerRef.current)?.focus());

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', handleEscape, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleEscape, { capture: true });
      previouslyFocused?.focus();
    };
  }, [active, initialFocusRef]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<T>) => {
    if (event.key !== 'Tab' || !containerRef.current) return;
    const focusable = Array.from(containerRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )).filter(element => !element.hasAttribute('hidden'));
    if (focusable.length === 0) {
      event.preventDefault();
      containerRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return { containerRef, handleKeyDown };
};
