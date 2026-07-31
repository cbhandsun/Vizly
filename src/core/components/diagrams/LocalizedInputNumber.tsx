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
    ...inputProps
}) => {
    const rootRef = React.useRef<HTMLSpanElement>(null);

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

    return (
        <span ref={rootRef} style={{ display: 'inline-block', width: '100%' }}>
            <InputNumber
                {...inputProps}
                controls={LOCALIZED_NUMBER_CONTROLS}
            />
        </span>
    );
};
