import React, { forwardRef, useLayoutEffect, useRef, useState } from 'react';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { Input, type InputRef } from 'antd';

type StorageSecretInputProps = Omit<React.ComponentProps<typeof Input>, 'suffix' | 'type'> & {
    concealTitle: string;
    revealTitle: string;
    visibilityLabel: string;
};

export const StorageSecretInput = forwardRef<InputRef, StorageSecretInputProps>(({
    concealTitle,
    revealTitle,
    visibilityLabel,
    ...inputProps
}, ref) => {
    const [visible, setVisible] = useState(false);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const restoreToggleFocusRef = useRef(false);
    const actionTitle = visible ? concealTitle : revealTitle;

    useLayoutEffect(() => {
        if (!restoreToggleFocusRef.current) return;
        restoreToggleFocusRef.current = false;
        toggleRef.current?.focus({ preventScroll: true });
    }, [visible]);

    const toggleVisibility = () => {
        restoreToggleFocusRef.current = document.activeElement === toggleRef.current;
        setVisible(current => !current);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggleVisibility();
    };

    return (
        <Input
            {...inputProps}
            ref={ref}
            type={visible ? 'text' : 'password'}
            suffix={(
                <button
                    ref={toggleRef}
                    type="button"
                    className="storage-secret-visibility"
                    aria-label={visibilityLabel}
                    aria-pressed={visible}
                    title={actionTitle}
                    onMouseDown={event => event.stopPropagation()}
                    onKeyDown={handleKeyDown}
                    onClick={toggleVisibility}
                >
                    {visible
                        ? <EyeOutlined aria-hidden="true" />
                        : <EyeInvisibleOutlined aria-hidden="true" />}
                </button>
            )}
        />
    );
});

StorageSecretInput.displayName = 'StorageSecretInput';
