import React from 'react';

type ProTimelineSwitchControlProps = {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

export const ProTimelineSwitchControl: React.FC<ProTimelineSwitchControlProps> = ({
  ariaLabel,
  checked,
  disabled = false,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-label={ariaLabel}
    aria-checked={checked}
    className="pro-timeline-switch-control"
    disabled={disabled}
    onClick={onChange}
  >
    <span className="pro-timeline-switch-control__track" aria-hidden="true">
      <span className="pro-timeline-switch-control__thumb" />
    </span>
  </button>
);
