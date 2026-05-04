import { useEffect, useState } from 'react';
import { Tabs, Table, Button, Input, Popconfirm, Space, Tag, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useConfigStore, DocLevel, DocType, DocTag, DispatchType } from '@/stores/configStore';

export default function ConfigPage() {
  return (
    <div>
      <Tabs
        defaultActiveKey="levels"
        items={[
          { key: 'levels', label: '公文等级', children: <LevelConfig /> },
          { key: 'docTypes', label: '公文类型', children: <DocTypeConfig /> },
          { key: 'dispatchTypes', label: '发文类型', children: <DispatchTypeConfig /> },
          { key: 'tags', label: '公文标签', children: <TagConfig /> },
        ]}
      />
    </div>
  );
}

const levelColors: Record<string, string> = {
  '特急': 'red',
  '加急': 'orange',
  '急': 'gold',
  '平': 'green',
};

function LevelConfig() {
  const { levels, loadLevels, addLevel, removeLevel } = useConfigStore();
  const [name, setName] = useState('');

  useEffect(() => { loadLevels(); }, []);

  const columns: ColumnsType<DocLevel> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    {
      title: '等级名称',
      dataIndex: 'name',
      render: (name: string) => <Tag color={levelColors[name] || 'default'}>{name}</Tag>,
    },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除？" onConfirm={() => removeLevel(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入公文等级名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 200 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={async () => {
            if (!name.trim()) return;
            await addLevel(name.trim());
            setName('');
            message.success('添加成功');
          }}
        >
          添加
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={levels} size="small" />
    </div>
  );
}

function DocTypeConfig() {
  const { docTypes, loadDocTypes, addDocType, removeDocType } = useConfigStore();
  const [name, setName] = useState('');

  useEffect(() => { loadDocTypes(); }, []);

  const columns: ColumnsType<DocType> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '公文类型', dataIndex: 'name' },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除？" onConfirm={() => removeDocType(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入公文类型名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 200 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={async () => {
            if (!name.trim()) return;
            await addDocType(name.trim());
            setName('');
            message.success('添加成功');
          }}
        >
          添加
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={docTypes} size="small" />
    </div>
  );
}

function TagConfig() {
  const { tags, loadTags, addTag, removeTag } = useConfigStore();
  const [name, setName] = useState('');

  useEffect(() => { loadTags(); }, []);

  const columns: ColumnsType<DocTag> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '标签名称', dataIndex: 'name' },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除？" onConfirm={() => removeTag(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入标签名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 200 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={async () => {
            if (!name.trim()) return;
            await addTag(name.trim());
            setName('');
            message.success('添加成功');
          }}
        >
          添加
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={tags} size="small" />
    </div>
  );
}

function DispatchTypeConfig() {
  const { dispatchTypes, loadDispatchTypes, addDispatchType, removeDispatchType } = useConfigStore();
  const [name, setName] = useState('');

  useEffect(() => { loadDispatchTypes(); }, []);

  const columns: ColumnsType<DispatchType> = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '发文类型', dataIndex: 'name' },
    {
      title: '操作',
      width: 100,
      render: (_, record) => (
        <Popconfirm title="确定删除？" onConfirm={() => removeDispatchType(record.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="输入发文类型名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: 200 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={async () => {
            if (!name.trim()) return;
            await addDispatchType(name.trim());
            setName('');
            message.success('添加成功');
          }}
        >
          添加
        </Button>
      </Space>
      <Table rowKey="id" columns={columns} dataSource={dispatchTypes} size="small" />
    </div>
  );
}
