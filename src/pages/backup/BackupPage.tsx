import { useState } from 'react';
import { Card, Button, Space, message, Typography, Popconfirm } from 'antd';
import { ExportOutlined, ImportOutlined, WarningOutlined } from '@ant-design/icons';

export default function BackupPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await window.electronAPI.db.export();
      if (result.success) {
        message.success(`数据库已备份到: ${result.path}`);
      }
    } catch (e: any) {
      message.error('备份失败: ' + (e.message || '未知错误'));
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await window.electronAPI.db.import();
      if (result.success) {
        message.success('数据导入成功，页面将刷新');
        setTimeout(() => window.location.reload(), 1000);
      } else if (result.error) {
        message.error(result.error);
      }
    } catch (e: any) {
      message.error('导入失败: ' + (e.message || '未知错误'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Card title="备份管理" style={{ maxWidth: 600 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card size="small" type="inner">
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              <ExportOutlined style={{ marginRight: 8 }} />
              导出备份
            </Typography.Title>
            <Typography.Text type="secondary">
              将当前所有数据导出为数据库文件，可用于数据迁移或备份保存。
            </Typography.Text>
            <div style={{ marginTop: 12 }}>
              <Button
                type="primary"
                icon={<ExportOutlined />}
                loading={exporting}
                onClick={handleExport}
              >
                导出数据库
              </Button>
            </div>
          </Card>

          <Card size="small" type="inner">
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              <ImportOutlined style={{ marginRight: 8 }} />
              导入数据
            </Typography.Title>
            <Typography.Text type="secondary">
              从备份文件恢复数据，导入前会自动备份当前数据。
            </Typography.Text>
            <br />
            <Typography.Text type="danger">
              <WarningOutlined /> 导入将覆盖当前所有数据，请谨慎操作。
            </Typography.Text>
            <div style={{ marginTop: 12 }}>
              <Popconfirm
                title="导入将覆盖当前所有数据，确定继续？"
                description="导入前会自动备份当前数据"
                onConfirm={handleImport}
                okText="确定导入"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  danger
                  icon={<ImportOutlined />}
                  loading={importing}
                >
                  导入数据库
                </Button>
              </Popconfirm>
            </div>
          </Card>
        </Space>
      </Card>
    </div>
  );
}
