import React from 'react';
import { Layout, Menu, Typography, theme } from 'antd';
import { FaGithub, FaBook, FaCog, FaChartBar } from 'react-icons/fa';
import { useNavigate, useLocation } from 'react-router-dom';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  showHeader?: boolean;
  showFooter?: boolean;
}

const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  title = 'Architecture Diagram Viewer',
  showHeader = true,
  showFooter = true
}) => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/manage',
      icon: <FaChartBar />,
      label: '图表管理',
      onClick: () => navigate('/manage')
    },
    {
      key: '/docs',
      icon: <FaBook />,
      label: '文档',
      onClick: () => navigate('/docs')
    },
    {
      key: '/storage-config',
      icon: <FaCog />,
      label: '存储配置',
      onClick: () => navigate('/storage-config')
    },
    {
      key: 'github',
      icon: <FaGithub />,
      label: 'GitHub',
      onClick: () => window.open('https://github.com/your-repo', '_blank')
    }
  ];

  // Determine active key based on current path
  const activeKey = menuItems.find(item => location.pathname.startsWith(item.key) && item.key !== '/')?.key;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {showHeader && (
        <Header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorder}`,
          padding: '0 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginRight: 48, cursor: 'pointer' }} onClick={() => navigate('/')}>
             {/* Logo Placeholder */}
             <div style={{ 
               width: 32, 
               height: 32, 
               background: token.colorPrimary, 
               borderRadius: 6, 
               marginRight: 12,
               display: 'flex', 
               alignItems: 'center', 
               justifyContent: 'center',
               color: '#fff',
               fontWeight: 'bold'
             }}>A</div>
             <Text strong style={{ fontSize: 18 }}>{title}</Text>
          </div>
          
          <Menu
            mode="horizontal"
            selectedKeys={activeKey ? [activeKey] : []}
            items={menuItems}
            style={{ flex: 1, borderBottom: 'none' }}
          />
        </Header>
      )}

      <Content style={{ 
        padding: '24px', 
        background: token.colorBgLayout,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          flex: 1,
          background: token.colorBgContainer,
          borderRadius: token.borderRadiusLG,
          padding: 24,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
        }}>
          {children}
        </div>
      </Content>

      {showFooter && (
        <Footer style={{ textAlign: 'center', color: token.colorTextSecondary }}>
          © {new Date().getFullYear()} Architecture Diagram Viewer. Built with React & TypeScript.
        </Footer>
      )}
    </Layout>
  );
};

export default AppLayout;
