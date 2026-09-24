import { shouldPreserveParentDialogOnEscape } from '@vizly/core/react-utils';

interface AIChatKeyEvent {
    key: string;
    target: EventTarget | null;
}

export const shouldCloseAIChatOnKeyDown = (
    event: AIChatKeyEvent,
    parentDialog?: HTMLElement | null,
): boolean => (
    event.key === 'Escape'
    && !shouldPreserveParentDialogOnEscape(event.target, parentDialog)
);
