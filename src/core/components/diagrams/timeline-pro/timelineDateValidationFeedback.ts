const TIMELINE_DATE_VALIDATION_MESSAGE_KEY = 'timeline-property-date-validation';

export interface TimelineDateValidationMessage {
    key: string;
    content: string;
}

export const createTimelineDateValidationMessage = (
    content: string,
): TimelineDateValidationMessage => ({
    key: TIMELINE_DATE_VALIDATION_MESSAGE_KEY,
    content,
});
