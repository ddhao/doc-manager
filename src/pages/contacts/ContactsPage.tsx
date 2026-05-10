import { useEffect, useState, useMemo } from 'react';
import { Table, Button, Input, Space, Popconfirm, Modal, Form, Select, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useUnitStore, Contact } from '@/stores/unitStore';

export default function ContactsPage() {
  const { contacts, departments, loadContacts, loadDepartments, addContact, updateContact, removeContact } =
    useUnitStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    loadContacts();
    loadDepartments();
  }, []);

  const filteredContacts = useMemo(() => {
    if (!keyword) return contacts;
    const kw = keyword.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(kw) ||
        (c.alias || '').toLowerCase().includes(kw) ||
        (c.title || '').toLowerCase().includes(kw) ||
        (c.phone || '').toLowerCase().includes(kw) ||
        (c.department_name || '').toLowerCase().includes(kw)
    );
  }, [contacts, keyword]);

  const columns: ColumnsType<Contact> = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '姓名', dataIndex: 'name' },
    { title: '别名', dataIndex: 'alias', render: (v) => v || '-' },
    { title: '职务', dataIndex: 'title', render: (v) => v || '-' },
    { title: '电话', dataIndex: 'phone', render: (v) => v || '-' },
    { title: '所属股室', dataIndex: 'department_name', render: (v) => v || '-' },
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
              form.setFieldsValue(record);
              setOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => removeContact(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editing) {
      await updateContact(editing.id, values);
      message.success('更新成功');
    } else {
      await addContact(values);
      message.success('添加成功');
    }
    setOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const generateReceipt = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先勾选人员');
      return;
    }
    const selected = contacts.filter((c) => selectedRowKeys.includes(c.id));
    const lines = selected.map(
      (c) => `${c.name} ${c.title || ''} ${c.phone || ''}`.trim().replace(/\s+/g, ' ')
    );
    const text = `参会回执\n${'='.repeat(30)}\n${lines.join('\n')}`;
    window.electronAPI.clipboard.writeText(text);
    message.success('参会回执已复制到剪贴板');
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setOpen(true);
          }}
        >
          新增人员
        </Button>
        <Input.Search
          placeholder="搜索姓名、职务、电话、股室"
          allowClear
          style={{ width: 260 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(v) => setKeyword(v)}
        />
        <Button onClick={generateReceipt} disabled={selectedRowKeys.length === 0}>
          生成参会回执
        </Button>
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredContacts}
        size="small"
        scroll={{ y: 'calc(100vh - 230px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as number[]),
        }}
      />
      <Modal
        title={editing ? '编辑人员' : '新增人员'}
        open={open}
        onOk={handleSubmit}
        onCancel={() => {
          setOpen(false);
          setEditing(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="alias" label="别名">
            <Input />
          </Form.Item>
          <Form.Item name="title" label="职务">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="department_id" label="所属股室">
            <Select allowClear placeholder="选择所属股室">
              {departments.map((d) => (
                <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
