export interface DiagramViewerEditingState {
  isPresentationMode: boolean;
  isReadonly: boolean;
}

export const canMutateDiagramDocument = ({
  isPresentationMode,
  isReadonly,
}: DiagramViewerEditingState): boolean => !isReadonly && !isPresentationMode;
