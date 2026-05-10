import { useEffect, useMemo, useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, DatePicker, Popconfirm,
  Upload, message, Card, Typography, Row, Col, Transfer, Divider, Tag, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined,
  NotificationOutlined, CopyOutlined, ImportOutlined, ExportOutlined, MoreOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMeetingStore, Meeting, MeetingFile, MeetingAttendee } from '@/stores/meetingStore';
import { useUnitStore } from '@/stores/unitStore';
import { copyToClipboard, db } from '@/db';

const defaultTemplate = `会议通知

主题：{{主题}}
时间：{{时间}}
地点：{{地点}}
备注：{{备注}}
参会领导：{{参会领导}}
参会人员：{{参会人员}}

请各位参会人员准时参加。`;

function fillTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, key) => data[key.trim()] || '');
}

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function formatMeetingTime(dt: string | null, endDt?: string | null): string {
  if (!dt) return '';
  const d = dayjs(dt);
  if (!d.isValid()) return dt + (endDt ? ` ~ ${endDt}` : '');
  const today = dayjs().startOf('day');
  const diffDays = d.startOf('day').diff(today, 'day');

  const dateStr = d.format('M月D日');
  const todayDow = today.day() === 0 ? 7 : today.day();
  const targetDow = d.day() === 0 ? 7 : d.day();

  let label = '';
  if (diffDays === 0) {
    label = '今天';
  } else if (diffDays === 1) {
    label = '明天';
  } else if (diffDays <= 7 - todayDow) {
    label = `周${WEEK_NAMES[d.day()]}`;
  } else if (diffDays <= 14 - todayDow) {
    label = `下周${WEEK_NAMES[d.day()]}`;
  }

  const datePart = label ? `${dateStr}（${label}）` : dateStr;

  const hour = d.hour();
  let period = '早上';
  if (hour >= 0 && hour <= 5) period = '凌晨';
  else if (hour >= 6 && hour <= 8) period = '早上';
  else if (hour >= 9 && hour <= 11) period = '上午';
  else if (hour >= 12 && hour <= 13) period = '中午';
  else if (hour >= 14 && hour <= 17) period = '下午';
  else if (hour >= 18) period = '晚上';

  const startStr = `${datePart}${period}${d.format('HH:mm')}`;

  if (endDt) {
    const e = dayjs(endDt);
    if (!e.isValid()) return `${startStr} ~ ${endDt}`;
    const endHour = e.hour();
    let endPeriod = '早上';
    if (endHour >= 0 && endHour <= 5) endPeriod = '凌晨';
    else if (endHour >= 6 && endHour <= 8) endPeriod = '早上';
    else if (endHour >= 9 && endHour <= 11) endPeriod = '上午';
    else if (endHour >= 12 && endHour <= 13) endPeriod = '中午';
    else if (endHour >= 14 && endHour <= 17) endPeriod = '下午';
    else if (endHour >= 18) endPeriod = '晚上';

    // Same day, only show time for end
    if (d.format('YYYY-MM-DD') === e.format('YYYY-MM-DD')) {
      return `${startStr} ~ ${endPeriod}${e.format('HH:mm')}`;
    }
    // Different day - show full date for end
    const endDateStr = e.format('M月D日');
    return `${startStr} ~ ${endDateStr}${endPeriod}${e.format('HH:mm')}`;
  }

  return startStr;
}

export default function MeetingsPage() {
  const store = useMeetingStore();
  const { contacts, loadContacts } = useUnitStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [fileVisible, setFileVisible] = useState(false);
  const [notifyVisible, setNotifyVisible] = useState(false);
  const [currentId, setCurrentId] = useState(0);
  const [targetKeys, setTargetKeys] = useState<string[]>([]);
  const [template, setTemplate] = useState(defaultTemplate);
  const [notifyText, setNotifyText] = useState('');
  const [receiptText, setReceiptText] = useState('');
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(dayjs().year());
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [clearPwdOpen, setClearPwdOpen] = useState(false);
  const [clearPwd, setClearPwd] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    store.loadMeetings(
      keyword || undefined,
      dateRange ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')] : undefined,
      selectedYear
    );
    loadContacts();
    loadTemplate();
    setCurrentPage(1);
  }, [keyword, dateRange, selectedYear]);

  const loadTemplate = async () => {
    const row = await db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'meeting_template'"
    );
    setTemplate(row?.value || defaultTemplate);
  };

  const saveTemplate = async () => {
    await db.run(
      "INSERT OR REPLACE INTO config (key, value) VALUES ('meeting_template', ?)",
      [template]
    );
    message.success('通知模版已保存');
  };

  // Slice data for current page, then compute rowSpan within that page only
  const { pagedMeetings, dateRowSpanMap } = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const slice = store.meetings.slice(start, start + pageSize);

    const counts = new Map<string, number>();
    for (const m of slice) {
      let dk: string;
      if (!m.meeting_time) { dk = `_none_${m.id}`; }
      else { const d = dayjs(m.meeting_time); dk = d.isValid() ? d.format('YYYY-MM-DD') : m.meeting_time!; }
      counts.set(dk, (counts.get(dk) || 0) + 1);
    }
    const seen = new Set<string>();
    const map = new Map<number, number>();
    for (const m of slice) {
      let dk: string;
      if (!m.meeting_time) { dk = `_none_${m.id}`; }
      else { const d = dayjs(m.meeting_time); dk = d.isValid() ? d.format('YYYY-MM-DD') : m.meeting_time!; }
      const span = counts.get(dk) || 1;
      if (seen.has(dk)) { map.set(m.id, 0); } else { seen.add(dk); map.set(m.id, span); }
    }
    return { pagedMeetings: slice, dateRowSpanMap: map };
  }, [store.meetings, currentPage, pageSize]);

  const columns: ColumnsType<Meeting> = [
    {
      title: '日期',
      dataIndex: 'meeting_time',
      width: 100,
      onCell: (record) => ({
        rowSpan: dateRowSpanMap.get(record.id) ?? 1,
      }),
      render: (v) => {
        if (!v) return '-';
        const d = dayjs(v);
        if (d.isValid()) return d.format('M月D日');
        // Try to extract date part from "YYYY-MM-DD ..." style raw text
        const m = v.match(/^(\d{4}-\d{1,2}-\d{1,2})/);
        if (m) {
          const dd = dayjs(m[1]);
          if (dd.isValid()) return dd.format('M月D日');
        }
        return v;
      },
    },
    {
      title: '时间',
      dataIndex: 'meeting_time',
      width: 130,
      render: (v, record) => {
        if (!v) return '-';
        const d = dayjs(v);
        if (d.isValid()) {
          let text = d.format('HH:mm');
          if (record.meeting_time_end) {
            const e = dayjs(record.meeting_time_end);
            if (e.isValid()) {
              if (d.format('YYYY-MM-DD') === e.format('YYYY-MM-DD')) {
                text += ` ~ ${e.format('HH:mm')}`;
              } else {
                text += ` ~ ${e.format('M月D日 HH:mm')}`;
              }
            } else {
              text += ` ~ ${record.meeting_time_end}`;
            }
          }
          return text;
        }
        // Try to extract time part from "YYYY-MM-DD HH:MM" or "... HH:MM ..." style raw text
        const tm = v.match(/(\d{1,2}:\d{2})/);
        if (tm) {
          let text = tm[1];
          if (record.meeting_time_end) {
            const em = record.meeting_time_end.match(/(\d{1,2}:\d{2})/);
            if (em) text += ` ~ ${em[1]}`;
          }
          return text;
        }
        return v;
      },
    },
    {
      title: '会议主题',
      dataIndex: 'subject',
      render: (v) => (
        <div
          style={{
            whiteSpace: 'pre-wrap',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {v || '-'}
        </div>
      ),
    },
    {
      title: '会议地点',
      dataIndex: 'location',
      width: 140,
      render: (v) => v || '-',
    },
    {
      title: '参会人员',
      dataIndex: 'attendees',
      width: 160,
      render: (arr: MeetingAttendee[] | undefined) => {
        if (!arr || arr.length === 0) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <div style={{ lineHeight: 1.6 }}>
            {arr.map((a) => (
              <div key={a.id}>{a.contact_alias || a.contact_name || `#${a.contact_id}`}</div>
            ))}
          </div>
        );
      },
    },
    {
      title: '备注',
      dataIndex: 'notes',
      width: 200,
      render: (v) => (
        <div
          style={{
            maxHeight: '7.5em',
            lineHeight: '1.5em',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            whiteSpace: 'pre-wrap',
          }}
        >
          {v || '-'}
        </div>
      ),
    },
    {
      title: '参会领导',
      dataIndex: 'leaders',
      width: 140,
      render: (v) => v || <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '操作',
      width: 200,
      render: (_, record) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="small" icon={<NotificationOutlined />} onClick={() => openNotify(record)}>
            通知
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'files', label: '文件', icon: <FileTextOutlined />, onClick: () => openFiles(record.id) },
                { type: 'divider' as const },
                {
                  key: 'delete', label: '删除', danger: true, icon: <DeleteOutlined />,
                  onClick: () => { store.removeMeeting(record.id); message.success('已删除'); },
                },
              ],
            }}
          >
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const openEdit = (record?: Meeting) => {
    if (record) {
      setEditing(record);
      form.setFieldsValue({
        ...record,
        meeting_time: record.meeting_time ? dayjs(record.meeting_time) : null,
        meeting_time_end: record.meeting_time_end ? dayjs(record.meeting_time_end) : null,
      });
      setTargetKeys([]);
      loadAttendeeKeys(record.id);
    } else {
      setEditing(null);
      form.resetFields();
      setTargetKeys([]);
    }
    setFormOpen(true);
  };

  const openFiles = (meetingId: number) => {
    setCurrentId(meetingId);
    store.loadFiles(meetingId);
    setFileVisible(true);
  };

  const openNotify = async (record: Meeting) => {
    setCurrentId(record.id);
    const row = await db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'meeting_template'"
    );
    const tmpl = row?.value || defaultTemplate;
    setTemplate(tmpl);
    store.loadAttendees(record.id).then(() => {
      const attendeeNames = store.attendees.map((a: any) => `@${a.contact_name}`).join(' ');
      const text = fillTemplate(tmpl, {
        '主题': record.subject,
        '时间': formatMeetingTime(record.meeting_time, record.meeting_time_end),
        '地点': record.location || '',
        '备注': record.notes || '',
        '参会领导': record.leaders || '',
        '参会人员': attendeeNames,
      });
      setNotifyText(text);
      const receiptParts = [`参会回执：${record.subject}`, '='.repeat(30)];
      if (record.leaders) {
        receiptParts.push(`【参会领导】${record.leaders}`);
      }
      receiptParts.push(
        store.attendees
          .map((a: any) => `${a.contact_name} ${a.contact_title || ''} ${a.contact_phone || ''}`.trim().replace(/\s+/g, ' '))
          .join('\n')
      );
      setReceiptText(receiptParts.join('\n') || '暂无参会人员');
    });
    setNotifyVisible(true);
  };

  const loadAttendeeKeys = (meetingId: number) => {
    store.loadAttendees(meetingId).then(() => {
      setTargetKeys(store.attendees.map((a: any) => String(a.contact_id)));
    });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      meeting_time: values.meeting_time ? values.meeting_time.format('YYYY-MM-DD HH:mm') : null,
      meeting_time_end: values.meeting_time_end ? values.meeting_time_end.format('YYYY-MM-DD HH:mm') : null,
    };
    let meetingId: number;
    if (editing) {
      meetingId = editing.id;
      await store.updateMeeting(meetingId, data);
    } else {
      meetingId = await store.addMeeting(data);
      setCurrentId(meetingId);
    }
    await store.setAttendees(meetingId, targetKeys.map(Number));
    message.success(editing ? '更新成功' : '创建成功');
    setFormOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleUpload = async (meetingId: number, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = reader.result as ArrayBuffer;
      const savedPath = await window.electronAPI.file.saveFile(buffer);
      if (savedPath) {
        await store.addFile(meetingId, file.name, savedPath);
        message.success('文件关联成功');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const copyNotify = async () => {
    await copyToClipboard(notifyText);
    message.success('会议通知已复制到剪贴板，可发送至微信等聊天工具');
  };

  const copyReceipt = async () => {
    await copyToClipboard(receiptText);
    message.success('参会回执已复制到剪贴板');
  };

  const refreshNotify = () => {
    const meeting = store.meetings.find((m) => m.id === currentId);
    if (!meeting) return;
    const attendeeNames = store.attendees.map((a: any) => `@${a.contact_name}`).join(' ');
    const text = fillTemplate(template, {
      '主题': meeting.subject,
      '时间': formatMeetingTime(meeting.meeting_time, meeting.meeting_time_end),
      '地点': meeting.location || '',
      '备注': meeting.notes || '',
      '参会领导': meeting.leaders || '',
      '参会人员': attendeeNames,
    });
    setNotifyText(text);
  };

  const handleImport = async () => {
    const result = await window.electronAPI.file.openFile({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
    });
    if (!result) return;
    try {
      const { imported, skipped } = await store.importFromExcel(result.data, selectedYear);
      message.success(`导入完成：成功 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`);
    } catch (e: any) {
      message.error(`导入失败：${e.message || '请检查文件格式'}`);
    }
  };

  const handleExport = async () => {
    try {
      const data = await store.exportToExcel(selectedYear);
      await window.electronAPI.file.saveFile(data, {
        defaultName: `${selectedYear}年会议安排表.xlsx`,
        filters: [{ name: 'Excel文件', extensions: ['xlsx'] }],
      });
      message.success('导出成功');
    } catch (e: any) {
      message.error(`导出失败：${e.message || '未知错误'}`);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 104px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 12, flexShrink: 0 }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>新建会议</Button>
          <Select
            value={selectedYear}
            onChange={(v) => setSelectedYear(v)}
            style={{ width: 90 }}
            options={Array.from({ length: 5 }, (_, i) => ({ value: dayjs().year() - i, label: `${dayjs().year() - i}年` }))}
          />
          <Input.Search placeholder="搜索会议主题" allowClear style={{ width: 200 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={(v) => setKeyword(v)} />
          <DatePicker.RangePicker value={dateRange} onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)} placeholder={['会议开始', '会议结束']} />
          <Button icon={<ImportOutlined />} onClick={handleImport}>导入</Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => { setClearPwd(''); setClearPwdOpen(true); }}>
            清除数据
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <Table
          rowKey="id" columns={columns} dataSource={pagedMeetings} size="small"
          sticky={{ offsetHeader: 0 }}
          scroll={{ x: 1100 }}
          pagination={{
            current: currentPage,
            pageSize,
            total: store.meetings.length,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} / 共 ${t} 条`,
            onChange: (page, size) => {
              setCurrentPage(page);
              if (size !== pageSize) {
                setPageSize(size);
                setCurrentPage(1);
              }
            },
          }}
        />
      </div>

      <Modal
        title={editing ? '编辑会议' : '新建会议'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setEditing(null); form.resetFields(); }}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="subject" label="会议主题" rules={[{ required: true, message: '请输入会议主题' }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="meeting_time" label="会议开始时间">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="meeting_time_end" label="会议结束时间">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="location" label="会议地点">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="leaders" label="参会领导">
            <Input placeholder="请输入参会领导" />
          </Form.Item>
        </Form>

        <Divider>参会人员</Divider>
        <Transfer
          dataSource={contacts.map((c) => ({
            key: String(c.id),
            title: c.name,
            description: `${c.title || ''} ${c.phone || ''}`,
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
        title={
          <span>
            关联文件
            {store.meetings.find((m) => m.id === currentId) && (
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {store.meetings.find((m) => m.id === currentId)!.subject}
              </Tag>
            )}
          </span>
        }
        open={fileVisible}
        onCancel={() => setFileVisible(false)}
        footer={null}
      >
        <Upload
          beforeUpload={async (file) => {
            await handleUpload(currentId, file);
            return false;
          }}
          showUploadList={false}
        >
          <Button icon={<PlusOutlined />}>上传文件</Button>
        </Upload>
        <Table
          style={{ marginTop: 16 }}
          rowKey="id"
          size="small"
          dataSource={store.files}
          columns={[
            { title: '文件名', dataIndex: 'file_name' },
            {
              title: '操作',
              width: 80,
              render: (_, record: MeetingFile) => (
                <Popconfirm title="确定删除？" onConfirm={() => store.removeFile(record.id)}>
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={
          <span>
            生成会议通知
            {store.meetings.find((m) => m.id === currentId) && (
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {store.meetings.find((m) => m.id === currentId)!.subject}
              </Tag>
            )}
          </span>
        }
        open={notifyVisible}
        onCancel={() => setNotifyVisible(false)}
        width={720}
        footer={null}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>通知模版</Typography.Title>
          <Button size="small" onClick={() => { saveTemplate(); }}>保存模版</Button>
        </div>
        <Input.TextArea
          rows={6}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          style={{ fontFamily: 'monospace', marginBottom: 16 }}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          可用变量：{`{{主题}} {{时间}} {{地点}} {{备注}} {{参会领导}} {{参会人员}}`}
        </Typography.Text>
        <div style={{ marginBottom: 16, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['主题','时间','地点','备注','参会领导','参会人员'].map((v) => (
            <Button key={v} size="small" onClick={() => setTemplate(template + `{{${v}}}`)}>
              {v}
            </Button>
          ))}
        </div>

        <Divider />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>通知预览</Typography.Title>
          <Space>
            <Button size="small" onClick={refreshNotify}>刷新预览</Button>
            <Button size="small" type="primary" icon={<CopyOutlined />} onClick={copyNotify}>复制通知</Button>
          </Space>
        </div>
        <Card
          style={{ background: '#fafafa', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}
        >
          {notifyText}
        </Card>

        <Divider />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>参会回执</Typography.Title>
          <Button size="small" icon={<CopyOutlined />} onClick={copyReceipt}>复制回执</Button>
        </div>
        <Card
          style={{ background: '#fafafa', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 13 }}
        >
          {receiptText}
        </Card>
      </Modal>

      <Modal
        title="验证密码"
        open={clearPwdOpen}
        onOk={async () => {
          if (clearPwd !== 'zrzy86002718') {
            message.error('密码错误');
            return;
          }
          await store.clearAll();
          message.success('已清除所有会议数据');
          setClearPwdOpen(false);
        }}
        onCancel={() => setClearPwdOpen(false)}
      >
        <Input.Password
          placeholder="请输入清除密码"
          value={clearPwd}
          onChange={(e) => setClearPwd(e.target.value)}
        />
      </Modal>
    </div>
  );
}
