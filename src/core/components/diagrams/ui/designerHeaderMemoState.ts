export interface DesignerHeaderLayoutMemoState {
    lastDomainDirection?: string;
    lastDomainStrategy?: string;
    lastNodeLayout?: string;
    layoutBusy?: boolean;
}

export const haveSameDesignerHeaderLayoutState = (
    previous: DesignerHeaderLayoutMemoState,
    next: DesignerHeaderLayoutMemoState,
): boolean => (
    previous.layoutBusy === next.layoutBusy
    && previous.lastDomainStrategy === next.lastDomainStrategy
    && previous.lastDomainDirection === next.lastDomainDirection
    && previous.lastNodeLayout === next.lastNodeLayout
);
