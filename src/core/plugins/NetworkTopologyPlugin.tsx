import React, { useState, useMemo } from 'react';
import { Node, Edge } from '@xyflow/react';
import { Input, Button, Tooltip, Divider, Segmented } from 'antd';
import { SearchOutlined, ApartmentOutlined, CloudOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import { DiagramTypePlugin, PluginContext, SidebarPanel } from '../types/plugin';
import { BaseDiagramPlugin } from '../sdk/BasePlugin';
import NetworkNode from '../components/custom-nodes/NetworkNode';
import NetworkContainer from '../components/custom-nodes/NetworkContainer';

// ====== 数据定义 ======
interface IconDef {
  id: string;
  label: string;
  icon: string;
  category: string;
  provider: 'aws' | 'azure' | 'gcp';
  color: string;
}

const NETWORK_ICONS: IconDef[] = [
  // AWS - Compute
  { id: 'aws-ec2', label: 'EC2', icon: 'logos:aws-ec2', category: 'Compute', provider: 'aws', color: '#FF9900' },
  { id: 'aws-lambda', label: 'Lambda', icon: 'logos:aws-lambda', category: 'Compute', provider: 'aws', color: '#FF9900' },
  { id: 'aws-eks', label: 'EKS', icon: 'logos:aws-eks', category: 'Compute', provider: 'aws', color: '#FF9900' },
  { id: 'aws-fargate', label: 'Fargate', icon: 'logos:aws-fargate', category: 'Compute', provider: 'aws', color: '#FF9900' },
  // AWS - Management
  { id: 'aws-api', label: 'API Gateway', icon: 'logos:aws-api-gateway', category: 'Management', provider: 'aws', color: '#A166FF' },
  { id: 'aws-cw', label: 'CloudWatch', icon: 'logos:aws-cloudwatch', category: 'Management', provider: 'aws', color: '#FF4F8B' },
  // AWS - Storage
  { id: 'aws-s3', label: 'S3', icon: 'logos:aws-s3', category: 'Storage', provider: 'aws', color: '#3F8624' },
  { id: 'aws-ebs', label: 'EBS', icon: 'logos:aws-ebs', category: 'Storage', provider: 'aws', color: '#3F8624' },
  // AWS - Network
  { id: 'aws-vpc', label: 'VPC', icon: 'logos:aws-vpc', category: 'Network', provider: 'aws', color: '#3F8624' },
  { id: 'aws-route53', label: 'Route53', icon: 'logos:aws-route53', category: 'Network', provider: 'aws', color: '#8C4FFF' },
  { id: 'aws-cloudfront', label: 'CloudFront', icon: 'logos:aws-cloudfront', category: 'Network', provider: 'aws', color: '#8C4FFF' },
  { id: 'aws-alb', label: 'ALB', icon: 'logos:aws-alb', category: 'Network', provider: 'aws', color: '#8C4FFF' },
  // AWS - Database
  { id: 'aws-rds', label: 'RDS', icon: 'logos:aws-rds', category: 'Database', provider: 'aws', color: '#2E27AD' },
  { id: 'aws-dynamodb', label: 'DynamoDB', icon: 'logos:aws-dynamodb', category: 'Database', provider: 'aws', color: '#2E27AD' },
  // AWS - Integration
  { id: 'aws-sqs', label: 'SQS', icon: 'logos:aws-sqs', category: 'Integration', provider: 'aws', color: '#FF4F8B' },
  { id: 'aws-sns', label: 'SNS', icon: 'logos:aws-sns', category: 'Integration', provider: 'aws', color: '#FF4F8B' },

  // Azure - Compute
  { id: 'az-vm', label: 'Virtual Machine', icon: 'logos:azure-vms', category: 'Compute', provider: 'azure', color: '#0078D4' },
  { id: 'az-functions', label: 'Functions', icon: 'logos:azure-functions', category: 'Compute', provider: 'azure', color: '#0078D4' },
  { id: 'az-aks', label: 'Kubernetes', icon: 'logos:azure-kubernetes', category: 'Compute', provider: 'azure', color: '#0078D4' },
  // Azure - Storage
  { id: 'az-storage', label: 'Storage Account', icon: 'logos:azure-storage', category: 'Storage', provider: 'azure', color: '#0078D4' },
  // Azure - Database
  { id: 'az-sql', label: 'SQL Database', icon: 'logos:azure-sql', category: 'Database', provider: 'azure', color: '#0078D4' },
  { id: 'az-cosmos', label: 'Cosmos DB', icon: 'logos:azure-cosmos-db', category: 'Database', provider: 'azure', color: '#0078D4' },
  // Azure - Security
  { id: 'az-kv', label: 'Key Vault', icon: 'logos:azure-key-vault', category: 'Security', provider: 'azure', color: '#0078D4' },

  // GCP - Compute
  { id: 'gcp-ce', label: 'Compute Engine', icon: 'logos:google-cloud-compute', category: 'Compute', provider: 'gcp', color: '#4285F4' },
  { id: 'gcp-functions', label: 'Cloud Functions', icon: 'logos:google-cloud-functions', category: 'Compute', provider: 'gcp', color: '#4285F4' },
  { id: 'gcp-gke', label: 'GKE', icon: 'logos:google-cloud-kubernetes', category: 'Compute', provider: 'gcp', color: '#4285F4' },
  { id: 'gcp-run', label: 'Cloud Run', icon: 'logos:google-cloud-run', category: 'Compute', provider: 'gcp', color: '#4285F4' },
  // GCP - Storage
  { id: 'gcp-storage', label: 'Cloud Storage', icon: 'logos:google-cloud-storage', category: 'Storage', provider: 'gcp', color: '#4285F4' },
  // GCP - Database
  { id: 'gcp-sql', label: 'Cloud SQL', icon: 'logos:google-cloud-sql', category: 'Database', provider: 'gcp', color: '#4285F4' },
  { id: 'gcp-bq', label: 'BigQuery', icon: 'logos:google-cloud-bigquery', category: 'Database', provider: 'gcp', color: '#4285F4' },
  // GCP - Integration
  { id: 'gcp-pubsub', label: 'Pub/Sub', icon: 'logos:google-cloud-pubsub', category: 'Integration', provider: 'gcp', color: '#4285F4' },
];

const CONTAINERS = [
  { id: 'vpc', label: 'VPC / VNet', type: 'networkContainer', icon: 'logos:aws-vpc', color: '#3F8624' },
  { id: 'region', label: 'Region / Location', type: 'networkContainer', icon: 'mdi:earth', color: '#6366f1' },
  { id: 'subnet', label: 'Subnet', type: 'networkContainer', icon: 'mdi:lan', color: '#94a3b8', borderStyle: 'dashed' as const },
  { id: 'sec-group', label: 'Security Group', type: 'networkContainer', icon: 'mdi:shield-check', color: '#e11d48', borderStyle: 'dashed' as const },
];

// ====== 侧边栏组件 ======
const NetworkPalette: React.FC = () => {
  const [provider, setProvider] = useState<'aws' | 'azure' | 'gcp'>('aws');
  const [search, setSearch] = useState('');

  const filteredIcons = useMemo(() => {
    let result = NETWORK_ICONS.filter(i => i.provider === provider);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i => i.label.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    return result;
  }, [provider, search]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(filteredIcons.map(i => i.category)));
    return cats.map(c => ({
      name: c,
      icons: filteredIcons.filter(i => i.category === c)
    }));
  }, [filteredIcons]);

  const onDragStart = (event: React.DragEvent, data: any) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(data));
    event.dataTransfer.effectAllowed = 'move';
  };

  const renderIconItem = (def: IconDef) => (
    <Tooltip key={def.id} title={def.label} placement="right">
      <div
        draggable
        onDragStart={(e) => onDragStart(e, {
          typeName: 'networkNode',
          label: def.label,
          config: { icon: def.icon, themeColor: def.color }
        })}
        className="network-palette-item"
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          padding: '10px 4px', cursor: 'grab', borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.6)', border: '1px solid #f0f0f0'
        }}
      >
        <div style={{ fontSize: 24, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img
            src={`https://api.iconify.design/${def.icon}.svg`}
            style={{ width: 24, height: 24 }}
            loading="lazy"
            decoding="async"
            alt={def.label}
            onError={(e) => {
              // Fallback: hide broken img, show colored first-letter badge
              const img = e.currentTarget;
              img.style.display = 'none';
              const badge = document.createElement('span');
              badge.textContent = def.label[0];
              badge.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;background:${def.color}20;color:${def.color};font-weight:700;font-size:13px;`;
              img.parentElement?.appendChild(badge);
            }}
          />
        </div>
        <span style={{ fontSize: 10, textAlign: 'center', overflow: 'hidden', width: '100%', textOverflow: 'ellipsis' }}>{def.label}</span>
      </div>
    </Tooltip>
  );

  return (
    <div style={{ padding: '8px 12px' }}>
      <Segmented
        block
        value={provider}
        onChange={(val) => setProvider(val as any)}
        options={[
          { label: 'AWS', value: 'aws' },
          { label: 'Azure', value: 'azure' },
          { label: 'GCP', value: 'gcp' },
        ]}
        style={{ marginBottom: 16 }}
      />

      <Input
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="搜索图标..."
        size="small"
        allowClear
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: 16, borderRadius: 6 }}
      />

      {/* 容器类组件 */}
      <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#8c8c8c', marginBottom: 8 }}>容器组件</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {CONTAINERS.map(c => (
               <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, {
                    typeName: 'networkContainer',
                    label: c.label,
                    config: { icon: c.icon, themeColor: c.color, borderStyle: c.borderStyle }
                  })}
                  style={{
                    padding: '8px', border: `1px dashed ${c.color}60`, borderRadius: 6,
                    cursor: 'grab', fontSize: 11, textAlign: 'center', background: `${c.color}05`
                  }}
               >
                 {c.label}
               </div>
            ))}
          </div>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 分类图标 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {categories.map(cat => (
          <div key={cat.name}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#bfbfbf', marginBottom: 8, textTransform: 'uppercase' }}>{cat.name}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {cat.icons.map(renderIconItem)}
            </div>
          </div>
        ))}
        {filteredIcons.length === 0 && <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 12 }}>未找到相关组件</div>}
      </div>

      <style>{`
        .network-palette-item:hover {
          background: #fff !important;
          border-color: #3b82f6 !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
      `}</style>
    </div>
  );
};

// ====== 插件类实现 ======
export class NetworkTopologyPlugin extends BaseDiagramPlugin implements DiagramTypePlugin {
  id = 'network';
  name = '网络拓扑图';
  version = '1.0';

  async migrate(data: any, fromVersion: string | undefined): Promise<any> {
    return await super.migrate(data, fromVersion);
  }

  getNodeTypes() {
    return {
      networkNode: NetworkNode,
      networkContainer: NetworkContainer
    };
  }

  contributeToolbar(ctx: PluginContext) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
        <Tooltip title="自动布局 (双向)">
          <Button size="small" type="text" icon={<ApartmentOutlined />} onClick={() => {
             window.dispatchEvent(new CustomEvent('diagram:requestLayout', { detail: { strategy: 'DomainDagreLayout' } }));
          }} />
        </Tooltip>
        <Tooltip title="云部署视察">
          <Button size="small" type="text" icon={<DeploymentUnitOutlined />} />
        </Tooltip>
      </div>
    );
  }

  contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
    return [
      {
        id: 'network-icons',
        title: '云厂商图标',
        icon: <CloudOutlined />,
        content: <NetworkPalette />
      }
    ];
  }
}
