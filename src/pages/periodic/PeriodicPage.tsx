import { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, DatePicker, Switch, Tag, message, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, CheckCircleOutlined, UndoOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { usePeriodicTaskStore, PeriodicTask } from '@/stores/periodicTaskStore';

const dayOptions = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}日` }));

export default function PeriodicPage() {
  const { tasks, loadTasks, addTask, updateTask, toggleStatus, removeTask } = usePeriodicTaskStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PeriodicTask | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [form] = Form.useForm();
  const [noEndDate, setNoEndDate] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const computeNextReminder = (task: PeriodicTask) => {
    const now = dayjs();
    const startDate = dayjs(task.start_date);
    let next = dayjs().date(task.reminder_day).startOf('day');

    // Ensure next is not before start_date
    if (next.isBefore(startDate, 'day')) {
      next = startDate.date(task.reminder_day);
    }

    // If next is before or equal to today, try next month
    if (next.isBefore(now, 'day') || next.isSame(now, 'day')) {
      next = next.add(1, 'month');
    }

    // Also ensure we're not before start_date after bumping
    if (next.isBefore(startDate, 'day')) {
      next = startDate;
    }

    // Check end_date
    if (task.end_date) {
      const endDate = dayjs(task.end_date);
      if (next.isAfter(endDate, 'day')) {
        return null; // No more reminders
      }
    }

    return next;
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === 'all') return true;
    return t.status === filterStatus;
  });

  const columns: ColumnsType<PeriodicTask> = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    {
      title: '任务名称',
      dataIndex: 'title',
      ellipsis: true,
      width: 200,
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      width: 250,
      render: (v: string | null) => v || '-',
    },
    {
      title: '每月提醒日',
      dataIndex: 'reminder_day',
      width: 100,
      render: (v: number) => `${v}日`,
    },
    {
      title: '时间区间',
      width: 220,
      render: (_: unknown, record: PeriodicTask) => (
        <span>
          {record.start_date} ~ {record.end_date || '无截止'}
        </span>
      ),
    },
    {
      title: '下次提醒',
      width: 120,
      render: (_: unknown, record: PeriodicTask) => {
        if (record.status === 'completed') return <Tag color="default">已完成</Tag>;
        const next = computeNextReminder(record);
        if (!next) return <Tag color="default">已到期</Tag>;
        const diff = next.diff(dayjs(), 'day');
        if (diff === 0) return <Tag color="orange">今天</Tag>;
        if (diff <= 3) return <Tag color="gold">{next.format('MM-DD')}</Tag>;
        return next.format('MM-DD');
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'default'}>
          {v === 'active' ? '进行中' : '已完成'}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: PeriodicTask) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'toggle',
                label: record.status === 'active' ? '标记完成' : '重新开始',
                icon: record.status === 'active' ? <CheckCircleOutlined /> : <UndoOutlined />,
                onClick: () => {
                  toggleStatus(record.id);
                  message.success(record.status === 'active' ? '已标记为完成' : '已重新开始');
                },
              },
              { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => openEdit(record) },
              { type: 'divider' as const },
              {
                key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined />,
                onClick: () => {
                  Modal.confirm({
                    title: '确认删除',
                    content: `确定要删除任务「${record.title}」吗？`,
                    onOk: () => { removeTask(record.id); message.success('已删除'); },
                  });
                },
              },
            ],
          }}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      ),
    },
  ];

  const openEdit = (record: PeriodicTask) => {
    setEditing(record);
    setNoEndDate(!record.end_date);
    form.setFieldsValue({
      ...record,
      start_date: dayjs(record.start_date),
      end_date: record.end_date ? dayjs(record.end_date) : null,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      start_date: values.start_date.format('YYYY-MM-DD'),
      end_date: noEndDate ? null : values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
    };
    delete data.end_date_disabled;
    if (editing) {
      await updateTask(editing.id, data);
      message.success('更新成功');
    } else {
      await addTask(data);
      message.success('新增成功');
    }
    setFormOpen(false);
    setEditing(null);
    setNoEndDate(false);
    form.resetFields();
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setNoEndDate(false);
            form.resetFields();
            setFormOpen(true);
          }}
        >
          新增定期任务
        </Button>
        <Select
          value={filterStatus}
          onChange={setFilterStatus}
          style={{ width: 120 }}
          options={[
            { value: 'all', label: '全部' },
            { value: 'active', label: '进行中' },
            { value: 'completed', label: '已完成' },
          ]}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredTasks}
        size="small"
        scroll={{ y: 'calc(100vh - 230px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title={editing ? '编辑定期任务' : '新增定期任务'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setEditing(null); setNoEndDate(false); form.resetFields(); }}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="例如：每月报送安全生产报告" />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea rows={2} placeholder="任务详细描述" />
          </Form.Item>
          <Form.Item name="reminder_day" label="每月提醒日" rules={[{ required: true, message: '请选择提醒日' }]}>
            <Select placeholder="选择每月几号提醒" options={dayOptions} />
          </Form.Item>
          <Form.Item name="start_date" label="开始日期" rules={[{ required: true, message: '请选择开始日期' }]}>
            <DatePicker style={{ width: '100%' }} placeholder="选择开始日期" />
          </Form.Item>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item label="无截止日期">
              <Switch checked={noEndDate} onChange={(v) => { setNoEndDate(v); form.setFieldValue('end_date', null); }} />
            </Form.Item>
            <Form.Item name="end_date" label="截止日期">
              <DatePicker disabled={noEndDate} style={{ width: '100%' }} placeholder="留空表示无限期" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
