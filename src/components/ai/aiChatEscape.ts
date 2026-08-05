import { shouldPreserveParentDialogOnEscape } from '@/core/components/ui/dialogEscapeLayer';

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
