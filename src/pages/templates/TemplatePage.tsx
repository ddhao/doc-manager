import { useEffect, useState } from 'react';
import { Card, Button, Input, Typography, Upload, message, Space } from 'antd';
import { EditOutlined, UploadOutlined } from '@ant-design/icons';
import { db } from '@/db';

const defaultForwardTemplate = `【{{来文单位}}】{{标题}}

转发：{{转发股室}}
{{收文员}}请阅处。`;

export default function TemplatePage() {
  const [forwardTemplate, setForwardTemplate] = useState(defaultForwardTemplate);
  const [hasApprovalTemplate, setHasApprovalTemplate] = useState(false);

  useEffect(() => {
    loadForwardTemplate();
    checkApprovalTemplate();
  }, []);

  const loadForwardTemplate = async () => {
    const row = await db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'forward_template'"
    );
    setForwardTemplate(row?.value || defaultForwardTemplate);
  };

  const saveForwardTemplate = async () => {
    await db.run(
      "INSERT OR REPLACE INTO config (key, value) VALUES ('forward_template', ?)",
      [forwardTemplate]
    );
    message.success('转发模版已保存');
  };

  const checkApprovalTemplate = async () => {
    const row = await db.get<{ value: string }>(
      "SELECT value FROM config WHERE key = 'approval_template'"
    );
    setHasApprovalTemplate(!!row?.value);
  };

  const uploadApprovalTemplate = async () => {
    const result = await window.electronAPI.file.openFile({
      filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });
    if (!result) return;
    const bytes = new Uint8Array(result.data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    await db.run(
      "INSERT OR REPLACE INTO config (key, value) VALUES ('approval_template', ?)",
      [base64]
    );
    setHasApprovalTemplate(true);
    message.success(`已上传呈批表模版: ${result.filePath.split(/[/\\]/).pop()}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card size="small" title="转发模版">
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          可用变量：{`{{来文单位}} {{标题}} {{转发股室}} {{收文员}} {{呈批编号}} {{回复日期}} {{公文类型}} {{公文标签}} {{摘要}}`}
        </Typography.Text>
        <Input.TextArea
          rows={8}
          value={forwardTemplate}
          onChange={(e) => setForwardTemplate(e.target.value)}
          style={{ fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space wrap>
            {['来文单位', '标题', '转发股室', '收文员', '呈批编号', '回复日期', '公文类型', '公文标签', '摘要'].map((v) => (
              <Button
                key={v}
                size="small"
                onClick={() => setForwardTemplate(forwardTemplate + `{{${v}}}`)}
              >
                {v}
              </Button>
            ))}
          </Space>
          <Button type="primary" icon={<EditOutlined />} onClick={saveForwardTemplate}>
            保存模版
          </Button>
        </div>
      </Card>

      <Card size="small" title="呈批表模版">
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          上传 Word (.docx) 格式的呈批表模版，用于生成呈批表。模版中可用变量与呈批表中的字段对应。
        </Typography.Text>
        <Button
          icon={<UploadOutlined />}
          type={hasApprovalTemplate ? 'default' : 'primary'}
          danger={!hasApprovalTemplate}
          onClick={uploadApprovalTemplate}
        >
          {hasApprovalTemplate ? '更新呈批表模版' : '上传呈批表模版'}
        </Button>
      </Card>
    </div>
  );
}
