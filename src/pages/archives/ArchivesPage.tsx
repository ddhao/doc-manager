import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Select, Popconfirm,
  message, Card, Tag, Space,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useArchiveStore, ArchiveBox } from '@/stores/archiveStore';

const boxTypeLabels: Record<string, string> = {
  incoming: '收文',
  reply: '回文',
  outgoing: '发文',
};

const boxTypeColors: Record<string, string> = {
  incoming: 'blue',
  reply: 'purple',
  outgoing: 'green',
};

export default function ArchivesPage() {
  const [boxFormOpen, setBoxFormOpen] = useState(false);
  const [boxForm] = Form.useForm();
  const navigate = useNavigate();

  const store = useArchiveStore();

  useEffect(() => {
    store.loadBoxes();
  }, []);

  const boxColumns: ColumnsType<ArchiveBox> = [
    { title: '文件盒编号', dataIndex: 'box_number', width: 140 },
    {
      title: '文件盒类型',
      dataIndex: 'box_type',
      width: 100,
      render: (v) => <Tag color={boxTypeColors[v] || 'default'}>{boxTypeLabels[v] || v}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/archives/records?boxId=${record.id}`)}>
            查看
          </Button>
          <Popconfirm title="确定删除？将同时清除关联的归档记录" onConfirm={() => store.removeBox(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleBoxSubmit = async () => {
    const values = await boxForm.validateFields();
    await store.addBox(values.box_number, values.box_type);
    message.success('文件盒创建成功');
    setBoxFormOpen(false);
    boxForm.resetFields();
  };

  return (
    <div>
      <Card
        size="small"
        title="归档文件盒"
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={() => {
            boxForm.resetFields();
            setBoxFormOpen(true);
          }}>
            新增
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={boxColumns}
          dataSource={store.boxes}
          size="small"
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 个文件盒` }}
        />
      </Card>

      <Modal
        title="新增文件盒"
        open={boxFormOpen}
        onOk={handleBoxSubmit}
        onCancel={() => { setBoxFormOpen(false); boxForm.resetFields(); }}
      >
        <Form form={boxForm} layout="vertical">
          <Form.Item name="box_number" label="文件盒编号" rules={[{ required: true, message: '请输入编号' }]}>
            <Input placeholder="例如：2024-001" />
          </Form.Item>
          <Form.Item name="box_type" label="文件盒类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="incoming">收文</Select.Option>
              <Select.Option value="reply">回文</Select.Option>
              <Select.Option value="outgoing">发文</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
