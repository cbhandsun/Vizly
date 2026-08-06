import { createContext, useContext, useEffect } from 'react';

export type RegisterNestedModal = () => () => void;

export const ModalNestingContext = createContext<RegisterNestedModal | null>(null);

export const useNestedModalRegistration = (active: boolean) => {
  const registerNestedModal = useContext(ModalNestingContext);

  useEffect(() => {
    if (!active || !registerNestedModal) return;
    return registerNestedModal();
  }, [active, registerNestedModal]);
};
