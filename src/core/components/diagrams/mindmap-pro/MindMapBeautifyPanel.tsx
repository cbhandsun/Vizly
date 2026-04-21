import React, { useMemo } from 'react';
import { PluginContext } from '../../../types/plugin';
import { Node, Edge } from '@xyflow/react';
import { Select, Radio, Form, Divider, Popover, Button, Input } from 'antd';
import { BgColorsOutlined, LinkOutlined } from '@ant-design/icons';
import { PALETTE } from '../hooks/useMindMapOrchestrator';

export const MindMapBeautifyPanel: React.FC<{ ctx: PluginContext, selectedNodes: Node[], selectedEdges: Edge[] }> = ({ ctx, selectedNodes, selectedEdges }) => {
    const { getNodes, updateNodesBatch } = ctx;

    // [S-1] Root node lookup is O(N). Memoize it properly:
    // Do NOT call find() in the deps array — that evaluates O(N) on every render just to compute deps.
    // Instead, move the find() inside the memo body. The dep is the nodes array from ctx.
    const rootNode = useMemo(() => {
        const allNodes = getNodes();
        return allNodes.find(n => n.type === 'mindmap' && (n.data?.depth === 0 || n.data?.depth === undefined));
    // ctx.nodes changes when any node is added/removed/updated — getNodes() reflects that.
    // We depend on selectedNodes.length as a proxy to re-check root when selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getNodes, selectedNodes.length]);

    // If no nodes are selected, return null to fallback to the default global Page Settings in DesignerRightSidebar
    if (selectedNodes.length === 0) return null;

    const activeNode = selectedNodes[0];

    const handleBatchUpdate = (field: string, value: any) => {
        if (!activeNode) return;
        
        const updates: any = {};
        
        // If we change global properties (like direction) on the root node, orchestrator might sync it.
        // We will just apply it to the actively selected nodes, or root if none.
        const targetIds = selectedNodes.length > 0 ? selectedNodes.map(n => n.id) : [rootNode?.id].filter(Boolean) as string[];
        
        targetIds.forEach(id => {
             updates[id] = { [field]: value };
        });

        updateNodesBatch(targetIds, updates);
    };

    if (!activeNode) {
        return <div style={{ padding: 16, color: '#888' }}>未检测到思维导图节点</div>;
    }

    const direction = (activeNode.data?.direction as string) || 'LR';
    const shape = (activeNode.data?.shape as string) || 'underline';
    const pathStyle = (activeNode.data?.pathStyle as string) || 'bezier';
    const branchColor = (activeNode.data?.branchColor as string) || PALETTE[0];

    const ColorPickerContent = (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: 200, padding: 8 }}>
            {PALETTE.map(color => (
                <div
                    key={color}
                    onClick={() => handleBatchUpdate('branchColor', color)}
                    style={{
                        width: 24, height: 24, borderRadius: '50%', backgroundColor: color,
                        cursor: 'pointer', border: branchColor === color ? '2px solid #000' : '1px solid transparent',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                    }}
                />
            ))}
            <Divider style={{ margin: '8px 0' }} />
            <Input 
                type="color" 
                value={branchColor} 
                onChange={e => handleBatchUpdate('branchColor', e.target.value)} 
                style={{ width: '100%' }}
            />
        </div>
    );

    return (
        <div className="mindmap-beautify-container" style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
             <div>
                <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600 }}>思维导图配置</h3>
             </div>

             <Form layout="vertical" size="small" className="mindmap-beautify-form">
                 <Form.Item label="结构布局" tooltip="默认由中心节点决定，修改将影响其子分支">
                     <Select 
                         value={direction} 
                         onChange={v => handleBatchUpdate('direction', v)}
                         options={[
                             { label: '思维导图 (Balanced)', value: 'LR' },
                             { label: '逻辑图 - 向右', value: 'R' },
                             { label: '逻辑图 - 向左', value: 'L' },
                             { label: '鱼骨图 (Fishbone)', value: 'FISHBONE' },
                             { label: '树形图 (Top-Down)', value: 'TB' },
                             { label: '树形图 (Bottom-Up)', value: 'BT' }
                         ]}
                     />
                 </Form.Item>

                 <Form.Item label="节点形状" tooltip="改变当前节点或全图的形状">
                     <Radio.Group 
                         value={shape} 
                         onChange={e => handleBatchUpdate('shape', e.target.value)}
                         optionType="button"
                         buttonStyle="solid"
                         style={{ display: 'flex', width: '100%' }}
                     >
                         <Radio.Button value="underline" style={{ flex: 1, textAlign: 'center' }}>下划线</Radio.Button>
                         <Radio.Button value="pill" style={{ flex: 1, textAlign: 'center' }}>胶囊</Radio.Button>
                         <Radio.Button value="box" style={{ flex: 1, textAlign: 'center' }}>矩形</Radio.Button>
                     </Radio.Group>
                 </Form.Item>

                 <Form.Item label="连线风格" tooltip="改变分支之间的连线样式">
                     <Select 
                         value={pathStyle} 
                         onChange={v => handleBatchUpdate('pathStyle', v)}
                         options={[
                             { label: '贝塞尔曲线 (Bezier)', value: 'bezier' },
                             { label: '有机曲线 (Rounded)', value: 'rounded' },
                             { label: '折线/直角 (Step)', value: 'step' },
                             { label: '直线 (Straight)', value: 'straight' }
                         ]}
                     />
                 </Form.Item>

                 <Form.Item label="分支颜色" tooltip="改变当前分支的主题色">
                     <Popover content={ColorPickerContent} trigger="click" placement="bottomLeft">
                         <Button 
                             icon={<BgColorsOutlined />} 
                             style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                         >
                             <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                 <span style={{ 
                                     display: 'inline-block', width: 14, height: 14, 
                                     borderRadius: '50%', backgroundColor: branchColor,
                                     border: '1px solid #d9d9d9'
                                 }} />
                                 <span>选择颜色</span>
                             </div>
                         </Button>
                     </Popover>
                 </Form.Item>

                 {/* [T-3] URL Link node */}
                 <Form.Item label="链接 (URL)" tooltip="为节点添加外部链接，节点上会显示跳转图标">
                     <Input
                         prefix={<LinkOutlined style={{ color: '#6366f1' }} />}
                         placeholder="https://example.com"
                         value={(activeNode.data?.url as string) || ''}
                         onChange={e => handleBatchUpdate('url', e.target.value || undefined)}
                         allowClear
                         size="small"
                     />
                 </Form.Item>

                 {/* [T-4] Priority marker */}
                 <Form.Item label="优先级" tooltip="标记节点重要程度，显示在节点右上角角标">
                     <Radio.Group
                         value={(activeNode.data?.priority as number) || 0}
                         onChange={e => handleBatchUpdate('priority', e.target.value === 0 ? undefined : e.target.value)}
                         optionType="button"
                         buttonStyle="solid"
                         size="small"
                         style={{ display: 'flex', width: '100%' }}
                     >
                         <Radio.Button value={0} style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>无</Radio.Button>
                         <Radio.Button value={1} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#2563eb' }}>! 低</Radio.Button>
                         <Radio.Button value={2} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#f59e0b' }}>!! 中</Radio.Button>
                         <Radio.Button value={3} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#ef4444' }}>!!! 高</Radio.Button>
                     </Radio.Group>
                 </Form.Item>
             </Form>

             <Divider style={{ margin: '8px 0' }} />
             <div style={{ fontSize: 12, color: '#888' }}>
                 提示：选中单个节点可独立修改其颜色和形状；选中「根节点」时，将修改全局思维导图结构配置。
             </div>
        </div>
    );
};
