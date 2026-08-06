import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';

import { shouldPreserveParentDialogOnEscape } from '@/core/components/ui/dialogEscapeLayer';
import { useNestedModalRegistration } from './modalNestingContext';

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
  useNestedModalRegistration(active);

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
      if (shouldPreserveParentDialogOnEscape(event.target, containerRef.current)) return;
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
      event.stopPropagation();
      containerRef.current.focus();
      return;
    }
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const nextIndex = activeIndex < 0
      ? (event.shiftKey ? focusable.length - 1 : 0)
      : (activeIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
    event.preventDefault();
    event.stopPropagation();
    focusable[nextIndex].focus();
  }, []);

  return { containerRef, handleKeyDown };
};
