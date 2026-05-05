import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Table, Button, Modal, Form, Input, Select, DatePicker, Popconfirm,
  message, Card, Tag, Space,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined, ArrowLeftOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useArchiveStore, ArchiveRecord } from '@/stores/archiveStore';
import { db } from '@/db';

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

export default function ArchiveRecordsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewing, setViewing] = useState<ArchiveRecord | null>(null);
  const [docOptions, setDocOptions] = useState<{ id: number; title: string; reply_deadline: string | null }[]>([]);
  const [form] = Form.useForm();
  const boxIdParam = searchParams.get('boxId');
  const filterBoxId = boxIdParam ? Number(boxIdParam) : undefined;

  const store = useArchiveStore();

  const boxType = filterBoxId ? store.boxes.find((b) => b.id === filterBoxId)?.box_type : undefined;

  useEffect(() => {
    store.loadBoxes();
    store.loadRecords(filterBoxId);
  }, [filterBoxId]);

  const recordColumns: ColumnsType<ArchiveRecord> = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '归档序号', dataIndex: 'archive_number', width: 80 },
    {
      title: '文件盒编号',
      dataIndex: 'box_number',
      width: 100,
      render: (v) => v || '-',
    },
    {
      title: '归档类型',
      dataIndex: 'doc_type',
      width: 80,
      render: (v) => <Tag color={boxTypeColors[v] || 'default'}>{boxTypeLabels[v] || v}</Tag>,
    },
    { title: '文件标题', dataIndex: 'doc_title', ellipsis: true, render: (v) => v || '-' },
    { title: '回文日期', dataIndex: 'reply_date', width: 120, render: (v) => v || '-' },
    { title: '归档时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setViewing(record); setDetailOpen(true); }}>
            查看
          </Button>
          <Popconfirm title="确定删除？" onConfirm={() => store.removeRecord(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleRecordSubmit = async () => {
    const values = await form.validateFields();
    await store.addRecord({
      ...values,
      archive_box_id: filterBoxId!,
      doc_type: boxType!,
      reply_date: values.reply_date ? values.reply_date.format('YYYY-MM-DD') : null,
    });
    message.success('归档登记成功');
    setFormOpen(false);
    form.resetFields();
  };

  return (
    <div>
      <Card
        size="small"
        title={filterBoxId ? `归档记录 - ${store.boxes.find((b) => b.id === filterBoxId)?.box_number || `#${filterBoxId}`}` : '全部归档记录'}
        extra={
          <Space>
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/archives')}>返回</Button>
            <Button
              size="small"
              icon={<PlusOutlined />}
              disabled={store.boxes.length === 0}
              onClick={async () => {
                form.resetFields();
                const maxNum = store.records.reduce((max, r) => Math.max(max, r.archive_number || 0), 0);
                form.setFieldsValue({ archive_number: maxNum + 1 });
                if (boxType === 'outgoing') {
                  const rows = await db.all<{ id: number; title: string; reply_deadline: string | null }>(
                    `SELECT id, title, reply_deadline FROM outgoing_docs
                     WHERE status = 'done'
                     AND id NOT IN (SELECT doc_id FROM archive_records WHERE doc_type = 'outgoing')
                     ORDER BY id DESC`
                  );
                  setDocOptions(rows);
                } else {
                  const rows = await db.all<{ id: number; title: string; reply_deadline: string | null }>(
                    `SELECT id, title, reply_deadline FROM incoming_docs
                     WHERE status = 'done'
                     AND id NOT IN (SELECT doc_id FROM archive_records WHERE doc_type = '${boxType || 'incoming'}')
                     ORDER BY id DESC`
                  );
                  setDocOptions(rows);
                }
                setFormOpen(true);
              }}
            >
              新增归档
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={recordColumns}
          dataSource={store.records}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
          scroll={{ x: 900, y: 'calc(100vh - 290px)' }}
        />
      </Card>

      <Modal
        title="归档记录详情"
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setViewing(null); }}
        footer={null}
        width={480}
      >
        {viewing && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold', width: 80 }}>ID</td><td style={{ padding: '8px 12px' }}>{viewing.id}</td></tr>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold' }}>归档序号</td><td style={{ padding: '8px 12px' }}>{viewing.archive_number || '-'}</td></tr>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold' }}>文件盒编号</td><td style={{ padding: '8px 12px' }}>{viewing.box_number || '-'}</td></tr>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold' }}>归档类型</td><td style={{ padding: '8px 12px' }}><Tag color={boxTypeColors[viewing.doc_type] || 'default'}>{boxTypeLabels[viewing.doc_type] || viewing.doc_type}</Tag></td></tr>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold' }}>文件标题</td><td style={{ padding: '8px 12px' }}>{viewing.doc_title || '-'}</td></tr>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold' }}>回文日期</td><td style={{ padding: '8px 12px' }}>{viewing.reply_date || '-'}</td></tr>
              <tr><td style={{ padding: '8px 12px', fontWeight: 'bold' }}>归档时间</td><td style={{ padding: '8px 12px' }}>{viewing.created_at}</td></tr>
            </tbody>
          </table>
        )}
      </Modal>

      <Modal
        title="新增归档记录"
        open={formOpen}
        onOk={handleRecordSubmit}
        onCancel={() => { setFormOpen(false); form.resetFields(); }}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="归档类型">
            <Tag color={boxType ? boxTypeColors[boxType] : 'default'}>
              {boxType ? boxTypeLabels[boxType] : ''}
            </Tag>
          </Form.Item>
          <Form.Item label="归档文件盒">
            <Input disabled value={filterBoxId ? (() => {
              const b = store.boxes.find((x) => x.id === filterBoxId);
              return b ? `${b.box_number} (${boxTypeLabels[b.box_type]})` : '';
            })() : ''} />
          </Form.Item>
          <Form.Item name="archive_number" label="归档序号">
            <Input type="number" />
          </Form.Item>
          <Form.Item name="doc_id" label="选择文件" rules={[{ required: true, message: '请选择文件' }]}>
            <Select
              showSearch
              placeholder="搜索并选择文件"
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={docOptions.map((d) => ({
                label: `#${d.id} ${d.title}`,
                value: d.id,
                replyDeadline: d.reply_deadline,
              }))}
              onChange={(_, option) => {
                const replyDeadline = (option as any)?.replyDeadline;
                if (replyDeadline) {
                  form.setFieldsValue({ reply_date: dayjs(replyDeadline) });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="reply_date" label="回文日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
