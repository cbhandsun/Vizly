import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ModalNestingContext, type RegisterNestedModal } from './modalNestingContext';

interface ModalNestingBoundaryProps {
  children: ReactNode;
  onActiveChange: (active: boolean) => void;
}

export const ModalNestingBoundary = ({
  children,
  onActiveChange,
}: ModalNestingBoundaryProps) => {
  const [activeModalIds, setActiveModalIds] = useState<ReadonlySet<symbol>>(() => new Set());

  const registerNestedModal = useCallback<RegisterNestedModal>(() => {
    const modalId = Symbol('nested-modal');
    setActiveModalIds(previous => new Set(previous).add(modalId));

    return () => {
      setActiveModalIds(previous => {
        if (!previous.has(modalId)) return previous;
        const next = new Set(previous);
        next.delete(modalId);
        return next;
      });
    };
  }, []);

  const hasActiveModal = activeModalIds.size > 0;
  useEffect(() => {
    onActiveChange(hasActiveModal);
  }, [hasActiveModal, onActiveChange]);

  const value = useMemo(() => registerNestedModal, [registerNestedModal]);
  return (
    <ModalNestingContext.Provider value={value}>
      {children}
    </ModalNestingContext.Provider>
  );
};
