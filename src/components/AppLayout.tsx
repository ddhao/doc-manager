import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  InboxOutlined,
  SendOutlined,
  CalendarOutlined,
  BankOutlined,
  TeamOutlined,
  ContactsOutlined,
  SettingOutlined,
  FolderOpenOutlined,
  CloudServerOutlined,
  FileTextOutlined,
} from '@ant-design/icons';

const { Sider, Content, Header } = Layout;

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/incoming': '收文管理',
  '/outgoing': '发文管理',
  '/meetings': '会议管理',
  '/units': '单位管理',
  '/departments': '股室管理',
  '/contacts': '通讯录',
  '/archives': '档案管理',
  '/archives/records': '归档记录',
  '/config': '基本配置',
  '/backup': '备份管理',
  '/templates': '模版管理',
};

const menuItems: MenuProps['items'] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { type: 'divider' },
  { key: '/incoming', icon: <InboxOutlined />, label: '收文管理' },
  { key: '/outgoing', icon: <SendOutlined />, label: '发文管理' },
  { key: '/meetings', icon: <CalendarOutlined />, label: '会议管理' },
  { type: 'divider' },
  { key: '/units', icon: <BankOutlined />, label: '单位管理' },
  { key: '/departments', icon: <TeamOutlined />, label: '股室管理' },
  { key: '/contacts', icon: <ContactsOutlined />, label: '通讯录' },
  { type: 'divider' },
  { key: '/archives', icon: <FolderOpenOutlined />, label: '档案管理' },
  { key: '/config', icon: <SettingOutlined />, label: '基本配置' },
  { key: '/backup', icon: <CloudServerOutlined />, label: '备份管理' },
  { type: 'divider' },
  { key: '/templates', icon: <FileTextOutlined />, label: '模版管理' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split('/');
  const selectedKey = pathParts.length > 2 ? `/${pathParts[1]}/${pathParts[2]}` : `/${pathParts[1]}`;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: '#fff',
            fontSize: collapsed ? 14 : 16,
            fontWeight: 600,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            padding: '0 12px',
          }}
        >
          <img src="/icon.png" alt="logo" style={{ width: 28, height: 28, flexShrink: 0 }} />
          {collapsed ? null : '办公室收文管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          {pageTitles[selectedKey] || ''}
        </Header>
        <Content style={{ margin: 16, padding: 24, background: '#fff', borderRadius: 8, minHeight: 360 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
