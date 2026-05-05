import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Popconfirm, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useUnitStore, Unit } from '@/stores/unitStore';

export default function UnitsPage() {
  const { units, loadUnits, addUnit, removeUnit } = useUnitStore();
  const [name, setName] = useState('');

  useEffect(() => { loadUnits(); }, []);

  const columns: ColumnsType<Unit> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '单位名称', dataIndex: 'name' },
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除？将同时清除关联的股室和人员" onConfirm={() => removeUnit(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入单位名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 240 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={async () => {
            if (!name.trim()) return;
            await addUnit(name.trim());
            setName('');
            message.success('添加成功');
          }}
        >
          新增单位
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={units} size="small" scroll={{ y: 'calc(100vh - 200px)' }} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }} />
    </div>
  );
}
