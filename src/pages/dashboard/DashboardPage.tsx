import { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, Table, Select, Tag, Statistic, Space, Tabs } from 'antd';
import {
  ClockCircleOutlined, ExclamationCircleOutlined, AlertOutlined, InboxOutlined, SendOutlined, CalendarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useIncomingStore, IncomingDoc, DocDepartment, roleLabels } from '@/stores/incomingStore';
import { useOutgoingStore, OutgoingDoc, OutgoingDocUnit } from '@/stores/outgoingStore';
import { useMeetingStore, Meeting, MeetingAttendee } from '@/stores/meetingStore';
import { useUnitStore } from '@/stores/unitStore';
import { useConfigStore } from '@/stores/configStore';

type DashboardFilter = 'all' | 'overdue' | 'dueSoon';
type MeetingFilter = 'all' | 'today' | 'week';

const levelColors: Record<string, string> = {
  '特急': 'red', '加急': 'orange', '急': 'gold',
};

const outgoingLevelColors: Record<string, string> = {
  '特急': 'red', '加急': 'orange', '急': 'gold', '平': 'green',
};

export default function DashboardPage() {
  const { docs: incomingDocs, loadDocs: loadIncoming, updateDocStatus } = useIncomingStore();
  const { docs: outgoingDocs, loadDocs: loadOutgoing, updateDocStatus: updateOutgoingStatus } = useOutgoingStore();
  const { meetings, loadMeetings } = useMeetingStore();
  const { departments, loadDepartments } = useUnitStore();
  const { levels, loadLevels } = useConfigStore();
  const [filterDept, setFilterDept] = useState<number | undefined>();
  const [activeFilter, setActiveFilter] = useState<DashboardFilter>('all');
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>('all');
  const [incomingPageSize, setIncomingPageSize] = useState(10);
  const [outgoingPageSize, setOutgoingPageSize] = useState(10);
  const [meetingPageSize, setMeetingPageSize] = useState(10);

  useEffect(() => {
    loadIncoming(filterDept);
    loadOutgoing();
    loadMeetings();
    loadDepartments();
    loadLevels();
  }, [filterDept]);

  const today = dayjs().startOf('day');

  // Incoming
  const needReplyDocs = useMemo(() => {
    return incomingDocs.filter((d) => d.status !== 'done' && d.reply_deadline);
  }, [incomingDocs]);

  const stats = useMemo(() => {
    const total = needReplyDocs.length;
    const overdue = needReplyDocs.filter((d) => {
      if (!d.reply_deadline) return false;
      return dayjs(d.reply_deadline).isBefore(today, 'day');
    }).length;
    const dueSoon = needReplyDocs.filter((d) => {
      if (!d.reply_deadline) return false;
      const dl = dayjs(d.reply_deadline);
      return dl.diff(today, 'day') >= 0 && dl.diff(today, 'day') <= 2;
    }).length;
    return { total, overdue, dueSoon };
  }, [needReplyDocs]);

  const filteredDocs = useMemo(() => {
    const overdueDocs = needReplyDocs.filter((d) => {
      if (!d.reply_deadline) return false;
      return dayjs(d.reply_deadline).isBefore(today, 'day');
    });
    const dueSoonDocs = needReplyDocs.filter((d) => {
      if (!d.reply_deadline) return false;
      const dl = dayjs(d.reply_deadline);
      return dl.diff(today, 'day') >= 0 && dl.diff(today, 'day') <= 2;
    });
    if (activeFilter === 'overdue') return overdueDocs;
    if (activeFilter === 'dueSoon') return dueSoonDocs;
    return needReplyDocs;
  }, [needReplyDocs, activeFilter]);

  // Outgoing
  const needReplyOutgoing = useMemo(() => {
    return outgoingDocs.filter((d) => d.status !== 'done');
  }, [outgoingDocs]);

  const outgoingStats = useMemo(() => {
    const total = needReplyOutgoing.length;
    const overdue = needReplyOutgoing.filter((d) => {
      if (!d.reply_deadline) return false;
      return dayjs(d.reply_deadline).isBefore(today, 'day');
    }).length;
    const dueSoon = needReplyOutgoing.filter((d) => {
      if (!d.reply_deadline) return false;
      const dl = dayjs(d.reply_deadline);
      return dl.diff(today, 'day') >= 0 && dl.diff(today, 'day') <= 2;
    }).length;
    return { total, overdue, dueSoon };
  }, [needReplyOutgoing]);

  const now = dayjs();
  const upcomingMeetings = useMemo(() => {
    return meetings.filter((m) => m.meeting_time && dayjs(m.meeting_time).isAfter(now));
  }, [meetings]);

  const meetingStats = useMemo(() => {
    const total = upcomingMeetings.length;
    const todayList = upcomingMeetings.filter((m) =>
      dayjs(m.meeting_time).isSame(now, 'day')
    ).length;
    const weekList = upcomingMeetings.filter((m) =>
      dayjs(m.meeting_time).diff(now, 'day') <= 7 && !dayjs(m.meeting_time).isSame(now, 'day')
    ).length;
    return { total, today: todayList, week: weekList };
  }, [upcomingMeetings]);

  const filteredMeetings = useMemo(() => {
    if (meetingFilter === 'today') {
      return upcomingMeetings.filter((m) => dayjs(m.meeting_time).isSame(now, 'day'));
    }
    if (meetingFilter === 'week') {
      return upcomingMeetings.filter((m) =>
        dayjs(m.meeting_time).diff(now, 'day') <= 7 && !dayjs(m.meeting_time).isSame(now, 'day')
      );
    }
    return upcomingMeetings;
  }, [upcomingMeetings, meetingFilter]);

  const getRowStyle = (record: IncomingDoc | OutgoingDoc) => {
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

  const meetingColumns: ColumnsType<Meeting> = [
    { title: '会议主题', dataIndex: 'subject', ellipsis: true },
    {
      title: '会议时间',
      dataIndex: 'meeting_time',
      width: 160,
      render: (v) => v || '-',
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
          <Space size={[2, 2]} wrap>
            {arr.map((a) => <Tag key={a.id}>{a.contact_alias || a.contact_name || `#${a.contact_id}`}</Tag>)}
          </Space>
        );
      },
    },
    {
      title: '参会领导',
      dataIndex: 'leaders',
      width: 140,
      render: (v) => v || <span style={{ color: '#ccc' }}>-</span>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
  ];

  const outgoingColumns: ColumnsType<OutgoingDoc> = [
    {
      title: '发文标题',
      dataIndex: 'title',
      render: (title: string, record: OutgoingDoc) => (
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
              <Tag color={outgoingLevelColors[record.level] || 'default'} style={{ flexShrink: 0 }}>{record.level}</Tag>
            )}
            <span>{title}</span>
          </Space>
        </div>
      ),
    },
    {
      title: '收文单位',
      dataIndex: 'units',
      width: 180,
      render: (arr: OutgoingDocUnit[] | undefined) => {
        if (!arr || arr.length === 0) return <span style={{ color: '#ccc' }}>-</span>;
        return (
          <Space size={[2, 2]} wrap>
            {arr.map((u) => <Tag key={u.id}>{u.unit_name || `#${u.unit_id}`}</Tag>)}
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
        <Select size="small" value={v} style={{ width: 100 }} onChange={(val) => updateOutgoingStatus(record.id, val)}
          options={allStatuses.map((st) => ({ value: st.key, label: <Tag color={st.color} style={{ marginRight: 0 }}>{st.text}</Tag> }))}
        />
      ),
    },
  ];

  const incomingContent = (
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
        title={activeFilter === 'overdue' ? '已逾期的收文' : activeFilter === 'dueSoon' ? '近2日到期的收文' : '需要回复的收文'}
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

  const outgoingContent = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="待回复" value={outgoingStats.total} prefix={<SendOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="已逾期" value={outgoingStats.overdue} prefix={<ExclamationCircleOutlined />} valueStyle={{ color: outgoingStats.overdue > 0 ? '#ff4d4f' : '#52c41a' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="近2日到期" value={outgoingStats.dueSoon} prefix={<AlertOutlined />} valueStyle={{ color: outgoingStats.dueSoon > 0 ? '#faad14' : '#52c41a' }} />
          </Card>
        </Col>
      </Row>
      <Card size="small" title="需要关注的发文">
        <Table rowKey="id" columns={outgoingColumns} dataSource={needReplyOutgoing} size="small" scroll={{ x: 800, y: 'calc(100vh - 380px)' }}
          pagination={{ pageSize: outgoingPageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条`, onChange: (_, size) => setOutgoingPageSize(size) }}
          onRow={(record) => ({ style: { ...getRowStyle(record), transition: 'background 0.3s' } })}
        />
      </Card>
    </div>
  );

  const meetingContent = (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small" style={{ cursor: 'pointer', border: meetingFilter === 'all' ? '2px solid #1677ff' : undefined }} onClick={() => setMeetingFilter('all')}>
            <Statistic title="未过期会议" value={meetingStats.total} prefix={<CalendarOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ cursor: 'pointer', border: meetingFilter === 'today' ? '2px solid #faad14' : undefined }} onClick={() => setMeetingFilter('today')}>
            <Statistic title="今日会议" value={meetingStats.today} prefix={<ClockCircleOutlined />} valueStyle={{ color: meetingStats.today > 0 ? '#faad14' : '#52c41a' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ cursor: 'pointer', border: meetingFilter === 'week' ? '2px solid #1677ff' : undefined }} onClick={() => setMeetingFilter('week')}>
            <Statistic title="近7日会议" value={meetingStats.week} prefix={<AlertOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
      </Row>
      <Card
        size="small"
        title={meetingFilter === 'today' ? '今日会议' : meetingFilter === 'week' ? '近7日会议（不含今天）' : '即将召开的会议'}
      >
        <Table rowKey="id" columns={meetingColumns} dataSource={filteredMeetings} size="small" scroll={{ x: 800, y: 'calc(100vh - 380px)' }}
          pagination={{ pageSize: meetingPageSize, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条`, onChange: (_, size) => setMeetingPageSize(size) }}
        />
      </Card>
    </div>
  );

  return (
    <Tabs
      defaultActiveKey="incoming"
      items={[
        { key: 'incoming', label: '收文', children: incomingContent },
        { key: 'outgoing', label: '发文', children: outgoingContent },
        { key: 'meetings', label: '会议', children: meetingContent },
      ]}
    />
  );
}
