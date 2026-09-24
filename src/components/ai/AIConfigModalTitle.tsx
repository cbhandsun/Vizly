import { forwardRef } from 'react';
import Button from 'antd/es/button';
import { CloseOutlined } from '@ant-design/icons';

interface AIConfigModalTitleProps {
    title: string;
    closeLabel: string;
    onClose: () => void;
}

export const AIConfigModalTitle = forwardRef<HTMLButtonElement, AIConfigModalTitleProps>(({
    title,
    closeLabel,
    onClose,
}, ref) => (
    <div className="ai-config-modal-title">
        <span>{title}</span>
        <Button
            ref={ref}
            type="text"
            className="ai-config-modal-close"
            icon={<CloseOutlined />}
            aria-label={closeLabel}
            onClick={onClose}
        />
    </div>
));

AIConfigModalTitle.displayName = 'AIConfigModalTitle';
