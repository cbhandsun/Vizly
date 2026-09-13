import { useTranslation } from 'react-i18next';
import type { ConnectionValidationResult } from '../../types/connection';

const connectionValidationMessageKey = (validation: ConnectionValidationResult): string => (
    `designer.connectionValidation.${validation.code}`
);

export const ConnectionValidationStatus = ({
    validation,
}: {
    validation: ConnectionValidationResult | null;
}) => {
    const { t } = useTranslation();

    if (!validation || validation.valid) return null;

    const message = t(connectionValidationMessageKey(validation), {
        defaultValue: validation.message,
        ...(validation.details ?? {}),
    });

    return (
        <div
            className="connection-validation-status"
            data-validation-code={validation.code}
            role="status"
            aria-live="polite"
        >
            {message}
        </div>
    );
};
