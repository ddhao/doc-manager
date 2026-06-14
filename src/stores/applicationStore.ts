import { create } from 'zustand';
import { db } from '@/db';

export interface Approval {
  id: number;
  application_id: number;
  stage_order: number;
  stage_name: string;
  approver_name: string;
  status: string;
  comment: string | null;
  created_at: string;
}

export interface Application {
  id: number;
  type_id: number;
  type_name?: string;
  title: string;
  description: string | null;
  applicant: string | null;
  workflow_template_id: number | null;
  workflow_name?: string;
  current_stage_order: number;
  status: string;
  approvals?: Approval[];
  created_at: string;
  updated_at: string;
}

export const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'blue', text: '待审批' },
  processing: { color: 'orange', text: '审批中' },
  approved: { color: 'green', text: '已通过' },
  rejected: { color: 'red', text: '已驳回' },
};

interface ApplicationState {
  apps: Application[];
  loadApps: () => Promise<void>;
  addApp: (data: {
    typeId: number;
    title: string;
    description?: string;
    applicant?: string;
    workflowTemplateId: number;
    approvals: { stageOrder: number; stageName: string; approverName: string }[];
  }) => Promise<void>;
  updateAppStatus: (id: number, status: string) => Promise<void>;
  approveStage: (appId: number, approvalId: number, status: string) => Promise<void>;
  removeApp: (id: number) => Promise<void>;
}

export const useApplicationStore = create<ApplicationState>((set, get) => ({
  apps: [],

  loadApps: async () => {
    const rows = await db.all<Application>(
      `SELECT a.*, wt.name as workflow_name, at.name as type_name
       FROM applications a
       LEFT JOIN workflow_templates wt ON a.workflow_template_id = wt.id
       LEFT JOIN application_types at ON a.type_id = at.id
       ORDER BY a.created_at DESC`
    );
    for (const app of rows) {
      app.approvals = await db.all<Approval>(
        'SELECT * FROM approvals WHERE application_id = ? ORDER BY stage_order, id',
        [app.id]
      );
    }
    set({ apps: rows });
  },

  addApp: async (data) => {
    const firstStage = Math.min(...data.approvals.map((a) => a.stageOrder));

    const result = await db.run(
      `INSERT INTO applications (type_id, title, description, applicant, workflow_template_id, status, current_stage_order)
       VALUES (?, ?, ?, ?, ?, 'processing', ?)`,
      [data.typeId, data.title, data.description || null, data.applicant || null, data.workflowTemplateId, firstStage]
    );
    const appId = Number(result.lastInsertRowId);

    for (const a of data.approvals) {
      await db.run(
        `INSERT INTO approvals (application_id, stage_order, stage_name, approver_name, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [appId, a.stageOrder, a.stageName, a.approverName]
      );
    }

    await get().loadApps();
  },

  updateAppStatus: async (id, status) => {
    await db.run("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    set((s) => ({ apps: s.apps.map((a) => (a.id === id ? { ...a, status } : a)) }));
  },

  approveStage: async (appId, approvalId, status) => {
    await db.run("UPDATE approvals SET status = ? WHERE id = ?", [status, approvalId]);

    const app = get().apps.find((a) => a.id === appId);
    if (!app) return;

    const approvals = await db.all<Approval>(
      'SELECT * FROM approvals WHERE application_id = ? ORDER BY stage_order, id',
      [appId]
    );

    const currentStage = app.current_stage_order;
    const stageApprovals = approvals.filter((a) => a.stage_order === currentStage);

    const allDone = stageApprovals.every((a) => a.status === 'approved');
    const anyRejected = stageApprovals.some((a) => a.status === 'rejected');

    if (anyRejected) {
      await db.run("UPDATE applications SET status = 'rejected', updated_at = datetime('now') WHERE id = ?", [appId]);
    } else if (allDone) {
      const stageOrders = [...new Set(approvals.map((a) => a.stage_order))].sort((a, b) => a - b);
      const currentIdx = stageOrders.indexOf(currentStage);
      if (currentIdx < 0 || currentIdx >= stageOrders.length - 1) {
        await db.run("UPDATE applications SET status = 'approved', updated_at = datetime('now') WHERE id = ?", [appId]);
      } else {
        await db.run(
          "UPDATE applications SET current_stage_order = ?, updated_at = datetime('now') WHERE id = ?",
          [stageOrders[currentIdx + 1], appId]
        );
      }
    }

    await get().loadApps();
  },

  removeApp: async (id) => {
    await db.run('DELETE FROM applications WHERE id = ?', [id]);
    set((s) => ({ apps: s.apps.filter((a) => a.id !== id) }));
  },
}));
