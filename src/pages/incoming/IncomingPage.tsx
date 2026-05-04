import { useEffect, useState, useRef } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, DatePicker, Tag, Popconfirm,
  Upload, message, Dropdown, Row, Col, Typography,
} from 'antd';
import {
  PlusOutlined, PrinterOutlined, CopyOutlined, EditOutlined,
  DeleteOutlined, FileTextOutlined, MoreOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useIncomingStore, IncomingDoc, IncomingFile, DocDepartment, roleLabels } from '@/stores/incomingStore';
import { useUnitStore } from '@/stores/unitStore';
import { useConfigStore } from '@/stores/configStore';
import { useArchiveStore } from '@/stores/archiveStore';
import { copyToClipboard, db } from '@/db';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.pdfMake ? (pdfFonts.pdfMake as any).vfs : pdfFonts.vfs;

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'blue', text: '待处理' },
  processing: { color: 'orange', text: '处理中' },
  replied: { color: 'green', text: '已回文' },
  done: { color: 'cyan', text: '已办结' },
};

const defaultForwardTemplate = `【{{来文单位}}】{{标题}}

转发：{{转发股室}}
{{收文员}}请阅处。`;

function fillTemplate(tmpl: string, data: Record<string, string>): string {
  return tmpl.replace(/\{\{(.+?)\}\}/g, (_, key) => data[key.trim()] || '');
}

const roleColorMap: Record<string, string> = {
  lead: 'red',
  assist: 'blue',
  summary: 'purple',
  read_handle: 'green',
  read_notify: 'cyan',
};

type DeptAssignment = { department_id: number; role: string };

export default function IncomingPage() {
  const { docs, files, loadDocs, addDoc, updateDoc, removeDoc, updateDocStatus, loadFiles, addFile, removeFile } =
    useIncomingStore();
  const { units, loadUnits } = useUnitStore();
  const { departments, loadDepartments } = useUnitStore();
  const { docTypes, tags, levels, loadDocTypes, loadTags, loadLevels } = useConfigStore();
  const { loading } = useIncomingStore();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncomingDoc | null>(null);
  const [filterDept, setFilterDept] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [fileVisible, setFileVisible] = useState(false);
  const [currentDocId, setCurrentDocId] = useState<number>(0);
  const [deptAssignments, setDeptAssignments] = useState<DeptAssignment[]>([]);
  const [selectedDept, setSelectedDept] = useState<number | undefined>();
  const [selectedRole, setSelectedRole] = useState<string>('lead');
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateText, setTemplateText] = useState(defaultForwardTemplate);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivingDoc, setArchivingDoc] = useState<IncomingDoc | null>(null);
  const [archivedDocIds, setArchivedDocIds] = useState<Set<number>>(new Set());
  const [archiveForm] = Form.useForm();
  const archiveStore = useArchiveStore();
  const [form] = Form.useForm();

  const loadArchivedIds = async () => {
    const rows = await db.all<{ doc_id: number }>(
      "SELECT doc_id FROM archive_records WHERE doc_type = 'incoming'"
    );
    setArchivedDocIds(new Set(rows.map((r) => r.doc_id)));
  };

  useEffect(() => {
    loadDocs(
      filterDept,
      keyword || undefined,
      dateRange ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')] : undefined
    );
    loadUnits();
    loadDepartments();
    loadDocTypes();
    loadTags();
    loadLevels();
    loadTemplate();
    loadArchivedIds();
  }, [filterDept, keyword, dateRange]);

  const addDeptAssignment = () => {
    if (!selectedDept) return;
    if (deptAssignments.some((a) => a.department_id === selectedDept)) {
      message.warning('该股室已添加');
      return;
    }
    setDeptAssignments([...deptAssignments, { department_id: selectedDept, role: selectedRole }]);
    setSelectedDept(undefined);
    setSelectedRole('lead');
  };

  const removeDeptAssignment = (deptId: number) => {
    setDeptAssignments(deptAssignments.filter((a) => a.department_id !== deptId));
  };

  const getDeptName = (deptId: number) => departments.find((d) => d.id === deptId)?.name || '';

  const columns: ColumnsType<IncomingDoc> = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '呈批编号', dataIndex: 'approval_number', width: 120, render: (v) => v || '-' },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, record: IncomingDoc) => {
        const levelColorMap: Record<string, string> = {
          '特急': 'red', '加急': 'orange', '急': 'gold',
        };
        return (
          <Space size={4}>
            {record.level && record.level !== '平' && (
              <Tag color={levelColorMap[record.level] || 'default'} style={{ flexShrink: 0 }}>{record.level}</Tag>
            )}
            {record.document_tag && <Tag color="cyan" style={{ flexShrink: 0 }}>{record.document_tag}</Tag>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </Space>
        );
      },
    },
    { title: '来文单位', dataIndex: 'send_unit_name', width: 140, render: (v) => v || '-' },
    {
      title: '转发股室',
      dataIndex: 'departments',
      width: 200,
      render: (deps: DocDepartment[] | undefined) => {
        if (!deps || deps.length === 0) return <span style={{ color: '#ccc' }}>-</span>;
        return <span>{formatDeptText(deps)}</span>;
      },
    },
    {
      title: '回复日期',
      dataIndex: 'reply_deadline',
      width: 110,
      sorter: (a, b) => (a.reply_deadline || '').localeCompare(b.reply_deadline || ''),
      defaultSortOrder: 'ascend',
      render: (v) => v || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (v, record) => {
        const s = statusMap[v] || { color: 'default', text: v };
        return (
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
        );
      },
    },
    {
      title: '操作',
      width: 240,
      fixed: 'right' as const,
      render: (_, record) => {
        const isArchived = archivedDocIds.has(record.id);
        return (
        <Space size="small" wrap>
          <Button size="small" icon={<EditOutlined />} disabled={isArchived} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copyForwardText(record)}>
            转发
          </Button>
          <Dropdown
            menu={{
              items: [
                { key: 'print', label: '呈批表', icon: <PrinterOutlined />, onClick: () => printApproval(record) },
                ...(record.status === 'done' && !isArchived
                  ? [{ key: 'archive', label: '归档', icon: <FileTextOutlined />, onClick: () => openArchive(record) }]
                  : []),
                ...(isArchived
                  ? [{ key: 'archived', label: '已归档', icon: <FileTextOutlined />, disabled: true }]
                  : []),
                { key: 'files', label: '关联文件', icon: <FileTextOutlined />, onClick: () => openFiles(record.id) },
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
        </Space>
        );},
    },
  ];

  const openEdit = (record: IncomingDoc) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      reply_deadline: record.reply_deadline ? dayjs(record.reply_deadline) : null,
    });
    setDeptAssignments(
      (record.departments || []).map((d) => ({
        department_id: d.department_id,
        role: d.role,
      }))
    );
    setFormOpen(true);
  };

  const openFiles = (docId: number) => {
    setCurrentDocId(docId);
    loadFiles(docId);
    setFileVisible(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const data = {
      ...values,
      reply_deadline: values.reply_deadline ? values.reply_deadline.format('YYYY-MM-DD') : null,
    };
    if (editing) {
      await updateDoc(editing.id, data, deptAssignments);
      message.success('更新成功');
    } else {
      await addDoc(data, deptAssignments);
      message.success('登记成功');
    }
    setFormOpen(false);
    setEditing(null);
    setDeptAssignments([]);
    form.resetFields();
  };

  const printApproval = (record: IncomingDoc) => {
    const deptLines = (record.departments || []).map(
      (d) => `  ${d.department_name || ''}（${roleLabels[d.role]}）`
    ).join('\n');

    const docDef = {
      content: [
        { text: '呈 批 表', style: 'header', alignment: 'center', margin: [0, 0, 0, 16] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }] },
        { text: `呈批编号：${record.approval_number || ''}`, style: 'info', margin: [0, 12, 0, 4] },
        { text: `来文单位：${record.send_unit_name || ''}`, style: 'info', margin: [0, 4, 0, 4] },
        { text: `公文类型：${record.document_type || ''}`, style: 'info', margin: [0, 4, 0, 4] },
        { text: `公文标签：${record.document_tag || ''}`, style: 'info', margin: [0, 4, 0, 4] },
        { text: `公文标题：${record.title}`, style: 'info', margin: [0, 4, 0, 4] },
        { text: `转发股室：`, style: 'info', margin: [0, 8, 0, 2] },
        { text: deptLines || '  -', style: 'info', margin: [20, 0, 0, 4] },
        { text: `回复日期：${record.reply_deadline || ''}`, style: 'info', margin: [0, 8, 0, 4] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1 }], margin: [0, 12, 0, 12] },
        { text: `摘要：`, style: 'subheader' },
        { text: record.summary || '', style: 'content', margin: [12, 4, 0, 0] },
      ],
      styles: {
        header: { fontSize: 22, bold: true },
        info: { fontSize: 14, margin: [0, 4, 0, 4] },
        subheader: { fontSize: 14, bold: true, margin: [0, 8, 0, 4] },
        content: { fontSize: 14, lineHeight: 1.6 },
      },
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
    };

    const pdfDoc = pdfMake.createPdf(docDef as any);
    pdfDoc.getDataUrl((dataUrl: string) => {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<iframe src="${dataUrl}" width="100%" height="100%"></iframe>`);
        win.document.title = '呈批表预览';
      }
    });
  };

  const openArchive = async (record: IncomingDoc) => {
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
      doc_type: 'incoming',
      doc_id: archivingDoc!.id,
      reply_date: values.reply_date ? values.reply_date.format('YYYY-MM-DD') : null,
    });
    message.success('归档成功');
    setArchivedDocIds((prev) => new Set(prev).add(archivingDoc!.id));
    setArchiveOpen(false);
    setArchivingDoc(null);
  };

  const loadTemplate = async () => {
    const row = await db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'forward_template'"
    );
    setTemplateText(row?.value || defaultForwardTemplate);
  };

  const saveTemplate = async () => {
    await db.run(
      "INSERT OR REPLACE INTO config (key, value) VALUES ('forward_template', ?)",
      [templateText]
    );
    message.success('转发模版已保存');
  };

  const formatDeptText = (deps: DocDepartment[]): string => {
    if (deps.length === 0) return '';
    const roleOrder = ['lead', 'assist', 'read_handle', 'read_notify', 'summary'];
    const grouped = new Map<string, string[]>();
    for (const d of deps) {
      const list = grouped.get(d.role) || [];
      list.push(d.department_name || `#${d.department_id}`);
      grouped.set(d.role, list);
    }
    const parts: string[] = [];
    for (const role of roleOrder) {
      const names = grouped.get(role);
      if (names && names.length > 0) {
        if ((role === 'read_handle' || role === 'read_notify') && names.length >= 3) {
          parts.push(`各股室${roleLabels[role]}`);
        } else {
          parts.push(`${names.join('、')}${roleLabels[role]}`);
        }
      }
    }
    return parts.join('，');
  };

  const formatReplyDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const d = dayjs(dateStr);
    return `${d.month() + 1}月${d.date()}日`;
  };

  const genForwardText = (record: IncomingDoc): string => {
    const deps = record.departments || [];
    const deptLines = formatDeptText(deps);

    const receivers = deps
      .filter((d) => d.receiver && !d.department_name?.includes('办公室'))
      .flatMap((d) => d.receiver!.split(',').map((name) => `@${name.trim()}`))
      .join(' ');

    let text = fillTemplate(templateText, {
      '来文单位': record.send_unit_name || '',
      '标题': record.title,
      '转发股室': deptLines,
      '收文员': receivers || '@收文员',
      '呈批编号': record.approval_number || '',
      '回复日期': formatReplyDate(record.reply_deadline),
      '公文类型': record.document_type || '',
      '公文标签': record.document_tag || '',
      '摘要': record.summary || '',
    });

    if (!record.reply_deadline) {
      text = text.replace(/，于回复[。]?/g, '。');
    }
    return text;
  };

  const copyForwardText = async (record: IncomingDoc) => {
    const text = genForwardText(record);
    await copyToClipboard(text);
    message.success('转发内容已复制到剪贴板');
  };

  const handleUpload = async (docId: number, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = reader.result as ArrayBuffer;
      const savedPath = await window.electronAPI.file.saveFile(buffer);
      if (savedPath) {
        await addFile(docId, file.name, savedPath);
        message.success('文件关联成功');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={async () => {
            setEditing(null);
            const approvalNumber = await useIncomingStore.getState().generateApprovalNumber();
            form.resetFields();
            setDeptAssignments([]);
            form.setFieldsValue({
              document_type: '镇府公文',
              approval_number: approvalNumber,
            });
            setFormOpen(true);
          }}
        >
          收文登记
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
        <Select
          allowClear
          placeholder="按办理股室筛选"
          style={{ width: 200 }}
          value={filterDept}
          onChange={(v) => setFilterDept(v)}
        >
          {departments.map((d) => (
            <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
          ))}
        </Select>
        <Button
          icon={<EditOutlined />}
          onClick={async () => {
            await loadTemplate();
            setTemplateOpen(true);
          }}
        >
          转发模版
        </Button>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={docs}
        size="small"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
      />

      <Modal
        title={editing ? '编辑收文' : '收文登记'}
        open={formOpen}
        onOk={handleSubmit}
        onCancel={() => { setFormOpen(false); setEditing(null); setDeptAssignments([]); form.resetFields(); }}
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="level" label="公文等级">
                <Select allowClear placeholder="选择等级">
                  {levels.map((l) => (
                    <Select.Option key={l.id} value={l.name}>{l.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="document_type" label="公文类型">
                <Select allowClear placeholder="选择公文类型">
                  {docTypes.map((t) => (
                    <Select.Option key={t.id} value={t.name}>{t.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="document_tag" label="公文标签">
                <Select allowClear placeholder="选择公文标签">
                  {tags.map((t) => (
                    <Select.Option key={t.id} value={t.name}>{t.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="send_unit_id" label="来文单位">
                <Select allowClear placeholder="选择来文单位">
                  {units.map((u) => (
                    <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="approval_number" label="呈批编号">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="转发股室（多选）">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <Select
                allowClear
                placeholder="选择股室"
                style={{ flex: 1 }}
                value={selectedDept}
                onChange={(v) => setSelectedDept(v)}
              >
                {departments
                  .filter((d) => !deptAssignments.some((a) => a.department_id === d.id))
                  .map((d) => (
                    <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
                  ))}
              </Select>
              <Select
                value={selectedRole}
                onChange={(v) => setSelectedRole(v)}
                style={{ width: 100 }}
              >
                <Select.Option value="lead">主办</Select.Option>
                <Select.Option value="assist">协办</Select.Option>
                <Select.Option value="summary">汇总</Select.Option>
                <Select.Option value="read_handle">阅办</Select.Option>
                <Select.Option value="read_notify">阅知</Select.Option>
              </Select>
              <Button type="dashed" icon={<PlusOutlined />} onClick={addDeptAssignment}>
                添加
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  const existing = new Set(deptAssignments.map((a) => a.department_id));
                  const newAssignments = departments
                    .filter((d) => !existing.has(d.id))
                    .map((d) => ({ department_id: d.id, role: 'read_handle' as const }));
                  if (newAssignments.length === 0) {
                    message.info('所有股室已添加');
                    return;
                  }
                  setDeptAssignments([...deptAssignments, ...newAssignments]);
                  message.success(`已添加 ${newAssignments.length} 个股室为阅办`);
                }}
              >
                一键转各股室阅办
              </Button>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  const existing = new Set(deptAssignments.map((a) => a.department_id));
                  const newAssignments = departments
                    .filter((d) => !existing.has(d.id))
                    .map((d) => ({ department_id: d.id, role: 'read_notify' as const }));
                  if (newAssignments.length === 0) {
                    message.info('所有股室已添加');
                    return;
                  }
                  setDeptAssignments([...deptAssignments, ...newAssignments]);
                  message.success(`已添加 ${newAssignments.length} 个股室为阅知`);
                }}
              >
                一键转各股室阅知
              </Button>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  const officeDept = departments.find((d) => d.name.includes('办公室'));
                  if (!officeDept) {
                    message.warning('未找到办公室股室');
                    return;
                  }
                  if (deptAssignments.some((a) => a.department_id === officeDept.id && a.role === 'summary')) {
                    message.info('办公室已设为汇总');
                    return;
                  }
                  const withoutOld = deptAssignments.filter(
                    (a) => !(a.department_id === officeDept.id)
                  );
                  setDeptAssignments([...withoutOld, { department_id: officeDept.id, role: 'summary' }]);
                  message.success('办公室已设为汇总股室');
                }}
              >
                办公室汇总
              </Button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 28 }}>
              {deptAssignments.map((a) => (
                <Tag
                  key={a.department_id}
                  closable
                  onClose={() => removeDeptAssignment(a.department_id)}
                  color={roleColorMap[a.role]}
                >
                  {getDeptName(a.department_id)} ({roleLabels[a.role]})
                </Tag>
              ))}
              {deptAssignments.length === 0 && (
                <span style={{ color: '#ccc', fontSize: 13 }}>请添加转发股室</span>
              )}
            </div>
          </Form.Item>
          <Form.Item name="reply_deadline" label="回复日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="summary" label="摘要">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="关联文件"
        open={fileVisible}
        onCancel={() => setFileVisible(false)}
        footer={null}
      >
        <Upload
          beforeUpload={async (file) => {
            await handleUpload(currentDocId, file);
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
          dataSource={files}
          columns={[
            { title: '文件名', dataIndex: 'file_name' },
            {
              title: '操作',
              width: 80,
              render: (_, record: IncomingFile) => (
                <Popconfirm title="确定删除？" onConfirm={() => removeFile(record.id)}>
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title="转发内容模版"
        open={templateOpen}
        onOk={() => { saveTemplate(); setTemplateOpen(false); }}
        onCancel={() => setTemplateOpen(false)}
        width={680}
        okText="保存模版"
      >
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          可用变量：{`{{来文单位}} {{标题}} {{转发股室}} {{收文员}} {{呈批编号}} {{回复日期}} {{公文类型}} {{公文标签}} {{摘要}}`}
        </Typography.Text>
        <Input.TextArea
          rows={10}
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 13 }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['来文单位','标题','转发股室','收文员','呈批编号','回复日期','公文类型','公文标签','摘要'].map((v) => (
            <Button
              key={v}
              size="small"
              onClick={() => setTemplateText(templateText + `{{${v}}}`)}
            >
              {v}
            </Button>
          ))}
        </div>
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
                .filter((b) => b.box_type === 'incoming')
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
