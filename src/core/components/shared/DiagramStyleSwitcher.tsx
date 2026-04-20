import React from 'react';
import { diagramStyleManager } from './DiagramStyleManager';
import { useDiagramStylePreset_v2 } from '../../hooks/useDiagramStylePreset_v2';

interface Props {
  size?: 'sm' | 'md';
}

export const DiagramStyleSwitcher: React.FC<Props> = ({ size = 'md' }) => {
  const preset = useDiagramStylePreset_v2();
  const presets = diagramStyleManager.getPresets();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPreset = e.target.value;
    diagramStyleManager.setPreset(newPreset);
  };

  const fontSize = size === 'sm' ? 14 : 16;
  const padding = size === 'sm' ? '6px 8px' : '8px 10px';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>

      <select
        value={preset.name}
        onChange={handleChange}
        style={{
          padding,
          fontSize,
          borderRadius: 6,
          border: '1px solid #ddd',
          background: '#fff',
        }}
      >
        {presets.map((p) => (
          <option key={p.name} value={p.name}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default DiagramStyleSwitcher;
