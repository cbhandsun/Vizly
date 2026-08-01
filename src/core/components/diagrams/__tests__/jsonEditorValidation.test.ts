import { describe, expect, it } from 'vitest';

import { DiagramJsonImportError } from '@/core/utils/diagramJsonImport';
import { getJsonValidationReasonKey } from '../jsonEditorValidation';

describe('getJsonValidationReasonKey', () => {
    it('maps syntax and size boundary failures to safe localized reasons', () => {
        expect(getJsonValidationReasonKey(
            new DiagramJsonImportError('invalid-json', 'sensitive parser detail'),
        )).toBe('designer.flowchart.invalidJsonSyntax');
        expect(getJsonValidationReasonKey(
            new DiagramJsonImportError('too-large', 'sensitive size detail'),
        )).toBe('designer.flowchart.invalidJsonTooLarge');
    });

    it('does not expose unexpected error messages or non-error values', () => {
        expect(getJsonValidationReasonKey(new Error('token=secret')))
            .toBe('designer.flowchart.invalidJsonUnknownReason');
        expect(getJsonValidationReasonKey(null))
            .toBe('designer.flowchart.invalidJsonUnknownReason');
        expect(getJsonValidationReasonKey({ message: 'user content' }))
            .toBe('designer.flowchart.invalidJsonUnknownReason');
    });
});
