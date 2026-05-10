import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Modal, Form, Input, Select, DatePicker, Tag, Popconfirm,
  Upload, message, Dropdown, Row, Col, Typography,
} from 'antd';
import {
  PlusOutlined, CopyOutlined, EditOutlined,
  DeleteOutlined, FileTextOutlined, MoreOutlined, SearchOutlined, ImportOutlined, ExportOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { useIncomingStore, IncomingDoc, IncomingFile, DocDepartment, roleLabels } from '@/stores/incomingStore';
import { useUnitStore } from '@/stores/unitStore';
import { useConfigStore } from '@/stores/configStore';
import { useArchiveStore } from '@/stores/archiveStore';
import { copyToClipboard, db } from '@/db';

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
  const { docs, files, loadDocs, addDoc, updateDoc, removeDoc, updateDocStatus, batchReply, clearAll, importFromExcel, exportToExcel, loadFiles, addFile, removeFile } =
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivingDoc, setArchivingDoc] = useState<IncomingDoc | null>(null);
  const [archivedDocIds, setArchivedDocIds] = useState<Set<number>>(new Set());
  const [archiveForm] = Form.useForm();
  const archiveStore = useArchiveStore();
  const [form] = Form.useForm();
  const [templateText, setTemplateText] = useState(defaultForwardTemplate);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [clearPwdOpen, setClearPwdOpen] = useState(false);
  const [clearPwd, setClearPwd] = useState('');

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
      dateRange ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')] : undefined,
      filterStatus
    );
    loadUnits();
    loadDepartments();
    loadDocTypes();
    loadTags();
    loadLevels();
    loadArchivedIds();
    loadForwardTemplate();
  }, [filterDept, keyword, dateRange, filterStatus]);

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
    { title: '呈批编号', dataIndex: 'approval_number', width: 120, render: (v) => v || '-' },
    {
      title: '标题',
      dataIndex: 'title',
      render: (title: string, record: IncomingDoc) => {
        const levelColorMap: Record<string, string> = {
          '特急': 'red', '加急': 'orange', '急': 'gold',
        };
        return (
          <div
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
            }}
          >
            <Space size={4}>
              {record.level && record.level !== '平' && (
                <Tag color={levelColorMap[record.level] || 'default'} style={{ flexShrink: 0 }}>{record.level}</Tag>
              )}
              {record.document_tag && <Tag color="cyan" style={{ flexShrink: 0 }}>{record.document_tag}</Tag>}
              <span>{title}</span>
              <Button
                type="link"
                size="small"
                icon={<CopyOutlined />}
                style={{ padding: 0, flexShrink: 0 }}
                onClick={async (e) => {
                  e.stopPropagation();
                  await copyToClipboard(title);
                  message.success('标题已复制');
                }}
              />
            </Space>
          </div>
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
      title: '回文日期',
      dataIndex: 'reply_date',
      width: 160,
      render: (v) => v || '-',
    },
    {
      title: '备注',
      dataIndex: 'notes',
      width: 200,
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
                ...(record.status === 'done' && !isArchived
                  ? [{ key: 'archive', label: '归档', icon: <FileTextOutlined />, onClick: () => openArchive(record) }]
                  : []),
                ...(isArchived
                  ? [{ key: 'archived', label: '已归档', icon: <FileTextOutlined />, disabled: true }]
                  : []),
                { key: 'files', label: '关联文件', icon: <FileTextOutlined />, onClick: () => openFiles(record.id) },
                {
                  key: 'generate', label: '生成呈批表', icon: <FileTextOutlined />,
                  disabled: generatingId === record.id,
                  onClick: () => generateApprovalDocx(record),
                },
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

  const handleImport = async () => {
    const result = await window.electronAPI.file.openFile({
      filters: [{ name: 'Excel文件', extensions: ['xlsx', 'xls'] }],
    });
    if (!result) return;
    try {
      const { imported, skipped } = await importFromExcel(result.data);
      message.success(`导入完成：成功 ${imported} 条${skipped > 0 ? `，跳过 ${skipped} 条` : ''}`);
    } catch (e: any) {
      message.error(`导入失败：${e.message || '请检查文件格式'}`);
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportToExcel();
      await window.electronAPI.file.saveFile(data, {
        defaultName: '2026年收文记录.xlsx',
        filters: [{ name: 'Excel文件', extensions: ['xlsx'] }],
      });
      message.success('导出成功');
    } catch (e: any) {
      message.error(`导出失败：${e.message || '未知错误'}`);
    }
  };

  const loadForwardTemplate = async () => {
    const row = await db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'forward_template'"
    );
    setTemplateText(row?.value || defaultForwardTemplate);
  };

  const generateApprovalDocx = async (record: IncomingDoc) => {
    setGeneratingId(record.id);
    try {
      const row = await db.get<{ value: string }>(
        "SELECT value FROM config WHERE key = 'approval_template'"
      );
      if (!row?.value) {
        message.warning('请先上传呈批表模版');
        return;
      }

      // Decode base64 to binary
      const binaryStr = atob(row.value);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const deps = record.departments || [];
      const now = dayjs();
      const today = now.format('YYYY年M月D日');

      // Build data for template filling
      const data: Record<string, string> = {
        '收文日期': record.created_at ? dayjs(record.created_at).format('YYYY-M-D') : '',
        '呈批编号': record.approval_number || '',
        '来文单位': record.send_unit_name || '',
        '来文字号': record.document_number || '',
        '密级': record.security_level || '',
        '公文等级': record.level || '',
        '标题': record.title || '',
        '摘要': record.summary || '',
        '经办人': record.handler || '',
        '审核人': record.reviewer || '',
        '打印日期': today,
        '页脚时间': now.format('M.D  HH:mm'),
        '转发时间': now.format('YYYY年M月D日 HH:mm'),
        '回复日期': record.reply_deadline ? dayjs(record.reply_deadline).format('YYYY年M月D日') : '',
        '公文类型': record.document_type || '',
        '公文标签': record.document_tag || '',
        '转发股室': formatDeptText(deps),
        '主办股室': deps.filter((d) => d.role === 'lead').map((d) => d.department_name || '').join('、'),
        '协办股室': deps.filter((d) => d.role === 'assist').map((d) => d.department_name || '').join('、'),
        '汇总股室': deps.filter((d) => d.role === 'summary').map((d) => d.department_name || '').join('、'),
        '阅办股室': deps.filter((d) => d.role === 'read_handle').map((d) => d.department_name || '').join('、'),
        '阅知股室': deps.filter((d) => d.role === 'read_notify').map((d) => d.department_name || '').join('、'),
      };

      const zip = new PizZip(bytes);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
      doc.setData(data);
      doc.render();

      const output = doc.getZip().generate({
        type: 'arraybuffer',
        compression: 'DEFLATE',
      }) as ArrayBuffer;

      const fileName = `${record.approval_number || record.id}${record.title}.wps`;
      const tmpPath = await window.electronAPI.file.saveTemp(output, fileName);
      await window.electronAPI.shell.openPath(tmpPath);
      message.success(`已生成呈批表: ${fileName}`);
    } catch (e: any) {
      message.error(`生成失败: ${e.message || '未知错误'}`);
    } finally {
      setGeneratingId(null);
    }
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
              handler: '刘浩',
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
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 130 }}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
        >
          {Object.entries(statusMap).map(([key, st]) => (
            <Select.Option key={key} value={key}>
              <Tag color={st.color}>{st.text}</Tag>
            </Select.Option>
          ))}
        </Select>
        <Button icon={<ImportOutlined />} onClick={handleImport}>导入</Button>
        <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        <Button danger icon={<DeleteOutlined />} onClick={() => { setClearPwd(''); setClearPwdOpen(true); }}>
          清除数据
        </Button>
        {selectedRowKeys.length > 0 && (
          <Popconfirm
            title={`确定将选中的 ${selectedRowKeys.length} 条记录标记为已办结？回文时间将为当前时间。`}
            onConfirm={async () => {
              await batchReply(selectedRowKeys.map(Number));
              message.success(`已办结 ${selectedRowKeys.length} 条记录`);
              setSelectedRowKeys([]);
            }}
          >
            <Button type="primary" icon={<FileTextOutlined />}>
              一键回文（{selectedRowKeys.length}）
            </Button>
          </Popconfirm>
        )}
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={docs}
        size="small"
        loading={loading}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
          getCheckboxProps: (record) => ({
            disabled: !!record.reply_date || !record.reply_deadline,
          }),
        }}
        scroll={{ x: 1500, y: 'calc(100vh - 230px)' }}
        pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], showTotal: (t) => `共 ${t} 条` }}
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
                <Select allowClear showSearch placeholder="选择来文单位"
                  filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                >
                  {units.map((u) => (
                    <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="document_number" label="来文字号">
                <Input />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="security_level" label="密级">
                <Select allowClear placeholder="选择密级">
                  <Select.Option value="绝密">绝密</Select.Option>
                  <Select.Option value="机密">机密</Select.Option>
                  <Select.Option value="秘密">秘密</Select.Option>
                  <Select.Option value="普">普</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="approval_number" label="呈批编号">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="handler" label="经办人">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reviewer" label="审核人">
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
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
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

      <Modal
        title="验证密码"
        open={clearPwdOpen}
        onOk={async () => {
          if (clearPwd !== 'zrzy86002718') {
            message.error('密码错误');
            return;
          }
          await clearAll();
          message.success('已清除所有收文数据');
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
