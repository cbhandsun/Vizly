import React, { useState } from 'react';
import { themePresets } from '@/core/themes/presets';
import type { ThemePreset, ThemeColor } from '@/core/themes/types/ThemeTypes';
import { parseColorToRgb, adjustSaturationAndLightness, toRgba } from '@/core/utils/colorUtils';
import { ThemeColorUtil } from '@/core/themes/ThemeUtils';

/**
 * 主题并排对比测试页面
 * 同时显示左右两侧主题的节点样式对比，支持从所有预设中选择
 */
const ThemeSideBySideComparison: React.FC = () => {
  const [leftThemeId, setLeftThemeId] = useState<string>('dark');
  const [rightThemeId, setRightThemeId] = useState<string>('light');

  /**
   * @function getPresetById
   * @description 根据主题ID获取对应预设；优先返回匹配项，否则回退到内置深色或第一个预设。
   * @param id 主题ID
   * @returns ThemePreset
   */
  const getPresetById = (id: string): ThemePreset => {
    return (
      themePresets.find(p => p.id === id) ||
      themePresets.find(p => p.id === 'dark') ||
      themePresets[0]
    );
  };

  const leftPreset = getPresetById(leftThemeId);
  const rightPreset = getPresetById(rightThemeId);

  /**
   * @function getCommonDomains
   * @description 计算两侧主题共有的域键集合，保证并排展示一致性。
   * @param a 左侧主题预设
   * @param b 右侧主题预设
   * @returns string[] 共有域键数组
   */
  const getCommonDomains = (a: ThemePreset, b: ThemePreset): string[] => {
    const aKeys = Object.keys(a.theme.diagram?.domains || {});
    const bKeys = Object.keys(b.theme.diagram?.domains || {});
    const setB = new Set(bKeys);
    return aKeys.filter(k => setB.has(k));
  };

  const sampleDomains = getCommonDomains(leftPreset, rightPreset);

  /**
   * 函数级注释：computeDisplayMainColor
   * 说明：基于域的原始主色生成显示主色，以增强深/浅模式差异。
   * @param main 原始主色
   * @param dark 是否深色模式
   * @returns 调整后的主色（十六进制）
   */
  const computeDisplayMainColor = (main: string, dark?: boolean): string => {
    const rgb = parseColorToRgb(main);
    const adjusted = adjustSaturationAndLightness(rgb, dark ? 0.28 : 0.12, dark ? -0.08 : 0.06);
    return ThemeColorUtil.rgbToHex(adjusted.r, adjusted.g, adjusted.b);
  };

  /**
   * 函数级注释：computeDisplayShadow
   * 说明：基于主色生成柔和阴影色，深色提高不透明度，浅色降低不透明度。
   * @param main 原始主色
   * @param dark 是否深色模式
   * @param defaultShadow 主题定义的默认阴影（可选）
   * @returns 适用于 box-shadow 的 rgba 字符串
   */
  const computeDisplayShadow = (main: string, dark?: boolean, defaultShadow?: string): string => {
    const rgb = parseColorToRgb(main);
    const adjusted = adjustSaturationAndLightness(rgb, dark ? 0.28 : 0.12, dark ? -0.08 : 0.06);
    const alpha = dark ? 0.35 : 0.18;
    const tinted = toRgba(adjusted, alpha);
    return tinted || defaultShadow || (dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.1)');
  };

  /**
   * @function DomainCard
   * @description 域卡片展示组件，显示背景、边框和文本色示例。
   * @param props.title 卡片标题（域名）
   * @param props.colors 主题域颜色对象
   * @param props.dark 是否深色风格，用于轻微调整阴影与说明色
   */
  /**
   * 函数级注释：DomainCard
   * 说明：域卡片容器的视觉强调以域主色（colors.main）为准，阴影使用域的 shadow 值，
   *      从而当主色变化时卡片样式也随之变化，避免“值变了样式不变”的感知问题。
   */
  const DomainCard: React.FC<{ title: string; colors: ThemeColor; dark?: boolean }> = ({ title, colors, dark }) => {
    const displayMain = computeDisplayMainColor(colors.main, dark);
    const displayShadow = computeDisplayShadow(colors.main, dark, colors.shadow);
    return (
    <div style={{
      padding: '20px',
      borderRadius: '16px',
      border: `3px solid ${displayMain}`,
      backgroundColor: colors.background,
      boxShadow: `0 8px 24px ${displayShadow}`
    }}>
      <h3 style={{ color: colors.text, margin: '0 0 15px 0', fontSize: '20px', fontWeight: 'bold' }}>{title.toUpperCase()}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '4px',
              backgroundColor: displayMain,
              border: `1px solid ${colors.border}`
            }}
          />
          <span style={{ color: colors.text, fontSize: '14px' }}>
            主色: {colors.main}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '4px',
              backgroundColor: colors.border,
              border: `1px solid ${colors.text}`
            }}
          />
          <span style={{ color: colors.text, fontSize: '14px' }}>
            边框: {colors.border}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '4px',
              backgroundColor: colors.background,
              border: `1px solid ${colors.border}`
            }}
          />
          <span style={{ color: colors.text, fontSize: '14px' }}>
            背景: {colors.background}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '4px',
              backgroundColor: colors.light,
              border: `1px solid ${colors.border}`
            }}
          />
          <span style={{ color: colors.text, fontSize: '14px' }}>
            浅色: {colors.light}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '4px',
              backgroundColor: colors.text,
              border: `1px solid ${colors.main}`
            }}
          />
          <span style={{ color: colors.text, fontSize: '14px' }}>
            文本: {colors.text}
          </span>
        </div>
      </div>
    </div>
  );
  } 
  
  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f0f0', height: '100vh', overflowY: 'auto' }}>
      <div style={{ marginBottom: '30px', textAlign: 'center' }}>
        <h1 style={{ color: '#333', marginBottom: '10px' }}>
          主题颜色并排对比测试
        </h1>
        <p style={{ color: '#666', fontSize: '16px', marginBottom: '12px' }}>
          从所有预设中选择左右两侧主题进行对比
        </p>
        <div style={{ display: 'inline-flex', gap: '12px' }}>
          <div>
            <label htmlFor="leftTheme" style={{ marginRight: '6px', color: '#333' }}>左侧主题：</label>
            <select id="leftTheme" value={leftThemeId} onChange={e => setLeftThemeId(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
              {themePresets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="rightTheme" style={{ marginRight: '6px', color: '#333' }}>右侧主题：</label>
            <select id="rightTheme" value={rightThemeId} onChange={e => setRightThemeId(e.target.value)} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
              {themePresets.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* 左侧主题列 */}
        <div style={{ backgroundColor: leftPreset.theme.mode === 'dark' ? '#1a1a1a' : '#ffffff', padding: '30px', borderRadius: '12px', boxShadow: leftPreset.theme.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: leftPreset.theme.mode === 'dark' ? '#fff' : '#333', textAlign: 'center', marginBottom: '30px' }}>{leftPreset.name}</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            {sampleDomains.map(domain => {
              const colors = leftPreset.theme.diagram?.domains?.[domain];
              if (!colors) return null;
              
              return (<DomainCard key={`left-${domain}`} title={domain} colors={colors as ThemeColor} dark={leftPreset.theme.mode === 'dark'} />);
            })}
          </div>
        </div>
        
        {/* 右侧主题列 */}
        <div style={{ backgroundColor: rightPreset.theme.mode === 'dark' ? '#1a1a1a' : '#ffffff', padding: '30px', borderRadius: '12px', boxShadow: rightPreset.theme.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.1)' }}>
          <h2 style={{ color: rightPreset.theme.mode === 'dark' ? '#fff' : '#333', textAlign: 'center', marginBottom: '30px' }}>{rightPreset.name}</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            {sampleDomains.map(domain => {
              const colors = rightPreset.theme.diagram?.domains?.[domain];
              if (!colors) return null;
              
              return (<DomainCard key={`right-${domain}`} title={domain} colors={colors as ThemeColor} dark={rightPreset.theme.mode === 'dark'} />);
            })}
          </div>
        </div>
      </div>
      
      {/* 颜色对比分析 */}
      <div style={{ 
        marginTop: '40px', 
        padding: '30px', 
        backgroundColor: '#ffffff', 
        borderRadius: '12px', 
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        maxWidth: '1400px',
        marginLeft: 'auto',
        marginRight: 'auto'
      }}>
        <h2 style={{ color: '#333', marginBottom: '20px' }}>颜色对比分析（共有域）</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {sampleDomains.map(domain => {
            const leftColors = leftPreset.theme.diagram?.domains?.[domain];
            const rightColors = rightPreset.theme.diagram?.domains?.[domain];
            if (!leftColors || !rightColors) return null;
            
            return (
              <div key={`analysis-${domain}`} style={{
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #dee2e6'
              }}>
                <h3 style={{ color: '#495057', marginBottom: '15px' }}>{domain.toUpperCase()}</h3>
                
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '15px' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '8px',
                      backgroundColor: leftColors.background,
                      border: `2px solid ${leftColors.border}`,
                      marginBottom: '8px'
                    }} />
                    <div style={{ fontSize: '12px', color: '#6c757d' }}>{leftPreset.name}</div>
                  </div>
                  
                  <div style={{ fontSize: '24px', color: '#6c757d' }}>VS</div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '8px',
                      backgroundColor: rightColors.background,
                      border: `2px solid ${rightColors.border}`,
                      marginBottom: '8px'
                    }} />
                    <div style={{ fontSize: '12px', color: '#6c757d' }}>{rightPreset.name}</div>
                  </div>
                </div>
                
                <div style={{ fontSize: '14px', color: '#6c757d', lineHeight: '1.6' }}>
                  <div><strong>背景对比：</strong></div>
                  <div>{leftPreset.name}: {leftColors.background}</div>
                  <div>{rightPreset.name}: {rightColors.background}</div>
                  <div style={{ marginTop: '8px' }}><strong>边框对比：</strong></div>
                  <div>{leftPreset.name}: {leftColors.border}</div>
                  <div>{rightPreset.name}: {rightColors.border}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ThemeSideBySideComparison;
