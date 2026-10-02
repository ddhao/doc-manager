import { useEffect, useMemo, useState } from 'react';
import {
  Tabs, Table, Button, Space, Input, Select, DatePicker, Tag, Modal, Form, Popconfirm,
  message, Card, Row, Col, Statistic, Descriptions, Progress, Segmented,
  ConfigProvider,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, ImportOutlined, ExclamationCircleOutlined,
  FileAddOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  useWorkOrderStore, WorkOrder, WorkOrderFilters, DuplicatedOrder, workOrderStatusMap,
  WORK_ORDER_LEAD_DEPT, WORK_ORDER_SEND_UNIT, isUsableContactValue,
} from '@/stores/workOrderStore';
import { useUnitStore } from '@/stores/unitStore';

const statusOptions = Object.entries(workOrderStatusMap).map(([key, value]) => ({
  value: key,
  label: value.text,
}));

const detailFields: { label: string; field: keyof WorkOrder }[] = [
  { label: '工单编号', field: 'order_no' },
  { label: '受理时间', field: 'accept_time' },
  { label: '处理期限', field: 'deadline' },
  { label: '市民称呼', field: 'citizen_name' },
  { label: '联系电话', field: 'contact_phone' },
  { label: '来电电话', field: 'caller_phone' },
  { label: '诉求标题', field: 'title' },
  { label: '涉事主体', field: 'subject' },
  { label: '事发地点', field: 'location' },
  { label: '诉求来源', field: 'source' },
  { label: '紧急程度', field: 'urgency' },
  { label: '工单类型', field: 'order_type' },
  { label: '受理部门', field: 'accept_dept' },
  { label: '事项分类', field: 'category' },
  { label: '业务点选', field: 'business_point' },
  { label: '表单内容', field: 'form_content' },
  { label: '市民诉求', field: 'appeal' },
];

export default function WorkOrderPage() {
  const {
    orders, statsRows, loading, loadOrders, loadStats, addOrder, updateOrder,
    updateOrderStatus, removeOrder, parseImportFiles, insertOrders,
    linkedOrderIds, loadLinkedOrderIds, createLinkedIncoming,
  } = useWorkOrderStore();
  const { departments, loadDepartments } = useUnitStore();

  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  /** 统计范围默认取本年（1 月 1 日 ~ 12 月 31 日） */
  const [statsRange, setStatsRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('year'),
    dayjs().endOf('year'),
  ]);
  /** 统计范围按哪个日期字段过滤 */
  const [statsDateField, setStatsDateField] = useState<'created_at' | 'deadline'>('created_at');
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterDuplicate, setFilterDuplicate] = useState<'all' | 'only' | 'none'>('all');
  const [keyword, setKeyword] = useState('');

  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<WorkOrder | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [form] = Form.useForm();

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<DuplicatedOrder[]>([]);
  const [importKeys, setImportKeys] = useState<React.Key[]>([]);
  const [importSummary, setImportSummary] = useState({ added: 0, skipped: 0 });

  /** 待生成收文的工单队列（导入/新增后逐条确认协办股室） */
  const [assistQueue, setAssistQueue] = useState<WorkOrder[]>([]);
  const [assistDeptIds, setAssistDeptIds] = useState<number[]>([]);
  const [pendingAssist, setPendingAssist] = useState<WorkOrder[]>([]);
  const assistOrder = assistQueue[0] ?? null;

  useEffect(() => {
    const filters: WorkOrderFilters = {
      dateRange: dateRange ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')] : undefined,
      status: filterStatus,
      duplicate: filterDuplicate,
      keyword: keyword || undefined,
    };
    loadOrders(filters);
  }, [dateRange, filterStatus, filterDuplicate, keyword]);

  useEffect(() => {
    loadDepartments();
    loadLinkedOrderIds();
  }, []);

  /** 统计 Tab 的日期区间（按新增日期） */
  const statsDateRange: [string, string] | undefined = statsRange
    ? [statsRange[0].format('YYYY-MM-DD'), statsRange[1].format('YYYY-MM-DD')]
    : undefined;

  useEffect(() => {
    loadStats({ dateRange: statsDateRange, dateField: statsDateField });
  }, [statsRange, statsDateField]);

  const today = dayjs().startOf('day');
  const isOverdue = (record: WorkOrder) =>
    !!record.deadline &&
    record.status === 'processing' &&
    dayjs(record.deadline).isBefore(today, 'day');

  const columns: ColumnsType<WorkOrder> = [
    { title: '工单编号', dataIndex: 'order_no', width: 190, render: (v) => v || '-' },
    {
      title: '诉求标题',
      dataIndex: 'title',
      width: 260,
      render: (v: string) => (
        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {v || '-'}
        </div>
      ),
    },
    { title: '市民称呼', dataIndex: 'citizen_name', width: 110, render: (v) => v || '-' },
    { title: '联系电话', dataIndex: 'contact_phone', width: 130, render: (v) => v || '-' },
    {
      title: '处理期限',
      dataIndex: 'deadline',
      width: 120,
      sorter: (a, b) => (a.deadline || '').localeCompare(b.deadline || ''),
      render: (v, record) => (
        <span style={{ color: isOverdue(record) ? '#ff4d4f' : undefined, fontWeight: isOverdue(record) ? 600 : 400 }}>
          {v || '-'}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (v, record) => (
        <Select
          size="small"
          value={v}
          style={{ width: 100 }}
          onChange={(val) => updateOrderStatus(record.id, val)}
          options={statusOptions}
        />
      ),
    },
    {
      title: '重复',
      dataIndex: 'is_duplicate',
      width: 110,
      render: (v: number, record) =>
        v === 1 ? <Tag color="orange">重复投诉</Tag> : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '收文',
      width: 110,
      render: (_, record) =>
        linkedOrderIds.includes(record.id) ? (
          <Tag color="green">已生成</Tag>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<FileAddOutlined />}
            onClick={() => {
              setAssistDeptIds([]);
              setAssistQueue([record]);
            }}
          >
            生成收文
          </Button>
        ),
    },
    {
      title: '操作',
      width: 210,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setViewing(record); setViewOpen(true); }}>
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              form.setFieldsValue(record);
              setFormOpen(true);
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确定删除该工单？" onConfirm={() => { removeOrder(record.id); message.success('已删除'); }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleSubmit = async () => {
    const values = await form.validateFields();
    let newId: number | null = null;
    if (editing) {
      await updateOrder(editing.id, values);
      message.success('更新成功');
    } else {
      newId = await addOrder(values);
      message.success('新增成功');
    }
    setFormOpen(false);
    setEditing(null);
    form.resetFields();
    loadStats({ dateRange: statsDateRange, dateField: statsDateField });

    // 新增工单后，同步生成一条收文记录（协办股室由弹窗确认）
    if (newId !== null) {
      setAssistDeptIds([]);
      setAssistQueue([
        {
          id: newId,
          order_no: values.order_no ?? null,
          title: values.title ?? null,
          deadline: values.deadline ?? null,
        } as WorkOrder,
      ]);
    }
  };

  /** 处理队列中的下一条 */
  const advanceAssistQueue = () => {
    setAssistDeptIds([]);
    setAssistQueue((queue) => queue.slice(1));
  };

  /** 只有本次导入恰好 1 条工单时才自动生成收文，多条留给列表逐条生成 */
  const queueAssistForImported = (imported: WorkOrder[]) => {
    if (imported.length === 1) {
      setAssistDeptIds([]);
      setAssistQueue(imported);
    } else if (imported.length > 1) {
      message.info(`本次导入 ${imported.length} 条工单，收文未自动生成，可在列表「收文」列逐条点「生成收文」`);
    }
  };

  const handleAssistConfirm = async () => {
    if (!assistOrder) return;
    const result = await createLinkedIncoming(assistOrder, assistDeptIds);
    if (result.ok) {
      message.success('已同步生成收文记录');
    } else {
      message.error(result.message || '生成收文失败');
    }
    advanceAssistQueue();
  };

  const handleImport = async () => {
    const files = await window.electronAPI.file.openFiles({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
    });
    if (!files || files.length === 0) return;
    try {
      const { fresh, duplicated, skipped } = await parseImportFiles(files);
      const created = fresh.length > 0 ? await insertOrders(fresh) : [];
      setImportSummary({ added: created.length, skipped });
      if (duplicated.length > 0) {
        // 重复编号先确认，确认后再一并生成收文
        setPendingAssist(created);
        setImportRows(duplicated);
        setImportKeys([]);
        setImportOpen(true);
      } else {
        message.success(`导入完成：新增 ${created.length} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`);
        queueAssistForImported(created);
      }
      loadStats({ dateRange: statsDateRange, dateField: statsDateField });
    } catch (e: any) {
      message.error(`导入失败：${e.message || '请检查文件格式'}`);
    }
  };

  const confirmDuplicateImport = async () => {
    const chosen = importRows.filter((row) => importKeys.includes(row.filePath));
    const created = chosen.length > 0 ? await insertOrders(chosen) : [];
    const skippedTotal = importSummary.skipped + (importRows.length - chosen.length);
    setImportOpen(false);
    message.success(`导入完成：新增 ${importSummary.added + created.length} 条${skippedTotal > 0 ? `，跳过 ${skippedTotal} 条` : ''}`);
    loadStats({ dateRange: statsDateRange, dateField: statsDateField });
    const queue = [...pendingAssist, ...created];
    setPendingAssist([]);
    queueAssistForImported(queue);
  };

  const stats = useMemo(() => {
    const total = statsRows.length;
    const byStatus = { processing: 0, closed: 0, returned: 0, suspended: 0 } as Record<string, number>;
    let duplicateCount = 0;
    let overdueOpen = 0;

    for (const row of statsRows) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      if (row.is_duplicate === 1) duplicateCount++;
      if (row.status === 'processing' && row.deadline) {
        const diff = dayjs(row.deadline).diff(today, 'day');
        if (diff < 0) overdueOpen++;
      }
    }

    const groupTop = (field: keyof WorkOrder, limit = 10, skipMasked = false) => {
      const map = new Map<string, number>();
      for (const row of statsRows) {
        const key = String(row[field] || '').trim();
        if (!key) continue;
        // 称呼/电话统计时跳过 *** 这类掩码值
        if (skipMasked && !isUsableContactValue(key)) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
      return [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    };

    const monthMap = new Map<string, number>();
    for (const row of statsRows) {
      const source = statsDateField === 'deadline' ? row.deadline : row.created_at;
      const month = (source || '').slice(0, 7);
      if (!month) continue;
      monthMap.set(month, (monthMap.get(month) || 0) + 1);
    }
    const monthly = [...monthMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-12);

    return {
      total,
      byStatus,
      duplicateCount,
      overdueOpen,
      monthly,
      categories: groupTop('category'),
      citizens: groupTop('citizen_name', 10, true),
      phones: groupTop('contact_phone', 10, true),
    };
  }, [statsRows, statsDateField]);

  const renderDistribution = (
    title: string,
    rows: { name: string; count: number }[],
    total = stats.total,
  ) => (
    <Card size="small" title={title}>
      <Table
        rowKey="name"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: '暂无数据' }}
        columns={[
          { title: '名称', dataIndex: 'name', ellipsis: true },
          { title: '数量', dataIndex: 'count', width: 70 },
          {
            title: '占比',
            width: 160,
            render: (_, record: { count: number }) => (
              <Progress
                size="small"
                percent={total > 0 ? Math.round((record.count / total) * 100) : 0}
              />
            ),
          },
        ]}
      />
    </Card>
  );

  const listContent = (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            form.setFieldsValue({ status: 'processing' });
            setFormOpen(true);
          }}
        >
          新增工单
        </Button>
        <Button icon={<ImportOutlined />} onClick={handleImport}>导入工单</Button>
        <DatePicker.RangePicker
          value={dateRange}
          onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          placeholder={['登记开始', '登记结束']}
        />
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 130 }}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
          options={statusOptions}
        />
        <Select
          style={{ width: 150 }}
          value={filterDuplicate}
          onChange={(v) => setFilterDuplicate(v)}
          options={[
            { value: 'all', label: '全部工单' },
            { value: 'only', label: '仅重复投诉' },
            { value: 'none', label: '非重复投诉' },
          ]}
        />
        <Input.Search
          placeholder="搜索编号/标题/称呼/电话"
          allowClear
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(v) => setKeyword(v)}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={orders}
        loading={loading}
        size="small"
        scroll={{ x: 1300, y: 'calc(100vh - 320px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
        onRow={(record) => ({
          style: isOverdue(record)
            ? { background: '#fff1f0', borderLeft: '3px solid #ff4d4f' }
            : undefined,
        })}
      />
    </div>
  );

  const statsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space wrap>
        <span style={{ color: '#666' }}>统计范围：</span>
        <ConfigProvider
          theme={{
            components: {
              Segmented: {
                itemSelectedBg: '#1677ff',
                itemSelectedColor: '#fff',
                trackBg: '#f0f2f5',
              },
            },
          }}
        >
          <Segmented
            value={statsDateField}
            onChange={(value) => setStatsDateField(value as 'created_at' | 'deadline')}
            options={[
              { label: '按新增日期', value: 'created_at' },
              { label: '按处理期限', value: 'deadline' },
            ]}
          />
        </ConfigProvider>
        <DatePicker.RangePicker
          value={statsRange}
          onChange={(v) => setStatsRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
          placeholder={['开始日期', '结束日期']}
          allowClear
        />
        <Button size="small" disabled={!statsRange} onClick={() => setStatsRange(null)}>
          全部时间
        </Button>
        <span style={{ color: '#999' }}>范围内共 {stats.total} 条</span>
      </Space>
      <Row gutter={[16, 16]}>
        <Col span={4}><Card size="small"><Statistic title="总工单" value={stats.total} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="处理中" value={stats.byStatus.processing || 0} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="已办结" value={stats.byStatus.closed || 0} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="已退单" value={stats.byStatus.returned || 0} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={4}><Card size="small"><Statistic title="已挂起" value={stats.byStatus.suspended || 0} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={4}>
          <Card size="small">
            <Statistic
              title="超期未办结"
              value={stats.overdueOpen}
              valueStyle={{ color: stats.overdueOpen > 0 ? '#ff4d4f' : '#52c41a' }}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card size="small">
            <Statistic title="重复投诉工单" value={stats.duplicateCount} valueStyle={{ color: stats.duplicateCount > 0 ? '#fa8c16' : undefined }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={12}>
          {renderDistribution(
            statsDateField === 'deadline' ? '按处理期限月份（近 12 个月）' : '按登记月份（近 12 个月）',
            stats.monthly
          )}
        </Col>
        <Col span={12}>{renderDistribution('按事项分类 Top10', stats.categories)}</Col>
        <Col span={12}>{renderDistribution('按市民称呼 Top10', stats.citizens)}</Col>
        <Col span={12}>{renderDistribution('按联系电话 Top10', stats.phones)}</Col>
      </Row>

    </div>
  );

  return (
    <div>
      <Tabs
        defaultActiveKey="list"
        onChange={(key) => { if (key === 'stats') loadStats({ dateRange: statsDateRange, dateField: statsDateField }); }}
        items={[
          { key: 'list', label: '工单列表', children: listContent },
          { key: 'stats', label: '工单统计', children: statsContent },
        ]}
      />

      <Modal
        title="工单详情"
        open={viewOpen}
        onCancel={() => setViewOpen(false)}
        footer={<Button onClick={() => setViewOpen(false)}>关闭</Button>}
        width={760}
      >
        {viewing && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="状态">
              <Tag color={workOrderStatusMap[viewing.status]?.color}>{workOrderStatusMap[viewing.status]?.text || viewing.status}</Tag>
              {viewing.is_duplicate === 1 && <Tag color="orange" style={{ marginLeft: 8 }}>重复投诉</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="登记时间">{viewing.created_at}</Descriptions.Item>
            {detailFields.map(({ label, field }) => (
              <Descriptions.Item key={field} label={label}>
                <div style={{ whiteSpace: 'pre-wrap' }}>{String(viewing[field] ?? '') || '-'}</div>
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={editing ? '编辑工单' : '新增工单'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setEditing(null); form.resetFields(); }}
        width={760}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="order_no" label="工单编号"><Input /></Form.Item></Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" initialValue="processing">
                <Select options={statusOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="accept_time" label="受理时间"><Input placeholder="2026-09-08 09:51:09" /></Form.Item></Col>
            <Col span={12}><Form.Item name="deadline" label="处理期限"><Input placeholder="2026-09-15" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="citizen_name" label="市民称呼"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="contact_phone" label="联系电话"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="caller_phone" label="来电电话"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="title" label="诉求标题"><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="subject" label="涉事主体"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="location" label="事发地点"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="source" label="诉求来源"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="urgency" label="紧急程度"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="order_type" label="工单类型"><Input /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="accept_dept" label="受理部门"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="category" label="事项分类"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="business_point" label="业务点选"><Input /></Form.Item>
          <Form.Item name="form_content" label="表单内容"><Input.TextArea rows={5} /></Form.Item>
          <Form.Item name="appeal" label="市民诉求"><Input.TextArea rows={4} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title="生成关联收文"
        open={assistQueue.length > 0}
        onOk={handleAssistConfirm}
        okText={assistQueue.length > 1 ? '生成收文（下一条）' : '生成收文'}
        cancelButtonProps={{ style: { display: 'none' } }}
        onCancel={advanceAssistQueue}
        width={520}
      >
        <div style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
          将按工单信息生成一条收文记录：主办股室固定为「{WORK_ORDER_LEAD_DEPT}」，来文单位为「{WORK_ORDER_SEND_UNIT}」，
          回复日期取工单的处理期限，摘要按转发文本格式生成。协办股室可多选。
          {assistQueue.length > 1 && (
            <div style={{ marginTop: 6, color: '#1677ff' }}>
              还有 {assistQueue.length} 条待处理，本条为第 1 条。
            </div>
          )}
        </div>
        <Form layout="vertical">
          <Form.Item label="工单编号">
            <Input value={assistOrder?.order_no || ''} disabled />
          </Form.Item>
          <Form.Item label="协办股室（可多选）">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择协办股室"
              value={assistDeptIds}
              onChange={(v) => setAssistDeptIds(v)}
              options={departments
                .filter((d) => d.name !== WORK_ORDER_LEAD_DEPT)
                .map((d) => ({ value: d.id, label: d.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="工单编号重复"
        open={importOpen}
        onCancel={() => {
          setImportOpen(false);
          message.info(`已跳过 ${importRows.length} 条重复编号工单`);
          const queue = pendingAssist;
          setPendingAssist([]);
          queueAssistForImported(queue);
        }}
        onOk={confirmDuplicateImport}
        okText="导入勾选项"
        cancelText="全部跳过"
        width={860}
      >
        <div style={{ marginBottom: 12, color: '#fa8c16' }}>
          以下 {importRows.length} 条工单的编号在系统中已存在，请确认是否仍要新增（默认不勾选＝跳过）：
        </div>
        <Table
          rowKey="filePath"
          size="small"
          dataSource={importRows}
          pagination={false}
          scroll={{ y: 320 }}
          rowSelection={{ selectedRowKeys: importKeys, onChange: setImportKeys }}
          columns={[
            { title: '工单编号', width: 180, render: (_, record) => record.data.order_no || '-' },
            { title: '诉求标题', ellipsis: true, render: (_, record) => record.data.title || '-' },
            { title: '市民称呼', width: 100, render: (_, record) => record.data.citizen_name || '-' },
            { title: '联系电话', width: 120, render: (_, record) => record.data.contact_phone || '-' },
            { title: '受理时间', width: 150, render: (_, record) => record.data.accept_time || '-' },
            { title: '库中已有登记时间', width: 160, render: (_, record) => record.existing.created_at },
          ]}
        />
      </Modal>
    </div>
  );
}
