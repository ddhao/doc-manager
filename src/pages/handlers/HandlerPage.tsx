import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Popconfirm, message, Tag } from 'antd';
import { PlusOutlined, DeleteOutlined, StarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useHandlerStore, Handler } from '@/stores/handlerStore';

/** 去掉 Electron IPC 包装，只保留数据库原始错误 */
function normalizeError(e: any): string {
  return String(e?.message || e)
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim();
}

export default function HandlerPage() {
  const { handlers, defaultHandler, loadHandlers, loadDefaultHandler, setDefaultHandler, addHandler, removeHandler } =
    useHandlerStore();
  const [name, setName] = useState('');

  useEffect(() => {
    loadHandlers();
    loadDefaultHandler();
  }, []);

  const columns: ColumnsType<Handler> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    {
      title: '经办人',
      dataIndex: 'name',
      render: (v: string) => (
        <Space size={4}>
          <span>{v}</span>
          {v === defaultHandler && <Tag color="blue">默认</Tag>}
        </Space>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180 },
    {
      title: '操作',
      width: 180,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<StarOutlined />}
            disabled={record.name === defaultHandler}
            onClick={async () => {
              await setDefaultHandler(record.name);
              message.success(`已将「${record.name}」设为默认经办人`);
            }}
          >
            设为默认
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => removeHandler(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleAdd = async () => {
    const value = name.trim();
    if (!value) {
      message.warning('请输入经办人姓名');
      return;
    }
    try {
      await addHandler(value);
      setName('');
      message.success('添加成功');
    } catch (e: any) {
      const reason = normalizeError(e);
      if (reason.includes('UNIQUE')) {
        message.error(`新增失败：经办人「${value}」已存在`);
      } else if (reason.includes('no such table')) {
        message.error('新增失败：数据表不存在，请重启程序后再试');
      } else {
        message.error(`新增失败：${reason}`);
      }
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入经办人姓名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={handleAdd}
          style={{ width: 240 }}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增经办人
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={handlers} size="small" scroll={{ y: 'calc(100vh - 200px)' }} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }} />
    </div>
  );
}
