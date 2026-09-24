import type { StandardDiagramData } from '@vizly/core/types';

export interface CloudStorageManagerModalProps {
    open: boolean;
    onCancel: () => void;
    onSelect?: (data: StandardDiagramData) => void;
    /** Opens a cloud diagram in the designer after standard-data conversion. */
    onOpenInDesigner?: (data: StandardDiagramData) => void;
}
