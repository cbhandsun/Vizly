import type { StandardDiagramData } from '@/core/models/DiagramModels';

export interface CloudStorageManagerModalProps {
    open: boolean;
    onCancel: () => void;
    onSelect?: (data: StandardDiagramData) => void;
    /** Opens a cloud diagram in the designer after standard-data conversion. */
    onOpenInDesigner?: (data: StandardDiagramData) => void;
}
