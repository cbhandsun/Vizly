import React from 'react';
import { InputNumber } from 'antd';

const LOCALIZED_NUMBER_CONTROLS = {
    upIcon: <span aria-hidden="true">+</span>,
    downIcon: <span aria-hidden="true">−</span>,
};

export type LocalizedInputNumberProps = Omit<
    React.ComponentProps<typeof InputNumber>,
    'controls'
> & {
    increaseLabel: string;
    decreaseLabel: string;
};

/**
 * rc-input-number hard-codes English handler labels and does not expose a
 * localization prop. Keep its native behavior, then name the generated
 * controls from the application's active locale.
 */
export const LocalizedInputNumber: React.FC<LocalizedInputNumberProps> = ({
    increaseLabel,
    decreaseLabel,
    onBlur,
    onPressEnter,
    ...inputProps
}) => {
    const rootRef = React.useRef<HTMLSpanElement>(null);
    const [inputRevision, resetDraft] = React.useReducer((revision: number) => revision + 1, 0);

    React.useEffect(() => {
        const root = rootRef.current;
        root?.querySelector<HTMLElement>(
            '.ant-input-number-action-up, .ant-input-number-handler-up',
        )
            ?.setAttribute('aria-label', increaseLabel);
        root?.querySelector<HTMLElement>(
            '.ant-input-number-action-down, .ant-input-number-handler-down',
        )
            ?.setAttribute('aria-label', decreaseLabel);
    }, [decreaseLabel, increaseLabel]);

    const handleBlur = React.useCallback((event: React.FocusEvent<HTMLInputElement>) => {
        onBlur?.(event);
        // rc-input-number keeps the user's raw draft when a controlled parent
        // normalizes it back to the same value. Remount after commit so the
        // visible field reflects the authoritative controlled value.
        resetDraft();
    }, [onBlur]);

    const handlePressEnter = React.useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        onPressEnter?.(event);
        event.currentTarget.blur();
    }, [onPressEnter]);

    return (
        <span ref={rootRef} style={{ display: 'inline-block', width: '100%' }}>
            <InputNumber
                key={inputRevision}
                {...inputProps}
                onBlur={handleBlur}
                onPressEnter={handlePressEnter}
                controls={LOCALIZED_NUMBER_CONTROLS}
            />
        </span>
    );
};
