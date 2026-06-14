import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, Tag, message, Popconfirm, Steps,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckOutlined, CloseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useApplicationStore, Application, statusMap } from '@/stores/applicationStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useConfigStore } from '@/stores/configStore';
import { useUnitStore } from '@/stores/unitStore';

const approvalStatusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '待审批' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
};

export default function ApplicationPage() {
  const { apps, loadApps, addApp, approveStage, removeApp } = useApplicationStore();
  const { templates, loadTemplates } = useWorkflowStore();
  const { appTypes, loadAppTypes } = useConfigStore();
  const { contacts, loadContacts } = useUnitStore();
  const [formOpen, setFormOpen] = useState(false);
  const [form] = Form.useForm();
  const [selectedTplId, setSelectedTplId] = useState<number | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [searchTitle, setSearchTitle] = useState('');
  const [filterTypeId, setFilterTypeId] = useState<number | null>(null);
  const [searchApplicant, setSearchApplicant] = useState('');

  useEffect(() => {
    loadApps();
    loadTemplates();
    loadAppTypes();
    loadContacts();
  }, []);

  const selectedTpl = templates.find((t) => t.id === selectedTplId) || null;
  const selectedType = appTypes.find((t) => t.id === selectedTypeId) || null;

  const filteredApps = apps.filter((a) => {
    if (searchTitle && !a.title.toLowerCase().includes(searchTitle.toLowerCase())) return false;
    if (filterTypeId != null && a.type_id !== filterTypeId) return false;
    if (searchApplicant && !(a.applicant || '').toLowerCase().includes(searchApplicant.toLowerCase())) return false;
    return true;
  });

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!selectedTpl) {
      message.warning('请选择审批流程');
      return;
    }
    if (!selectedTypeId) {
      message.warning('请选择申请类型');
      return;
    }

    const approvals: { stageOrder: number; stageName: string; approverName: string }[] = [];
    selectedTpl.stages.forEach((stage, idx) => {
      if (stage.has_approvers && stage.approvers.length > 0) {
        stage.approvers.forEach((a) => {
          approvals.push({ stageOrder: idx, stageName: stage.name, approverName: a.approver_name });
        });
      }
    });

    if (approvals.length === 0) {
      message.warning('所选流程没有可审批的阶段');
      return;
    }

    await addApp({
      typeId: selectedTypeId,
      title: values.title,
      description: values.description,
      applicant: values.applicant,
      workflowTemplateId: selectedTpl.id,
      approvals,
    });
    message.success(selectedType?.name + '已提交');
    setFormOpen(false);
    setSelectedTplId(null);
    setSelectedTypeId(null);
    form.resetFields();
  };

  const columns: ColumnsType<Application> = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    {
      title: '类型',
      dataIndex: 'type_name',
      width: 100,
      render: (v: string | null) => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    { title: '标题', dataIndex: 'title', ellipsis: true, width: 200 },
    { title: '申请人', dataIndex: 'applicant', width: 100, render: (v: string | null) => v || '-' },
    {
      title: '关联流程',
      dataIndex: 'workflow_name',
      width: 140,
      render: (v: string | null) => v || '-',
    },
    {
      title: '当前阶段',
      width: 160,
      render: (_: unknown, record: Application) => {
        const stages = record.approvals || [];
        const stageNames = [...new Set(stages.map((a) => a.stage_name))];
        const idx = record.current_stage_order;
        return (
          <Space size={2} wrap>
            {stageNames.map((name, i) => (
              <Tag key={name} color={i < idx ? 'green' : i === idx ? 'orange' : 'default'}>
                {name}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: '操作',
      width: 80,
      render: (_: unknown, record: Application) => (
        <Popconfirm
          title="确定删除此申请？"
          onConfirm={() => { removeApp(record.id); message.success('已删除'); }}
        >
          <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="搜索标题"
          value={searchTitle}
          onChange={(e) => setSearchTitle(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
        <Select
          placeholder="筛选类型"
          value={filterTypeId}
          onChange={setFilterTypeId}
          allowClear
          style={{ width: 140 }}
          options={appTypes.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Input
          placeholder="搜索申请人"
          value={searchApplicant}
          onChange={(e) => setSearchApplicant(e.target.value)}
          allowClear
          style={{ width: 160 }}
        />
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => { form.resetFields(); setSelectedTplId(null); setSelectedTypeId(null); setFormOpen(true); }}
        >
          申请登记
        </Button>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredApps}
        size="small"
        scroll={{ y: 'calc(100vh - 270px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50], showTotal: (t) => `共 ${t} 条` }}
        expandable={{
          expandedRowRender: (record: Application) => {
            const approvals = record.approvals || [];
            const currentStage = record.current_stage_order;
            const stageOrders = [...new Set(approvals.map((a) => a.stage_order))].sort((a, b) => a - b);
            const currentStageIdx = stageOrders.indexOf(currentStage);

            return (
              <div style={{ padding: 0 }}>
                <Steps
                  size="small"
                  current={record.status === 'approved' ? stageOrders.length : record.status === 'rejected' ? -1 : currentStageIdx}
                  status={record.status === 'rejected' ? 'error' : record.status === 'approved' ? 'finish' : 'process'}
                  items={stageOrders.map((order) => {
                    const name = approvals.find((a) => a.stage_order === order)?.stage_name || '';
                    return { title: name };
                  })}
                  style={{ marginBottom: 16 }}
                />

                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>审批详情：</div>
                {approvals.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '4px 0', borderBottom: '1px solid #f0f0f0',
                    }}
                  >
                    <Space>
                      <Tag color={a.stage_order === currentStage ? 'orange' : a.stage_order < currentStage ? 'green' : 'default'}>
                        {a.stage_name}
                      </Tag>
                      <span>{a.approver_name}</span>
                      <Tag color={approvalStatusMap[a.status]?.color}>
                        {approvalStatusMap[a.status]?.text}
                      </Tag>
                    </Space>
                    {a.stage_order === currentStage && a.status === 'pending' && record.status === 'processing' && (
                      <Space size={4}>
                        <Button
                          size="small"
                          type="primary"
                          icon={<CheckOutlined />}
                          onClick={() => { approveStage(record.id, a.id, 'approved'); message.success('已通过'); }}
                        >
                          通过
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<CloseOutlined />}
                          onClick={() => { approveStage(record.id, a.id, 'rejected'); message.success('已驳回'); }}
                        >
                          驳回
                        </Button>
                      </Space>
                    )}
                  </div>
                ))}
              </div>
            );
          },
        }}
      />

      <Modal
        title={selectedType ? `${selectedType.name}登记` : '申请登记'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setSelectedTplId(null); setSelectedTypeId(null); form.resetFields(); }}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type_id" label="申请类型" required rules={[{ required: true, message: '请选择申请类型' }]}>
            <Select
              placeholder="选择申请类型"
              value={selectedTypeId}
              onChange={setSelectedTypeId}
              allowClear
              options={appTypes.map((t) => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入标题" />
          </Form.Item>
          <Form.Item name="applicant" label="申请人">
            <Select
              showSearch
              allowClear
              placeholder="选择申请人"
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={contacts.map((c) => ({
                value: c.name,
                label: `${c.name}${c.department_name ? ` (${c.department_name})` : ''}${c.phone ? ` ${c.phone}` : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
          <Form.Item label="选择审批流程" required>
            <Select
              placeholder="选择审批流程"
              value={selectedTplId}
              onChange={setSelectedTplId}
              allowClear
              style={{ width: '100%' }}
              options={templates.map((t) => ({
                value: t.id,
                label: t.name,
              }))}
            />
            {selectedTpl && (
              <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                <div style={{ fontSize: 13, marginBottom: 8, color: '#666' }}>
                  流程预览：{selectedTpl.stages.map((s) => s.name).join(' → ')}
                </div>
                {selectedTpl.stages.map((stage) => (
                  stage.has_approvers === 1 && stage.approvers.length > 0 ? (
                    <div key={stage.id} style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                      {stage.name}：审批人 {stage.approvers.map((a) => a.approver_name).join('、')}
                    </div>
                  ) : null
                ))}
              </div>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
