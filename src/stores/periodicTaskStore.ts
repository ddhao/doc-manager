import { create } from 'zustand';
import { db } from '@/db';

export interface PeriodicTask {
  id: number;
  title: string;
  description: string | null;
  reminder_day: number;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PeriodicTaskState {
  tasks: PeriodicTask[];
  loadTasks: () => Promise<void>;
  addTask: (data: Partial<PeriodicTask>) => Promise<void>;
  updateTask: (id: number, data: Partial<PeriodicTask>) => Promise<void>;
  toggleStatus: (id: number) => Promise<void>;
  removeTask: (id: number) => Promise<void>;
}

export const usePeriodicTaskStore = create<PeriodicTaskState>((set) => ({
  tasks: [],

  loadTasks: async () => {
    const rows = await db.all<PeriodicTask>(
      'SELECT * FROM periodic_tasks ORDER BY reminder_day ASC, created_at DESC'
    );
    set({ tasks: rows });
  },

  addTask: async (data) => {
    await db.run(
      `INSERT INTO periodic_tasks (title, description, reminder_day, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      [data.title, data.description || null, data.reminder_day, data.start_date, data.end_date || null]
    );
    await usePeriodicTaskStore.getState().loadTasks();
  },

  updateTask: async (id, data) => {
    const sets: string[] = [];
    const vals: any[] = [];
    const fields: (keyof PeriodicTask)[] = ['title', 'description', 'reminder_day', 'start_date', 'end_date', 'status'];
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${String(f)} = ?`);
        vals.push(data[f]);
      }
    }
    if (sets.length) {
      await db.run(
        `UPDATE periodic_tasks SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        [...vals, id]
      );
      await usePeriodicTaskStore.getState().loadTasks();
    }
  },

  toggleStatus: async (id) => {
    const task = usePeriodicTaskStore.getState().tasks.find((t) => t.id === id);
    if (!task) return;
    const newStatus = task.status === 'active' ? 'completed' : 'active';
    await db.run("UPDATE periodic_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", [newStatus, id]);
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: newStatus } : t)),
    }));
  },

  removeTask: async (id) => {
    await db.run('DELETE FROM periodic_tasks WHERE id = ?', [id]);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
  },
}));
