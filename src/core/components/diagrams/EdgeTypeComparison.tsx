import React, { useState, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { BaseDiagramComponent } from './base/BaseDiagramComponent';

/**
 * EdgeTypeComparison 组件（函数级注释）
 *
 * 职责：
 * - 演示原生与智能三种路径类型（直线/阶梯/贝塞尔）的对比效果。
 * - 注入智能避障参数（corridor 过滤、padding、gridRatio、curvature）。
 * - 统一“上出上入”把手以减少在障碍附近的回撤折返（适用于 straight/bezier/step）。
 *
 * 关键优化：
 * - 对 smart-straight 与 smart-bezier 也采用顶部把手，避免贴近障碍后下探再折返。
 * - 提高 gridRatio（直线:1.5、贝塞尔:1.45、阶梯:1.35），减少近栅格折返。
 * - 增大 obstaclePadding=28，降低贴边拐弯几率；贝塞尔曲率提高至 0.34，拐角更自然。
 */
const EdgeTypeComparison: React.FC = () => {
  const [edgeType, setEdgeType] = useState<'straight' | 'step' | 'bezier'>('bezier');
  const [comparisonMode, setComparisonMode] = useState<'single' | 'side-by-side'>('side-by-side');

  // 创建测试节点 - 根据对比模式创建不同的布局
  const testNodes: Node[] = useMemo(() => {
    if (comparisonMode === 'side-by-side') {
      // 并排对比模式：左侧普通连线，右侧智能连线
      return [
        // 左侧区域 - 普通连线测试
        {
          id: 'native-source',
          position: { x: 50, y: 100 },
          // 统一：节点文本使用 description 字段
          data: { description: '源节点A\n(普通连线)' },
          type: 'custom',
          style: {
            width: 120,
            height: 60,
            backgroundColor: '#e3f2fd',
            border: '2px solid #1976d2'
          }
        },
        {
          id: 'native-obstacle1',
          position: { x: 200, y: 80 },
          data: { description: '障碍节点1' },
          type: 'custom',
          style: {
            width: 100,
            height: 80,
            backgroundColor: '#ffebee',
            border: '2px solid #d32f2f'
          }
        },
        {
          id: 'native-obstacle2',
          position: { x: 200, y: 180 },
          data: { description: '障碍节点2' },
          type: 'custom',
          style: {
            width: 100,
            height: 80,
            backgroundColor: '#ffebee',
            border: '2px solid #d32f2f'
          }
        },
        {
          id: 'native-target',
          position: { x: 350, y: 140 },
          data: { description: '目标节点A\n(普通连线)' },
          type: 'custom',
          style: {
            width: 120,
            height: 60,
            backgroundColor: '#e8f5e8',
            border: '2px solid #388e3c'
          }
        },

        // 右侧区域 - 智能连线测试
        {
          id: 'smart-source',
          position: { x: 550, y: 100 },
          data: { description: '源节点B\n(高级智能)' },
          type: 'custom',
          style: {
            width: 120,
            height: 60,
            backgroundColor: '#e3f2fd',
            border: '2px solid #1976d2'
          }
        },
        {
          id: 'smart-obstacle1',
          position: { x: 700, y: 80 },
          data: { description: '障碍节点3' },
          type: 'custom',
          style: {
            width: 100,
            height: 80,
            backgroundColor: '#ffebee',
            border: '2px solid #d32f2f'
          }
        },
        {
          id: 'smart-obstacle2',
          position: { x: 700, y: 180 },
          data: { description: '障碍节点4' },
          type: 'custom',
          style: {
            width: 100,
            height: 80,
            backgroundColor: '#ffebee',
            border: '2px solid #d32f2f'
          }
        },
        {
          id: 'smart-target',
          position: { x: 850, y: 140 },
          data: { description: '目标节点B\n(高级智能)' },
          type: 'custom',
          style: {
            width: 120,
            height: 60,
            backgroundColor: '#e8f5e8',
            border: '2px solid #388e3c'
          }
        },

        // 分隔线标识
        {
          id: 'separator',
          position: { x: 475, y: 50 },
          data: { description: '分隔线' },
          type: 'custom',
          style: {
            width: 2,
            height: 250,
            backgroundColor: '#666',
            border: 'none',
            pointerEvents: 'none'
          }
        }
      ];
    } else {
      // 单一模式：原有的复杂布局
      return [
        {
          id: 'source',
          type: 'custom',
          position: { x: 50, y: 150 },
          data: {
            description: '源节点A',
            domain: 'fe'
          }
        },
        {
          id: 'target',
          type: 'custom',
          position: { x: 650, y: 150 },
          data: {
            description: '目标节点A',
            domain: 'be'
          }
        },
        {
          id: 'obstacle1',
          type: 'custom',
          position: { x: 250, y: 120 },
          data: {
            label: '障碍节点1',
            domain: 'mid'
          }
        },
        {
          id: 'obstacle2',
          type: 'custom',
          position: { x: 350, y: 180 },
          data: {
            label: '障碍节点2',
            domain: 'mid'
          }
        },
        {
          id: 'obstacle3',
          type: 'custom',
          position: { x: 450, y: 120 },
          data: {
            label: '障碍节点3',
            domain: 'ch'
          }
        },
        {
          id: 'source2',
          type: 'custom',
          position: { x: 50, y: 300 },
          data: {
            label: '源节点B',
            domain: 'fe'
          }
        },
        {
          id: 'target2',
          type: 'custom',
          position: { x: 650, y: 50 },
          data: {
            label: '目标节点B',
            domain: 'be'
          }
        },
        {
          id: 'center-obstacle',
          type: 'custom',
          position: { x: 350, y: 150 },
          data: {
            label: '中心障碍',
            domain: 'ch'
          }
        }
      ];
    }
  }, [comparisonMode]);

  // 创建测试连线 - 根据对比模式创建不同的连线
  /**
   * 根据选择的连线类型与对比模式生成测试连线集合（函数级注释）
   * - 并排模式：左侧为原生连线，右侧为智能连线
   * - 修复点：原生连线的渲染组件依赖 data.pathType 而非 type，本次显式写入 data.pathType 以确保形态随选择改变
   * - 标签处理：原生连线使用 data.label，智能连线保持 label 以便 SmartEdgeLabels 全局渲染
   */
  const testEdges: Edge[] = useMemo(() => {
    if (comparisonMode === 'side-by-side') {
      // 并排对比模式：左侧普通连线，右侧智能连线
      return [
        // 左侧普通连线 - 直接连接，会穿过障碍节点
        {
          id: 'native-main',
          source: 'native-source',
          target: 'native-target',
          // 原生类型：straight | step | bezier
          type: edgeType,
          style: {
            stroke: '#FF5722',
            strokeWidth: 3,
            strokeDasharray: '0'
          },
          // 注意：AdvancedCustomEdge/CustomEdge 基于 data.pathType 决定路径形态
          // 为确保切换生效，需同步写入 data.pathType
          data: {
            pathType: edgeType, // 与选择一致：'straight' | 'step' | 'bezier'
            label: `普通${edgeType === 'bezier' ? '贝塞尔' : edgeType === 'step' ? '阶梯' : '直线'}连线`,
            pathOptions: edgeType === 'step' ? { borderRadius: 8 } : undefined
          },
          // 同时保留原生 label 风格设置（供 React Flow 原生渲染使用，CustomEdge优先 data.label）
          labelStyle: {
            fontSize: '12px',
            fontWeight: 'bold',
            fill: '#FF5722'
          },
          labelBgStyle: {
            fill: 'rgba(255, 87, 34, 0.1)',
            fillOpacity: 0.8
          }
        },

        // 右侧智能连线 - 具有避障功能
        {
          id: 'smart-main',
          source: 'smart-source',
          target: 'smart-target',
          sourceHandle: 'r', // 显式指定右侧把手
          targetHandle: 'l', // 显式指定左侧把手
          // 所有智能类型统一采用“上出上入”，减少障碍附近的回撤折返
          type: edgeType === 'step' ? 'advanced-smart-step' : edgeType === 'bezier' ? 'advanced-smart-bezier' : 'advanced-smart-straight',
          style: {
            stroke: '#4CAF50',
            strokeWidth: 3,
            strokeDasharray: '0'
          },
          /**
           * 智能边数据配置（函数级注释）
           * 目的：避免避障后的“回折”与硬直角，提升观感与可读性。
           * 做法：
           * - 限定避障范围为“通道”（corridor），减少远处无关障碍的干扰；
           * - 设置 obstaclePadding 提升与障碍的安全间距；
           * - 为 step 边设置较大的 borderRadius，使转折圆滑；
           * - 为 bezier 边设置 curvature，增强平滑度；
           * - 设置 gridRatio 稍大，让路径网格更稀疏，避免近处折返。
           */
          data: {
            layoutDirection: 'LR',
            pathType: edgeType === 'step' ? 'advanced-smart-step' : edgeType === 'bezier' ? 'advanced-smart-bezier' : 'advanced-smart-straight',
            obstacleScope: 'corridor',
            obstacleScopePadding: 140,
            obstaclePadding: 28,
            pathOptions: {
              gridRatio: edgeType === 'step' ? 1.35 : edgeType === 'bezier' ? 1.45 : 1.5,
              borderRadius: edgeType === 'step' ? 16 : undefined,
              curvature: edgeType === 'bezier' ? 0.34 : undefined,
            },
          },
          label: `高级智能${edgeType === 'bezier' ? '贝塞尔' : edgeType === 'step' ? '阶梯' : '直线'}`,
          labelStyle: {
            fontSize: '12px',
            fontWeight: 'bold',
            fill: '#4CAF50'
          },
          labelBgStyle: {
            fill: 'rgba(76, 175, 80, 0.1)',
            fillOpacity: 0.8
          }
        }
      ];
    } else {
      // 单一模式：根据当前选择的模式显示连线
      const smartType = edgeType === 'step' ? 'advanced-smart-step' : edgeType === 'bezier' ? 'advanced-smart-bezier' : 'advanced-smart-straight';

      return [
        {
          id: 'main-connection',
          source: 'source',
          target: 'target',
          type: smartType,
          style: { stroke: '#FF5722', strokeWidth: 3 },
          /**
           * 智能边数据（函数级注释）
           * 同步应用避障参数，避免出现硬折和近距离回折。
           */
          data: {
            pathType: smartType,
            obstacleScope: 'corridor',
            obstacleScopePadding: 140,
            obstaclePadding: 28,
            pathOptions: {
              gridRatio: edgeType === 'step' ? 1.35 : edgeType === 'bezier' ? 1.45 : 1.5,
              borderRadius: edgeType === 'step' ? 16 : undefined,
              curvature: edgeType === 'bezier' ? 0.34 : undefined,
            },
          },
          labelStyle: {
            fill: '#FF5722',
            fontWeight: 'bold',
            fontSize: '12px'
          }
        },
        {
          id: 'cross-connection',
          source: 'source2',
          target: 'target2',
          type: smartType,
          style: { stroke: '#78909C', strokeWidth: 2, strokeDasharray: '5 5' },
          data: {
            pathType: smartType,
            obstacleScope: 'corridor',
            obstacleScopePadding: 140,
            obstaclePadding: 28,
            pathOptions: {
              gridRatio: edgeType === 'step' ? 1.35 : edgeType === 'bezier' ? 1.45 : 1.5,
              borderRadius: edgeType === 'step' ? 16 : undefined,
              curvature: edgeType === 'bezier' ? 0.34 : undefined,
            },
          },
          labelStyle: {
            fill: '#78909C',
            fontWeight: 'bold',
            fontSize: '12px'
          }
        },
        {
          id: 'obstacle-connection1',
          source: 'source',
          target: 'obstacle3',
          type: smartType,
          style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
          data: {
            pathType: smartType,
            obstacleScope: 'corridor',
            obstacleScopePadding: 140,
            obstaclePadding: 28,
            pathOptions: {
              gridRatio: edgeType === 'step' ? 1.35 : edgeType === 'bezier' ? 1.45 : 1.5,
              borderRadius: edgeType === 'step' ? 16 : undefined,
              curvature: edgeType === 'bezier' ? 0.34 : undefined,
            },
          },
          labelStyle: {
            fill: '#47CACC',
            fontWeight: 'bold',
            fontSize: '12px'
          }
        },
        {
          id: 'obstacle-connection2',
          source: 'obstacle1',
          target: 'target',
          type: smartType,
          style: { stroke: '#78909C', strokeWidth: 2, strokeDasharray: '5 5' },
          data: {
            pathType: smartType,
            obstacleScope: 'corridor',
            obstacleScopePadding: 140,
            obstaclePadding: 28,
            pathOptions: {
              gridRatio: edgeType === 'step' ? 1.35 : edgeType === 'bezier' ? 1.45 : 1.5,
              borderRadius: edgeType === 'step' ? 16 : undefined,
              curvature: edgeType === 'bezier' ? 0.34 : undefined,
            },
          },
          labelStyle: {
            fill: '#78909C',
            fontWeight: 'bold',
            fontSize: '12px'
          }
        },
        {
          id: 'complex-path',
          source: 'source2',
          target: 'obstacle2',
          type: smartType,
          style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
          data: {
            pathType: smartType,
            obstacleScope: 'corridor',
            obstacleScopePadding: 140,
            obstaclePadding: 28,
            pathOptions: {
              gridRatio: edgeType === 'step' ? 1.35 : edgeType === 'bezier' ? 1.45 : 1.5,
              borderRadius: edgeType === 'step' ? 16 : undefined,
              curvature: edgeType === 'bezier' ? 0.34 : undefined,
            },
          },
          labelStyle: {
            fill: '#47CACC',
            fontWeight: 'bold',
            fontSize: '12px'
          }
        }
      ];
    }
  }, [edgeType, comparisonMode]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 控制面板 */}
      <div style={{
        padding: '16px',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div>
          <label style={{ marginRight: '8px', fontWeight: '500' }}>连线类型:</label>
          <select
            value={edgeType}
            onChange={(e) => setEdgeType(e.target.value as 'straight' | 'step' | 'bezier')}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '14px'
            }}
          >
            <option value="straight">直线 (Straight)</option>
            <option value="step">阶梯线 (Step)</option>
            <option value="bezier">贝塞尔曲线 (Bezier)</option>
          </select>
        </div>

        <div>
          <label style={{ marginRight: '8px', fontWeight: '500' }}>对比模式:</label>
          <select
            value={comparisonMode}
            onChange={(e) => setComparisonMode(e.target.value as 'single' | 'side-by-side')}
            style={{
              padding: '6px 12px',
              borderRadius: '4px',
              border: '1px solid #ced4da',
              fontSize: '14px'
            }}
          >
            <option value="side-by-side">并排对比</option>
            <option value="single">单一模式</option>
          </select>
        </div>

        {/* 说明文字 */}
        <div style={{
          marginLeft: 'auto',
          fontSize: '14px',
          color: '#666',
          fontStyle: 'italic'
        }}>
          {comparisonMode === 'side-by-side'
            ? `对比: 原生连线 (Native) vs 高级智能连线 (Advanced Smart)`
            : `当前显示: 高级智能${edgeType === 'bezier' ? '贝塞尔' : edgeType === 'step' ? '阶梯' : '直线'}连线`
          }
        </div>
      </div>

      {/* 图表区域 */}
      <div style={{ flex: 1, position: 'relative' }}>
        {comparisonMode === 'side-by-side' && (
          <>
            {/* 区域标签 */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '50px',
              zIndex: 1000,
              backgroundColor: 'rgba(255, 87, 34, 0.1)',
              padding: '8px 16px',
              borderRadius: '20px',
              border: '2px solid #FF5722',
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#FF5722'
            }}>
              原生连线区域 (Native)
            </div>
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '50px',
              zIndex: 1000,
              backgroundColor: 'rgba(76, 175, 80, 0.1)',
              padding: '8px 16px',
              borderRadius: '20px',
              border: '2px solid #4CAF50',
              fontSize: '14px',
              fontWeight: 'bold',
              color: '#4CAF50'
            }}>
              高级智能连线 (Advanced Smart)
            </div>

            {/* 中央分隔线 */}
            <div style={{
              position: 'absolute',
              left: '50%',
              top: '0',
              bottom: '0',
              width: '2px',
              backgroundColor: '#ddd',
              zIndex: 999
            }} />
          </>
        )}

        <BaseDiagramComponent
          nodes={testNodes}
          edges={testEdges}
          title={`连线类型对比 - ${edgeType === 'bezier' ? '贝塞尔曲线' : edgeType === 'step' ? '阶梯线' : '直线'}`}
          edgeMode="native"
          interactionPreset="zoom"
          // 函数级注释：禁用组件内部的配置监听与后处理，防止混合连线类型被全局配置覆盖
          disablePostEdgeProcessing={true}
          enableSmartEdges={true}
        />
      </div>
    </div>
  );
};

export default EdgeTypeComparison;
