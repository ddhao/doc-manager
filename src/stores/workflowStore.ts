import { create } from 'zustand';
import { db } from '@/db';

export interface WorkflowApprover {
  id: number;
  stage_id: number;
  approver_name: string;
  sort_order: number;
}

export interface WorkflowStage {
  id: number;
  template_id: number;
  name: string;
  has_approvers: number;
  sort_order: number;
  approvers: WorkflowApprover[];
}

export interface WorkflowTemplate {
  id: number;
  name: string;
  description: string | null;
  stages: WorkflowStage[];
  created_at: string;
  updated_at: string;
}

interface WorkflowState {
  templates: WorkflowTemplate[];
  selectedId: number | null;

  loadTemplates: () => Promise<void>;
  selectTemplate: (id: number | null) => void;
  addTemplate: (data: { name: string; description?: string; stages: { name: string; hasApprovers: boolean }[] }) => Promise<void>;
  updateTemplate: (id: number, data: { name: string; description?: string }) => Promise<void>;
  replaceStages: (templateId: number, stages: { name: string; hasApprovers: boolean }[]) => Promise<void>;
  removeTemplate: (id: number) => Promise<void>;
  addApprover: (stageId: number, name: string) => Promise<void>;
  removeApprover: (approverId: number) => Promise<void>;
  reorderStages: (templateId: number, stageIds: number[]) => Promise<void>;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  templates: [],
  selectedId: null,

  loadTemplates: async () => {
    const templates = await db.all<WorkflowTemplate>(
      'SELECT * FROM workflow_templates ORDER BY created_at DESC'
    );

    for (const t of templates) {
      const stages = await db.all<WorkflowStage>(
        'SELECT * FROM workflow_stages WHERE template_id = ? ORDER BY sort_order',
        [t.id]
      );
      for (const s of stages) {
        s.approvers = await db.all<WorkflowApprover>(
          'SELECT * FROM workflow_approvers WHERE stage_id = ? ORDER BY sort_order',
          [s.id]
        );
      }
      t.stages = stages;
    }

    const { selectedId } = get();
    const stillExists = selectedId && templates.some((t) => t.id === selectedId);
    set({ templates, selectedId: stillExists ? selectedId : (templates[0]?.id || null) });
  },

  selectTemplate: (id) => set({ selectedId: id }),

  addTemplate: async (data) => {
    const result = await db.run(
      'INSERT INTO workflow_templates (name, description) VALUES (?, ?)',
      [data.name, data.description || null]
    );
    const templateId = Number(result.lastInsertRowId);

    for (let i = 0; i < data.stages.length; i++) {
      await db.run(
        'INSERT INTO workflow_stages (template_id, name, has_approvers, sort_order) VALUES (?, ?, ?, ?)',
        [templateId, data.stages[i].name, data.stages[i].hasApprovers ? 1 : 0, i]
      );
    }

    await get().loadTemplates();
    set({ selectedId: templateId });
  },

  updateTemplate: async (id, data) => {
    await db.run(
      "UPDATE workflow_templates SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
      [data.name, data.description || null, id]
    );
    await get().loadTemplates();
  },

  replaceStages: async (templateId, stages) => {
    await db.run('DELETE FROM workflow_stages WHERE template_id = ?', [templateId]);
    for (let i = 0; i < stages.length; i++) {
      await db.run(
        'INSERT INTO workflow_stages (template_id, name, has_approvers, sort_order) VALUES (?, ?, ?, ?)',
        [templateId, stages[i].name, stages[i].hasApprovers ? 1 : 0, i]
      );
    }
    await get().loadTemplates();
  },

  removeTemplate: async (id) => {
    await db.run('DELETE FROM workflow_templates WHERE id = ?', [id]);
    await get().loadTemplates();
  },

  addApprover: async (stageId, name) => {
    const rows = await db.all<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM workflow_approvers WHERE stage_id = ?',
      [stageId]
    );
    await db.run(
      'INSERT INTO workflow_approvers (stage_id, approver_name, sort_order) VALUES (?, ?, ?)',
      [stageId, name, rows[0]?.cnt || 0]
    );
    await get().loadTemplates();
  },

  removeApprover: async (approverId) => {
    await db.run('DELETE FROM workflow_approvers WHERE id = ?', [approverId]);
    await get().loadTemplates();
  },

  reorderStages: async (templateId, stageIds) => {
    for (let i = 0; i < stageIds.length; i++) {
      await db.run('UPDATE workflow_stages SET sort_order = ? WHERE id = ? AND template_id = ?', [
        i,
        stageIds[i],
        templateId,
      ]);
    }
    await get().loadTemplates();
  },
}));
