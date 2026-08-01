import { DiagramJsonImportError } from '@/core/utils/diagramJsonImport';

export type JsonValidationReasonKey =
    | 'designer.flowchart.invalidJsonSyntax'
    | 'designer.flowchart.invalidJsonTooLarge'
    | 'designer.flowchart.invalidJsonUnknownReason';

export const getJsonValidationReasonKey = (error: unknown): JsonValidationReasonKey => {
    if (error instanceof DiagramJsonImportError) {
        return error.code === 'invalid-json'
            ? 'designer.flowchart.invalidJsonSyntax'
            : 'designer.flowchart.invalidJsonTooLarge';
    }
    return 'designer.flowchart.invalidJsonUnknownReason';
};
