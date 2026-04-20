import React, { useState } from 'react';
import { themePresets } from '@/core';
import type { ThemePreset } from '@/core';
import { parseColorToRgb, adjustSaturationAndLightness, toRgba } from '@/core';
import { ThemeColorUtil } from '@/core';

/**
 * 主题颜色对比测试页面
 * 用于直观对比深色主题和浅色主题中不同域的节点边框和背景色差异
 */
const ThemeColorComparison: React.FC = () => {
  const [currentThemeId, setCurrentThemeId] = useState<string>('dark');

  /**
   * @function getPresetById
   * @description 根据主题ID获取对应的主题预设，若未找到则回退到第一个预设或深色主题。
   * @param id 主题ID（如 'dark'、'light'、'ocean' 等）
   * @returns ThemePreset 主题预设对象
   */
  const getPresetById = (id: string): ThemePreset => {
    return (
      themePresets.find(p => p.id === id) ||
      themePresets.find(p => p.id === 'dark') ||
      themePresets[0]
    );
  };

  /**
   * 函数级注释：computeDisplayMainColor
   * 说明：从主题域主色生成“显示主色”，深色模式提升饱和度并降低亮度，浅色模式轻微提亮。
   * @param main 原始主色
   * @param isDark 是否深色模式
   * @returns 调整后的主色（十六进制）
   */
  const computeDisplayMainColor = (main: string, isDark: boolean): string => {
    const rgb = parseColorToRgb(main);
    const adjusted = adjustSaturationAndLightness(rgb, isDark ? 0.28 : 0.12, isDark ? -0.08 : 0.06);
    return ThemeColorUtil.rgbToHex(adjusted.r, adjusted.g, adjusted.b);
  };

  /**
   * 函数级注释：computeDisplayShadow
   * 说明：从主色生成柔和阴影色，深色模式提高不透明度，浅色模式降低不透明度；支持传入默认阴影作为回退。
   * @param main 原始主色
   * @param isDark 是否深色模式
   * @param defaultShadow 主题定义的默认阴影（可选）
   * @returns 适用于 box-shadow 的 rgba 字符串
   */
  const computeDisplayShadow = (main: string, isDark: boolean, defaultShadow?: string): string => {
    const rgb = parseColorToRgb(main);
    const adjusted = adjustSaturationAndLightness(rgb, isDark ? 0.28 : 0.12, isDark ? -0.08 : 0.06);
    const alpha = isDark ? 0.35 : 0.18;
    const tinted = toRgba(adjusted, alpha);
    return tinted || defaultShadow || (isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)');
  };

  /**
   * @function handleThemeChange
   * @description 下拉框变更事件，更新当前选择的主题ID。
   * @param e 选择事件对象
   */
  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentThemeId(e.target.value);
  };

  const selectedPreset = getPresetById(currentThemeId);
  const theme = selectedPreset.theme;
  
  // 添加控制台日志来显示实际的颜色值
  React.useEffect(() => {
    
    // 对比几个关键域的颜色差异
    const sampleDomains = ['frontend', 'backend', 'middleware', 'database'];
    sampleDomains.forEach(domain => {
      const colors = theme.diagram?.domains?.[domain];
      if (colors) {
      }
    });
  }, [currentThemeId, selectedPreset.id, theme.diagram?.domains]);
  
  // 获取所有域的定义
  const domains = Object.keys(theme.diagram?.domains || {});
  
  /**
   * @function getThemeOptions
   * @description 生成下拉框选项列表，显示所有预设主题名称。
   * @returns JSX.Element[] 选项节点数组
   */
  const getThemeOptions = () => {
    return themePresets.map(preset => (
      <option key={preset.id} value={preset.id}>{preset.name}</option>
    ));
  };
  
  return (
    <div style={{ padding: '20px', backgroundColor: theme.mode === 'dark' ? '#1a1a1a' : '#ffffff', height: '100vh', overflowY: 'auto' }}>
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h1 style={{ color: theme.mode === 'dark' ? '#ffffff' : '#000000' }}>
          主题颜色对比测试：{selectedPreset.name}
        </h1>
        <div style={{ marginTop: '12px' }}>
          <label htmlFor="themeSelect" style={{ marginRight: '8px', color: theme.mode === 'dark' ? '#ffffff' : '#000000' }}>选择主题：</label>
          <select
            id="themeSelect"
            value={currentThemeId}
            onChange={handleThemeChange}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #d9d9d9',
              backgroundColor: theme.mode === 'dark' ? '#2a2a2a' : '#ffffff',
              color: theme.mode === 'dark' ? '#ffffff' : '#000000'
            }}
          >
            {getThemeOptions()}
          </select>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        {domains.map(domain => {
          const domainColors = theme.diagram?.domains?.[domain];
          if (!domainColors) return null;
          const isDark = theme.mode === 'dark';
          const displayMain = computeDisplayMainColor(domainColors.main, isDark);
          const displayShadow = computeDisplayShadow(domainColors.main, isDark, domainColors.shadow);
          
          return (
            <div 
              key={domain}
              style={{
                padding: '20px',
                borderRadius: '12px',
                border: `3px solid ${displayMain}`,
                backgroundColor: domainColors.background,
                boxShadow: `0 4px 12px ${displayShadow}`
              }}
            >
              <h3 style={{ 
                color: domainColors.text, 
                margin: '0 0 15px 0',
                fontSize: '18px',
                fontWeight: 'bold'
              }}>
                {domain.toUpperCase()}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div 
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '4px',
                      backgroundColor: displayMain,
                      border: `1px solid ${domainColors.border}`
                    }}
                  />
                  <span style={{ color: domainColors.text, fontSize: '14px' }}>
                    主色: {domainColors.main}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div 
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '4px',
                      backgroundColor: domainColors.border,
                      border: `1px solid ${domainColors.text}`
                    }}
                  />
                  <span style={{ color: domainColors.text, fontSize: '14px' }}>
                    边框: {domainColors.border}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div 
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '4px',
                      backgroundColor: domainColors.background,
                      border: `1px solid ${domainColors.border}`
                    }}
                  />
                  <span style={{ color: domainColors.text, fontSize: '14px' }}>
                    背景: {domainColors.background}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div 
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '4px',
                      backgroundColor: domainColors.light,
                      border: `1px solid ${domainColors.border}`
                    }}
                  />
                  <span style={{ color: domainColors.text, fontSize: '14px' }}>
                    浅色: {domainColors.light}
                  </span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div 
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '4px',
                      backgroundColor: domainColors.text,
                      border: `1px solid ${domainColors.main}`
                    }}
                  />
                  <span style={{ color: domainColors.text, fontSize: '14px' }}>
                    文本: {domainColors.text}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: theme.mode === 'dark' ? '#2a2a2a' : '#f5f5f5', borderRadius: '8px' }}>
        <h3 style={{ color: theme.mode === 'dark' ? '#ffffff' : '#000000' }}>主题概览</h3>
        <div style={{ color: theme.mode === 'dark' ? '#cccccc' : '#666666', lineHeight: '1.6' }}>
          <p><strong>深色主题特点：</strong></p>
          <ul>
            <li>背景色普遍较深（如 #0F2925, #0F1A2E）</li>
            <li>边框色相对明亮，形成鲜明对比</li>
            <li>文本色统一为浅色（#E6F1FF），确保可读性</li>
          </ul>
          <p><strong>浅色主题特点：</strong></p>
          <ul>
            <li>背景色普遍较浅（如 #F0FDFA, #EBF8FF）</li>
            <li>边框色与主色相近，更加协调</li>
            <li>文本色根据域的不同而变化，保持对比度</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ThemeColorComparison;
