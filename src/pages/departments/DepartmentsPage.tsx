import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Popconfirm, Modal, Form, Select, message, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useUnitStore, Department } from '@/stores/unitStore';

export default function DepartmentsPage() {
  const { departments, contacts, loadDepartments, loadContacts, addDepartment, updateDepartment, removeDepartment } =
    useUnitStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadDepartments();
    loadContacts();
  }, []);

  const columns: ColumnsType<Department> = [
    { title: '排序', dataIndex: 'sort_order', width: 60 },
    { title: '股室名称', dataIndex: 'name' },
    { title: '负责人', dataIndex: 'leader', render: (v) => v || '-' },
    { title: '收文员', dataIndex: 'receiver', render: (v) => v || '-' },
    {
      title: '操作',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              form.setFieldsValue({
                ...record,
                receiver: record.receiver ? record.receiver.split(',') : [],
              });
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => removeDepartment(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      receiver: Array.isArray(values.receiver) ? values.receiver.join(',') : values.receiver,
    };
    if (editing) {
      await updateDepartment(editing.id, data);
      message.success('更新成功');
    } else {
      await addDepartment(data);
      message.success('添加成功');
    }
    setOpen(false);
    setEditing(null);
    form.resetFields();
  };

  return (
    <div>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        style={{ marginBottom: 16 }}
        onClick={() => {
          setEditing(null);
          form.resetFields();
          form.setFieldsValue({ sort_order: departments.length + 1 });
          setOpen(true);
        }}
      >
        新增股室
      </Button>
      <Table rowKey="id" columns={columns} dataSource={departments} size="small" scroll={{ y: 'calc(100vh - 200px)' }} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }} />
      <Modal
        title={editing ? '编辑股室' : '新增股室'}
        open={open}
        onOk={handleSubmit}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="股室名称" rules={[{ required: true, message: '请输入股室名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="sort_order" label="排序">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="leader" label="负责人">
            <Input />
          </Form.Item>
          <Form.Item name="receiver" label="收文员">
            <Select mode="multiple" allowClear placeholder="选择收文员">
              {contacts.map((c) => (
                <Select.Option key={c.id} value={c.name}>{c.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
