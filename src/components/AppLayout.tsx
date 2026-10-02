import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Modal, Tag, List, Badge, Space, Select } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  InboxOutlined,
  BankOutlined,
  TeamOutlined,
  SolutionOutlined,
  CustomerServiceOutlined,
  CloudServerOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { usePeriodicTaskStore, ReminderTask } from '@/stores/periodicTaskStore';
import { useHandlerStore } from '@/stores/handlerStore';

const { Sider, Content, Header } = Layout;

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/incoming': '收文管理',
  '/workorders': '工单管理',
  '/outgoing': '发文管理',
  '/meetings': '会议管理',
  '/units': '单位管理',
  '/departments': '股室管理',
  '/contacts': '通讯录',
  '/handlers': '经办人管理',
  '/archives': '档案管理',
  '/archives/records': '归档记录',
  '/config': '基本配置',
  '/backup': '备份管理',
  '/templates': '模版管理',
  '/periodic': '定期任务',
  '/workflow': '流程管理',
  '/applications': '申请管理',
};

const menuItems: MenuProps['items'] = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { type: 'divider' },
  { key: '/incoming', icon: <InboxOutlined />, label: '收文管理' },
  { key: '/workorders', icon: <CustomerServiceOutlined />, label: '工单管理' },
  { type: 'divider' },
  { key: '/units', icon: <BankOutlined />, label: '单位管理' },
  { key: '/departments', icon: <TeamOutlined />, label: '股室管理' },
  { key: '/handlers', icon: <SolutionOutlined />, label: '经办人管理' },
  { type: 'divider' },
  { key: '/backup', icon: <CloudServerOutlined />, label: '备份管理' },
  { type: 'divider' },
  { key: '/templates', icon: <FileTextOutlined />, label: '模版管理' },
  { type: 'divider' },
  { key: '/periodic', icon: <ClockCircleOutlined />, label: '定期任务' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminders, setReminders] = useState<ReminderTask[]>([]);
  const [handlerPickOpen, setHandlerPickOpen] = useState(false);
  const [pickedHandler, setPickedHandler] = useState<string | undefined>();
  const navigate = useNavigate();
  const location = useLocation();
  const { loadTasks, getReminderTasks } = usePeriodicTaskStore();
  const { handlers, loadDefaultHandler, setDefaultHandler } = useHandlerStore();

  useEffect(() => {
    const checkReminders = async () => {
      await loadTasks();
      const tasks = getReminderTasks();
      if (tasks.length > 0) {
        setReminders(tasks);
        setReminderOpen(true);
      }
    };
    checkReminders();

    // 启动时让用户选择本次使用的经办人
    const pickHandler = async () => {
      await useHandlerStore.getState().loadHandlers();
      await loadDefaultHandler();
      const { handlers: list, defaultHandler } = useHandlerStore.getState();
      if (list.length === 0) return;
      setPickedHandler(defaultHandler || list[0].name);
      setHandlerPickOpen(true);
    };
    pickHandler();
  }, []);

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
          <img src="./icon.png" alt="logo" style={{ width: 28, height: 28, flexShrink: 0 }} />
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

      <Modal
        title="选择经办人"
        open={handlerPickOpen}
        closable={false}
        maskClosable={false}
        okText="确定"
        cancelText="稍后"
        onCancel={() => setHandlerPickOpen(false)}
        onOk={async () => {
          if (!pickedHandler) return;
          await setDefaultHandler(pickedHandler);
          setHandlerPickOpen(false);
        }}
        width={420}
      >
        <div style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
          选择本次使用的经办人，登记收文时会自动填入；下次启动会默认选中该项。
        </div>
        <Select
          style={{ width: '100%' }}
          value={pickedHandler}
          onChange={setPickedHandler}
          placeholder="请选择经办人"
          options={handlers.map((h) => ({ value: h.name, label: h.name }))}
        />
      </Modal>

      <Modal
        title={
          <Space>
            <BellOutlined style={{ color: '#faad14' }} />
            <span>定期任务提醒</span>
            <Badge count={reminders.length} style={{ marginLeft: 8 }} />
          </Space>
        }
        open={reminderOpen}
        onCancel={() => setReminderOpen(false)}
        footer={null}
        width={560}
      >
        <List
          dataSource={reminders}
          renderItem={(item: ReminderTask) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space>
                    <span>{item.title}</span>
                    <Tag color={item.daysLeft === 0 ? 'red' : 'orange'}>
                      剩余{item.daysLeft}天
                    </Tag>
                  </Space>
                }
                description={
                  <div>
                    <div>截止日期：{item.deadline}（每月{item.reminder_day}日）</div>
                    {item.description && <div style={{ color: '#999', fontSize: 12, marginTop: 2 }}>{item.description}</div>}
                  </div>
                }
              />
            </List.Item>
          )}
          style={{ maxHeight: 400, overflow: 'auto' }}
        />
      </Modal>
    </Layout>
  );
}
