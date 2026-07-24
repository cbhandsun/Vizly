import React, { Component, ErrorInfo, ReactNode } from 'react';
import { WarningOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { logPluginBoundaryError } from '../../../utils/errorBoundaryLogging';

interface Props {
  pluginId: string;
  uiArea?: string; // 'toolbar' | 'sidebar' | 'canvas' etc.
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PluginErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logPluginBoundaryError(this.props.pluginId, this.props.uiArea, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const areaName = this.props.uiArea === 'toolbar' ? '工具栏' : this.props.uiArea === 'sidebar' ? '侧边栏' : '画布组件';
      return (
        <div style={{
          padding: '8px 12px',
          margin: 4,
          background: 'rgba(255, 77, 79, 0.06)',
          border: '1px dashed #ff4d4f',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#ff4d4f',
          backdropFilter: 'blur(4px)',
        }}>
          <WarningOutlined style={{ fontSize: 14 }} />
          <span style={{ fontWeight: 500 }}>
            插件【{this.props.pluginId}】的{areaName}加载异常
          </span>
          <Tooltip title={this.state.error?.message || '未知错误'}>
            <span style={{ cursor: 'help', textDecoration: 'underline', color: '#ff7875', fontSize: 11 }}>
              详情
            </span>
          </Tooltip>
          <Button 
            size="small" 
            type="text" 
            danger 
            icon={<ReloadOutlined />} 
            onClick={this.handleRetry} 
            style={{ marginLeft: 'auto', padding: '0 4px', height: 20, fontSize: 11 }}
          >
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
