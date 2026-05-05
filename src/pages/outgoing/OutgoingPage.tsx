import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, DatePicker, Tag, Dropdown, message,
  Transfer, Divider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, MoreOutlined, CheckCircleOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useOutgoingStore, OutgoingDoc, OutgoingDocUnit } from '@/stores/outgoingStore';
import { useUnitStore } from '@/stores/unitStore';
import { useConfigStore } from '@/stores/configStore';
import { useArchiveStore } from '@/stores/archiveStore';
import { db } from '@/db';

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'blue', text: '待处理' },
  processing: { color: 'orange', text: '处理中' },
  replied: { color: 'green', text: '已回复' },
  done: { color: 'cyan', text: '已办结' },
};

const levelColors: Record<string, string> = {
  '特急': 'red', '加急': 'orange', '急': 'gold', '平': 'green',
};

export default function OutgoingPage() {
  const { docs, loadDocs, addDoc, updateDoc, updateDocStatus, toggleUnitRead, removeDoc } = useOutgoingStore();
  const { units, loadUnits } = useUnitStore();
  const { levels, loadLevels } = useConfigStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OutgoingDoc | null>(null);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivingDoc, setArchivingDoc] = useState<OutgoingDoc | null>(null);
  const [archivedDocIds, setArchivedDocIds] = useState<Set<number>>(new Set());
  const [archiveForm] = Form.useForm();
  const archiveStore = useArchiveStore();
  const [form] = Form.useForm();

  const loadArchivedIds = async () => {
    const rows = await db.all<{ doc_id: number }>(
      "SELECT doc_id FROM archive_records WHERE doc_type = 'outgoing'"
    );
    setArchivedDocIds(new Set(rows.map((r) => r.doc_id)));
  };

  useEffect(() => {
    loadDocs(
      keyword || undefined,
      dateRange ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')] : undefined
    );
    loadUnits();
    loadLevels();
    loadArchivedIds();
  }, [keyword, dateRange]);

  const getUrgencyStyle = (deadline: string | null) => {
    if (!deadline) return {};
    const diff = dayjs(deadline).diff(dayjs(), 'day');
    if (diff <= 1) return { background: '#fff2f0', fontWeight: 600 };
    if (diff <= 3) return { background: '#fffbe6' };
    return {};
  };

  const columns: ColumnsType<OutgoingDoc> = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    {
      title: '发文标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, record: OutgoingDoc) => (
        <Space size={4}>
          {record.level && record.level !== '平' && (
            <Tag color={levelColors[record.level] || 'default'} style={{ flexShrink: 0 }}>{record.level}</Tag>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        </Space>
      ),
    },
    {
      title: '收文单位',
      dataIndex: 'units',
      width: 200,
      render: (arr: OutgoingDocUnit[] | undefined, record: OutgoingDoc) => {
        if (!arr || arr.length === 0) return <span style={{ color: '#ccc' }}>-</span>;
        const isArchived = archivedDocIds.has(record.id);
        return (
          <Space size={[2, 2]} wrap>
            {arr.map((u) => (
              <Tag
                key={u.id}
                color={u.is_read ? 'green' : 'default'}
                icon={u.is_read ? <CheckCircleOutlined /> : undefined}
                style={{ cursor: isArchived ? 'default' : 'pointer' }}
                onClick={() => { if (!isArchived) toggleUnitRead(record.id, u.unit_id); }}
              >
                {u.unit_name || `#${u.unit_id}`}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '回复截止',
      dataIndex: 'reply_deadline',
      width: 120,
      sorter: (a, b) => (a.reply_deadline || '').localeCompare(b.reply_deadline || ''),
      render: (v) => {
        if (!v) return '-';
        const diff = dayjs(v).diff(dayjs(), 'day');
        if (diff < 0) return <span style={{ color: 'red' }}>{v} (已超期)</span>;
        if (diff <= 1) return <span style={{ color: 'orange' }}>{v} (即将到期)</span>;
        return v;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v, record) => (
        <Select
          size="small"
          value={v}
          style={{ width: 100 }}
          disabled={archivedDocIds.has(record.id)}
          onChange={(val) => updateDocStatus(record.id, val)}
          options={Object.entries(statusMap).map(([key, st]) => ({
            value: key,
            label: <Tag color={st.color} style={{ marginRight: 0 }}>{st.text}</Tag>,
          }))}
        />
      ),
    },
    {
      title: '操作',
      width: 120,
      render: (_, record) => {
        const isArchived = archivedDocIds.has(record.id);
        return (
        <Dropdown
          menu={{
            items: [
              { key: 'edit', label: '编辑', icon: <EditOutlined />, disabled: isArchived, onClick: () => openEdit(record) },
              ...(record.status === 'done' && !isArchived
                ? [{ key: 'archive', label: '归档', icon: <FileTextOutlined />, onClick: () => openArchive(record) }]
                : []),
              ...(isArchived
                ? [{ key: 'archived', label: '已归档', icon: <FileTextOutlined />, disabled: true }]
                : []),
              { type: 'divider' as const },
              {
                key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined />,
                onClick: () => { removeDoc(record.id); message.success('已删除'); },
              },
            ],
          }}
        >
          <Button size="small" icon={<MoreOutlined />} />
        </Dropdown>
      );},
    },
  ];

  const openEdit = (record: OutgoingDoc) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      reply_deadline: record.reply_deadline ? dayjs(record.reply_deadline) : null,
    });
    setTargetKeys((record.units || []).map((u) => String(u.unit_id)));
    setFormOpen(true);
  };

  const openArchive = async (record: OutgoingDoc) => {
    setArchivingDoc(record);
    await archiveStore.loadBoxes();
    archiveForm.resetFields();
    archiveForm.setFieldsValue({ reply_date: record.reply_deadline ? dayjs(record.reply_deadline) : null });
    setArchiveOpen(true);
  };

  const handleArchiveSubmit = async () => {
    const values = await archiveForm.validateFields();
    await archiveStore.addRecord({
      archive_box_id: values.archive_box_id,
      doc_type: 'outgoing',
      doc_id: archivingDoc!.id,
      reply_date: values.reply_date ? values.reply_date.format('YYYY-MM-DD') : null,
    });
    message.success('归档成功');
    setArchivedDocIds((prev) => new Set(prev).add(archivingDoc!.id));
    setArchiveOpen(false);
    setArchivingDoc(null);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      reply_deadline: values.reply_deadline ? values.reply_deadline.format('YYYY-MM-DD') : null,
    };
    if (editing) {
      await updateDoc(editing.id, data, targetKeys.map(Number));
      message.success('更新成功');
    } else {
      await addDoc(data, targetKeys.map(Number));
      message.success('登记成功');
    }
    setFormOpen(false);
    setEditing(null);
    setTargetKeys([]);
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
            form.resetFields();
            setTargetKeys([]);
            setFormOpen(true);
          }}
        >
          发文登记
        </Button>
        <Input.Search
          placeholder="搜索标题"
          allowClear
          style={{ width: 200 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(v) => setKeyword(v)}
        />
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          placeholder={['创建开始', '创建结束']}
        />
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={docs}
        size="small"
        scroll={{ x: 900, y: 'calc(100vh - 230px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
        onRow={(record) => ({ style: getUrgencyStyle(record.reply_deadline) })}
      />

      <Modal
        title={editing ? '编辑发文' : '发文登记'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setEditing(null); setTargetKeys([]); form.resetFields(); }}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="发文标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="level" label="发文等级">
            <Select allowClear placeholder="选择发文等级">
              {levels.map((l) => (
                <Select.Option key={l.id} value={l.name}>
                  <Tag color={levelColors[l.name] || 'default'}>{l.name}</Tag>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="reply_deadline" label="需要回复的截止时间">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>

        <Divider>收文单位（多选）</Divider>
        <Transfer
          dataSource={units.map((u) => ({
            key: String(u.id),
            title: u.name,
          }))}
          targetKeys={targetKeys}
          onChange={(keys) => setTargetKeys(keys as string[])}
          render={(item) => item.title}
          listStyle={{ width: 280, height: 300 }}
          showSearch
          filterOption={(inputValue, item) =>
            item.title.toLowerCase().includes(inputValue.toLowerCase())
          }
        />
      </Modal>

      <Modal
        title="公文归档"
        open={archiveOpen}
        onOk={handleArchiveSubmit}
        onCancel={() => { setArchiveOpen(false); setArchivingDoc(null); }}
      >
        <Form form={archiveForm} layout="vertical">
          <Form.Item label="归档文件">
            <Input disabled value={archivingDoc?.title || ''} />
          </Form.Item>
          <Form.Item name="archive_box_id" label="归档文件盒" rules={[{ required: true, message: '请选择文件盒' }]}>
            <Select
              placeholder="选择文件盒"
              onChange={async (boxId: number) => {
                const rows = await db.all<{ maxNum: number }>(
                  'SELECT MAX(archive_number) as maxNum FROM archive_records WHERE archive_box_id = ?',
                  [boxId]
                );
                const nextNum = (rows[0]?.maxNum || 0) + 1;
                archiveForm.setFieldsValue({ archive_number: nextNum });
              }}
            >
              {archiveStore.boxes
                .filter((b) => b.box_type === 'outgoing')
                .map((b) => (
                  <Select.Option key={b.id} value={b.id}>{b.box_number}</Select.Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item name="archive_number" label="归档序号">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="reply_date" label="回文日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
