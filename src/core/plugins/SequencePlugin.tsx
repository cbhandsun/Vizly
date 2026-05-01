import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  DiagramTypePlugin,
  PluginContext,
} from '../types/plugin';
import { LifelineNode } from '../components/custom-nodes/LifelineNode';
import { SequenceMessageEdge } from '../components/custom-edges/SequenceMessageEdge';
import { InteractionOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Tooltip, Divider, message } from 'antd';
import i18n from '@/i18n';
import { useTranslation } from 'react-i18next';
import { appMessage } from '@/core/utils/antdStaticBridge';


export class SequencePlugin implements DiagramTypePlugin {
  id = 'sequence-diagram';
  
  get name() {
    return i18n.t('plugins.sequence.title');
  }
  
  version = '1.0';

  parseData(_source: unknown) { return { nodes: [], edges: [] }; }
  serializeData(nodes: Node[], edges: Edge[]) { return { nodes, edges }; }

  getEmptyState() {
    return {
      nodes: [
        {
          id: 'user', type: 'lifeline', position: { x: 50, y: 50 },
          data: { label: 'User', type: 'actor' }
        },
        {
          id: 'gateway', type: 'lifeline', position: { x: 300, y: 50 },
          data: { label: 'API Gateway', type: 'system' }
        },
        {
          id: 'auth', type: 'lifeline', position: { x: 550, y: 50 },
          data: { label: 'Auth Service', type: 'system' }
        },
      ],
      edges: [
        { id: 'm1', source: 'user', target: 'gateway', label: 'Login(user, pass)', data: { type: 'sync' }, type: 'sequenceEdge' },
        { id: 'm2', source: 'gateway', target: 'auth', label: 'ValidateToken()', data: { type: 'sync' }, type: 'sequenceEdge' },
        { id: 'm3', source: 'auth', target: 'gateway', label: 'Success', data: { type: 'return' }, type: 'sequenceEdge' },
        { id: 'm4', source: 'gateway', target: 'user', label: '200 OK (Token)', data: { type: 'return' }, type: 'sequenceEdge' },
      ]
    };
  }

  getNodeTypes() {
    return {
      lifeline: LifelineNode,
    };
  }

  getEdgeTypes() {
    return {
      sequenceEdge: SequenceMessageEdge,
    };
  }

  onValidateConnection(connection: import('@xyflow/react').Connection, ctx: PluginContext): boolean {
    const { source, target } = connection;
    if (!source || !target || source === target) return false;
    
    // 时序图连接应主要发生在生命线之间
    const nodes = ctx.getNodes();
    const sourceNode = nodes.find(n => n.id === source);
    const targetNode = nodes.find(n => n.id === target);
    
    if (sourceNode?.type !== 'lifeline' || targetNode?.type !== 'lifeline') return false;

    return true;
  }

  contributeToolbar(ctx: PluginContext) {
      return <SequenceSmartToolbar ctx={ctx} />;
  }
}

// ====== 智能工具栏 ======
const SequenceSmartToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { setNodes, setEdges } = ctx;
    const { t } = useTranslation();

    const handleAutoLayout = () => {
        setNodes((nds) => {
            const sortedLifelines = nds.filter(n => n.type === 'lifeline').sort((a, b) => a.position.x - b.position.x);
            return nds.map(n => {
                if (n.type === 'lifeline') {
                    const idx = sortedLifelines.findIndex(sl => sl.id === n.id);
                    return { ...n, position: { x: idx * 280 + 100, y: 50 } };
                }
                return n;
            });
        });

        setEdges((eds) => {
            // 时序图核心：按垂直轴顺序排列消息
            return eds.map((e, idx) => ({
                ...e,
                sourceHandle: null,
                targetHandle: null,
                data: {
                    ...e.data,
                    y: 120 + idx * 60 // 基础偏移 120 (在标识框下方)，间隔 60
                }
            }));
        });
        
        appMessage.info(t('plugins.sequence.layoutSuccess'));
    };

    const handleAddActor = () => {
        const id = `actor-${Date.now()}`;
        setNodes(nds => [
            ...nds,
            {
                id,
                type: 'lifeline',
                position: { x: nds.length * 150, y: 50 },
                data: { label: t('plugins.sequence.newActor'), type: 'actor' }
            }
        ]);
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            <Tooltip title={t('plugins.sequence.addActor')}>
                <Button size="small" type="text" icon={<PlusOutlined />} onClick={handleAddActor} />
            </Tooltip>
            <Divider type="vertical" />
            <Tooltip title={t('plugins.sequence.autoLayout')}>
                <Button size="small" type="text" icon={<InteractionOutlined />} onClick={handleAutoLayout} />
            </Tooltip>
        </div>
    );
};
