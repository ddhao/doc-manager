import { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, Table, Select, Tag, Statistic, Space } from 'antd';
import {
  ExclamationCircleOutlined, AlertOutlined, InboxOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useIncomingStore, IncomingDoc, DocDepartment, roleLabels } from '@/stores/incomingStore';
import { useUnitStore } from '@/stores/unitStore';
import { useConfigStore } from '@/stores/configStore';

type DashboardFilter = 'all' | 'overdue' | 'dueSoon';

const levelColors: Record<string, string> = {
  '特急': 'red', '加急': 'orange', '急': 'gold',
};

export default function DashboardPage() {
  const { docs: incomingDocs, loadDocs: loadIncoming, updateDocStatus } = useIncomingStore();
  const { departments, loadDepartments } = useUnitStore();
  const { levels, loadLevels } = useConfigStore();
  const [filterDept, setFilterDept] = useState<number | undefined>();
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>('all');
  const [incomingPageSize, setIncomingPageSize] = useState(10);

  useEffect(() => {
    loadIncoming(filterDept);
    loadDepartments();
    loadLevels();
  }, [filterDept]);

  const today = dayjs().startOf('day');

  const activeIncomingDocs = useMemo(() => {
    return incomingDocs.filter((d) => d.status !== 'done');
  }, [incomingDocs]);

  const needReplyDocs = useMemo(() => {
    return activeIncomingDocs.filter((d) => d.reply_deadline);
  }, [activeIncomingDocs]);

  const stats = useMemo(() => {
    const total = activeIncomingDocs.length;
    const overdue = needReplyDocs.filter((d) =>
      dayjs(d.reply_deadline).isBefore(today, 'day')
    ).length;
    const dueSoon = needReplyDocs.filter((d) => {
      const dl = dayjs(d.reply_deadline);
      return dl.diff(today, 'day') >= 0 && dl.diff(today, 'day') <= 2;
    }).length;
    return { total, overdue, dueSoon };
  }, [activeIncomingDocs, needReplyDocs]);

  const filteredDocs = useMemo(() => {
    if (activeFilter === 'overdue') {
      return needReplyDocs.filter((d) => dayjs(d.reply_deadline).isBefore(today, 'day'));
    }
    if (activeFilter === 'dueSoon') {
      return needReplyDocs.filter((d) => {
        const dl = dayjs(d.reply_deadline);
        return dl.diff(today, 'day') >= 0 && dl.diff(today, 'day') <= 2;
      });
    }
    return activeIncomingDocs;
  }, [activeIncomingDocs, needReplyDocs, activeFilter]);

  const getRowStyle = (record: IncomingDoc) => {
    if (!record.reply_deadline) return {};
    const deadline = dayjs(record.reply_deadline);
    const diff = deadline.diff(today, 'day');
    if (diff < 0) return { background: '#fff1f0', borderLeft: '3px solid #ff4d4f' };
    if (diff <= 1) return { background: '#fffbe6', borderLeft: '3px solid #faad14' };
    if (diff <= 2) return { background: '#e6f7ff', borderLeft: '3px solid #1890ff' };
    return {};
  };

  const allStatuses = [
    { key: 'pending', color: 'blue', text: '待处理' },
    { key: 'processing', color: 'orange', text: '处理中' },
    { key: 'replied', color: 'green', text: '已回文' },
    { key: 'done', color: 'cyan', text: '已办结' },
  ];

  const incomingColumns: ColumnsType<IncomingDoc> = [
    { title: '呈批编号', dataIndex: 'approval_number', width: 120, render: (v) => v || '-' },
    { title: '来文单位', dataIndex: 'send_unit_name', width: 130, render: (v) => v || '-' },
    {
      title: '标题',
      dataIndex: 'title',
      width: 400,
      render: (title: string, record: IncomingDoc) => (
        <div
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          <Space size={4}>
            {record.level && record.level !== '平' && (
              <Tag color={levelColors[record.level] || 'default'} style={{ flexShrink: 0 }}>{record.level}</Tag>
            )}
            {record.document_tag && <Tag color="cyan" style={{ flexShrink: 0 }}>{record.document_tag}</Tag>}
            <span>{title}</span>
          </Space>
        </div>
      ),
    },
    {
      title: '转发股室',
      dataIndex: 'departments',
      width: 200,
      render: (deps: DocDepartment[] | undefined) => {
        if (!deps || deps.length === 0) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <Space size={[2, 2]} wrap>
            {deps.map((d) => (
              <Tag key={d.department_id} color={d.role === 'lead' ? 'red' : d.role === 'summary' ? 'purple' : d.role === 'read_handle' ? 'green' : 'blue'}>
                {d.department_name || `#${d.department_id}`}({roleLabels[d.role]})
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '回复截止',
      dataIndex: 'reply_deadline',
      width: 145,
      sorter: (a, b) => (a.reply_deadline || '').localeCompare(b.reply_deadline || ''),
      defaultSortOrder: 'ascend',
      render: (v) => {
        if (!v) return <span style={{ color: '#ccc' }}>-</span>;
        const deadline = dayjs(v);
        const diff = deadline.diff(today, 'day');
        const dateStr = (
          <span style={{ fontSize: 13, fontWeight: 600, color: diff < 0 ? '#ff4d4f' : '#262626' }}>{v}</span>
        );
        let badge: React.ReactNode = null;
        if (diff < 0) badge = <Tag color="red" style={{ fontSize: 11, lineHeight: '16px', marginTop: 2 }}>超期{diff}天</Tag>;
        else if (diff === 0) badge = <Tag color="orange" style={{ fontSize: 11, lineHeight: '16px', marginTop: 2 }}>今日到期</Tag>;
        else if (diff <= 2) badge = <Tag color="blue" style={{ fontSize: 11, lineHeight: '16px', marginTop: 2 }}>剩余{diff}天</Tag>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {dateStr}
            {badge}
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v, record) => (
        <Select size="small" value={v} style={{ width: 100 }} onChange={(val) => updateDocStatus(record.id, val)}
          options={allStatuses.map((st) => ({ value: st.key, label: <Tag color={st.color} style={{ marginRight: 0 }}>{st.text}</Tag> }))}
        />
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" style={{ cursor: 'pointer', border: activeFilter === 'all' ? '2px solid #1677ff' : undefined }} onClick={() => setActiveFilter('all')}>
            <Statistic title="待回复" value={stats.total} prefix={<InboxOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ cursor: 'pointer', border: activeFilter === 'overdue' ? '2px solid #ff4d4f' : undefined }} onClick={() => setActiveFilter('overdue')}>
            <Statistic title="已逾期" value={stats.overdue} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: stats.overdue > 0 ? '#ff4d4f' : '#52c41a' }} suffix={stats.overdue > 0 ? <Tag color="red">需要关注</Tag> : ''} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ cursor: 'pointer', border: activeFilter === 'dueSoon' ? '2px solid #faad14' : undefined }} onClick={() => setActiveFilter('dueSoon')}>
            <Statistic title="近2日到期" value={stats.dueSoon} prefix={<AlertOutlined />} valueStyle={{ color: stats.dueSoon > 0 ? '#faad14' : '#52c41a' }} />
          </Card>
        </Col>
      </Row>
      <Card
        size="small"
        title={activeFilter === 'overdue' ? '已逾期的收文' : activeFilter === 'dueSoon' ? '近2日到期的收文' : '全部收文'}
        extra={
          <Select allowClear placeholder="按股室筛选" style={{ width: 180 }} value={filterDept} onChange={(v) => setFilterDept(v)}>
            {departments.map((d) => (
              <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
            ))}
          </Select>
        }
      >
        <Table rowKey="id" columns={incomingColumns} dataSource={filteredDocs} size="small" scroll={{ x: 900, y: 'calc(100vh - 380px)' }}
          pagination={{ pageSize: incomingPageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条`, onChange: (_, size) => setIncomingPageSize(size) }}
          onRow={(record) => ({ style: { ...getRowStyle(record), transition: 'background 0.3s' } })}
        />
      </Card>
    </div>
  );
}
