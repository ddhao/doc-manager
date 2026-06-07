import { useEffect, useState } from 'react';
import {
  Button, Space, Modal, Form, Input, Tag, message, Popconfirm, Empty, Checkbox,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, UserAddOutlined,
} from '@ant-design/icons';
import { useWorkflowStore, WorkflowTemplate, WorkflowStage } from '@/stores/workflowStore';

const stageColorPalette = ['#1677ff', '#fa8c16', '#faad14', '#722ed1', '#52c41a', '#eb2f96', '#13c2c2', '#f5222d'];

function stageColor(idx: number) {
  return stageColorPalette[idx % stageColorPalette.length];
}

export default function WorkflowPage() {
  const {
    templates, selectedId, loadTemplates, selectTemplate,
    addTemplate, updateTemplate, replaceStages, removeTemplate,
    addApprover, removeApprover,
  } = useWorkflowStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowTemplate | null>(null);
  const [form] = Form.useForm();
  const [editStages, setEditStages] = useState<{ key: string; name: string; hasApprovers: boolean }[]>([]);
  const [approverInputs, setApproverInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    loadTemplates();
  }, []);

  const selected = templates.find((t) => t.id === selectedId) || null;

  const openCreate = () => {
    setEditing(null);
    setEditStages([]);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (tpl: WorkflowTemplate) => {
    setEditing(tpl);
    setEditStages(
      tpl.stages.map((s) => ({
        key: String(s.id),
        name: s.name,
        hasApprovers: s.has_approvers === 1,
      })),
    );
    form.setFieldsValue({ name: tpl.name, description: tpl.description });
    setFormOpen(true);
  };

  const addStageRow = () => {
    setEditStages((prev) => [
      ...prev,
      { key: Date.now().toString(), name: '', hasApprovers: false },
    ]);
  };

  const removeStageRow = (key: string) => {
    setEditStages((prev) => prev.filter((s) => s.key !== key));
  };

  const updateStageRow = (key: string, field: 'name' | 'hasApprovers', value: string | boolean) => {
    setEditStages((prev) =>
      prev.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
    );
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (!editing) {
      const validStages = editStages.filter((s) => s.name.trim());
      if (validStages.length === 0) {
        message.warning('请至少添加一个阶段');
        return;
      }
      await addTemplate({
        name: values.name,
        description: values.description,
        stages: validStages.map((s) => ({ name: s.name.trim(), hasApprovers: s.hasApprovers })),
      });
      message.success('流程创建成功');
    } else {
      await updateTemplate(editing.id, values);
      const validStages = editStages.filter((s) => s.name.trim());
      if (validStages.length > 0) {
        await replaceStages(editing.id, validStages.map((s) => ({ name: s.name.trim(), hasApprovers: s.hasApprovers })));
      }
      message.success('已更新');
    }

    setFormOpen(false);
    setEditing(null);
    setEditStages([]);
    form.resetFields();
  };

  const handleAddApprover = async (stageId: number) => {
    const name = approverInputs[stageId]?.trim();
    if (!name) return;
    await addApprover(stageId, name);
    setApproverInputs((prev) => ({ ...prev, [stageId]: '' }));
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      {/* Left: template list */}
      <div style={{
        width: 240, flexShrink: 0, background: '#fafafa', borderRadius: 8, padding: 12,
        display: 'flex', flexDirection: 'column',
      }}>
        <Button
          type="primary"
          block
          icon={<PlusOutlined />}
          onClick={openCreate}
          style={{ marginBottom: 12 }}
        >
          新建流程
        </Button>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {templates.map((t) => (
            <div
              key={t.id}
              onClick={() => selectTemplate(t.id)}
              style={{
                padding: '8px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selectedId === t.id ? '#e6f4ff' : 'transparent',
                border: selectedId === t.id ? '1px solid #1677ff' : '1px solid transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {t.stages.map((s) => s.name).join(' → ')}
                </div>
              </div>
              <Space size={2}>
                <Button type="text" size="small" icon={<EditOutlined />}
                  onClick={(e) => { e.stopPropagation(); openEdit(t); }} />
                <Popconfirm
                  title="确定删除此流程？"
                  onConfirm={() => { removeTemplate(t.id); message.success('已删除'); }}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()} />
                </Popconfirm>
              </Space>
            </div>
          ))}
          {templates.length === 0 && (
            <div style={{ textAlign: 'center', color: '#ccc', marginTop: 40 }}>暂无流程</div>
          )}
        </div>
      </div>

      {/* Right: workflow detail */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 8px' }}>
        {!selected ? (
          <Empty description="选择或新建一个流程" style={{ marginTop: 120 }} />
        ) : (
          <div>
            <h3 style={{ marginBottom: 4 }}>{selected.name}</h3>
            {selected.description && (
              <p style={{ color: '#666', marginBottom: 20 }}>{selected.description}</p>
            )}

            <div style={{ maxWidth: 560 }}>
              {selected.stages.map((stage, idx) => (
                <div key={stage.id} style={{ display: 'flex', marginBottom: idx < selected.stages.length - 1 ? 0 : 16 }}>
                  {/* Node circle + connector */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48, flexShrink: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: stageColor(idx),
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {idx + 1}
                    </div>
                    {idx < selected.stages.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 32, background: '#d9d9d9', margin: '4px 0' }} />
                    )}
                  </div>

                  {/* Stage card */}
                  <div style={{
                    flex: 1, marginLeft: 12, marginBottom: 12,
                    padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Tag color={stageColor(idx)} style={{ fontSize: 13, padding: '2px 10px' }}>
                        {stage.name}
                      </Tag>
                    </div>

                    {stage.has_approvers === 1 ? (
                      <div>
                        <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>审批人：</div>
                        {stage.approvers.length === 0 && (
                          <span style={{ color: '#ccc', fontSize: 12 }}>暂未添加审批人</span>
                        )}
                        {stage.approvers.map((a) => (
                          <Tag
                            key={a.id}
                            closable
                            onClose={() => removeApprover(a.id)}
                            style={{ marginBottom: 4 }}
                          >
                            {a.approver_name}
                          </Tag>
                        ))}
                        <div style={{ display: 'flex', marginTop: 6 }}>
                          <Input
                            size="small"
                            placeholder="输入审批人姓名回车添加"
                            value={approverInputs[stage.id] || ''}
                            onChange={(e) => setApproverInputs((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                            onPressEnter={() => handleAddApprover(stage.id)}
                            style={{ width: 180 }}
                          />
                          <Button
                            size="small"
                            type="primary"
                            icon={<UserAddOutlined />}
                            onClick={() => handleAddApprover(stage.id)}
                            style={{ marginLeft: 8 }}
                          >
                            添加
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: 13, color: '#999' }}>无需审批</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        title={editing ? '编辑流程' : '新建流程'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setEditing(null); setEditStages([]); form.resetFields(); }}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="流程名称" rules={[{ required: true, message: '请输入流程名称' }]}>
            <Input placeholder="例如：标准审批流程" />
          </Form.Item>
          <Form.Item name="description" label="流程描述">
            <Input.TextArea rows={2} placeholder="流程用途说明（选填）" />
          </Form.Item>

          <Form.Item label="流程阶段" required>
            <div style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
              {editStages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#bbb', padding: '16px 0', fontSize: 13 }}>
                  点击下方按钮添加流程阶段
                </div>
              )}
              {editStages.map((stage, idx) => (
                <div
                  key={stage.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                    padding: '8px 12px', background: '#fff', borderRadius: 6, border: '1px solid #f0f0f0',
                  }}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: stageColor(idx), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>
                    {idx + 1}
                  </span>
                  <Input
                    placeholder="阶段名称"
                    value={stage.name}
                    onChange={(e) => updateStageRow(stage.key, 'name', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Checkbox
                    checked={stage.hasApprovers}
                    onChange={(e) => updateStageRow(stage.key, 'hasApprovers', e.target.checked)}
                  >
                    需审批
                  </Checkbox>
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeStageRow(stage.key)}
                  />
                </div>
              ))}
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={addStageRow}
                style={{ marginTop: editStages.length > 0 ? 4 : 0 }}
              >
                添加阶段
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
