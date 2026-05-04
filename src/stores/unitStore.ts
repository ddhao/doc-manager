import { create } from 'zustand';
import { db } from '@/db';

export interface Unit {
  id: number;
  name: string;
  created_at: string;
}

export interface Department {
  id: number;
  name: string;
  unit_id: number | null;
  unit_name?: string;
  leader: string | null;
  receiver: string | null;
  sort_order: number;
}

export interface Contact {
  id: number;
  name: string;
  alias: string | null;
  title: string | null;
  phone: string | null;
  department_id: number | null;
  department_name?: string;
}

interface UnitState {
  units: Unit[];
  departments: Department[];
  contacts: Contact[];

  loadUnits: () => Promise<void>;
  addUnit: (name: string) => Promise<void>;
  removeUnit: (id: number) => Promise<void>;

  loadDepartments: () => Promise<void>;
  addDepartment: (data: Omit<Department, 'id' | 'unit_name' | 'created_at'>) => Promise<void>;
  updateDepartment: (id: number, data: Partial<Omit<Department, 'id' | 'unit_name' | 'created_at'>>) => Promise<void>;
  removeDepartment: (id: number) => Promise<void>;

  loadContacts: () => Promise<void>;
  addContact: (data: Omit<Contact, 'id' | 'department_name'>) => Promise<void>;
  updateContact: (id: number, data: Partial<Omit<Contact, 'id' | 'department_name'>>) => Promise<void>;
  removeContact: (id: number) => Promise<void>;
}

export const useUnitStore = create<UnitState>((set) => ({
  units: [],
  departments: [],
  contacts: [],

  loadUnits: async () => {
    const rows = await db.all<Unit>('SELECT * FROM units ORDER BY id');
    set({ units: rows });
  },
  addUnit: async (name: string) => {
    await db.run('INSERT INTO units (name) VALUES (?)', [name]);
    await useUnitStore.getState().loadUnits();
  },
  removeUnit: async (id: number) => {
    await db.run('DELETE FROM units WHERE id = ?', [id]);
    set((s) => ({ units: s.units.filter((u) => u.id !== id) }));
  },

  loadDepartments: async () => {
    const rows = await db.all<Department>(
      'SELECT d.*, u.name as unit_name FROM departments d LEFT JOIN units u ON d.unit_id = u.id ORDER BY d.sort_order, d.id'
    );
    set({ departments: rows });
  },
  addDepartment: async (data) => {
    await db.run(
      'INSERT INTO departments (name, unit_id, leader, receiver, sort_order) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.unit_id, data.leader, data.receiver, data.sort_order ?? 0]
    );
    await useUnitStore.getState().loadDepartments();
  },
  updateDepartment: async (id, data) => {
    const sets: string[] = [];
    const vals: any[] = [];
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
    if (data.unit_id !== undefined) { sets.push('unit_id = ?'); vals.push(data.unit_id); }
    if (data.leader !== undefined) { sets.push('leader = ?'); vals.push(data.leader); }
    if (data.receiver !== undefined) { sets.push('receiver = ?'); vals.push(data.receiver); }
    if (data.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(data.sort_order); }
    if (sets.length) {
      await db.run(`UPDATE departments SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...vals, id]);
    }
  },
  removeDepartment: async (id: number) => {
    await db.run('DELETE FROM departments WHERE id = ?', [id]);
    set((s) => ({ departments: s.departments.filter((d) => d.id !== id) }));
  },

  loadContacts: async () => {
    const rows = await db.all<Contact>(
      'SELECT c.*, d.name as department_name FROM contacts c LEFT JOIN departments d ON c.department_id = d.id ORDER BY c.id'
    );
    set({ contacts: rows });
  },
  addContact: async (data) => {
    await db.run(
      'INSERT INTO contacts (name, alias, title, phone, department_id) VALUES (?, ?, ?, ?, ?)',
      [data.name, data.alias, data.title, data.phone, data.department_id]
    );
    await useUnitStore.getState().loadContacts();
  },
  updateContact: async (id, data) => {
    const sets: string[] = [];
    const vals: any[] = [];
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
    if (data.alias !== undefined) { sets.push('alias = ?'); vals.push(data.alias); }
    if (data.title !== undefined) { sets.push('title = ?'); vals.push(data.title); }
    if (data.phone !== undefined) { sets.push('phone = ?'); vals.push(data.phone); }
    if (data.department_id !== undefined) { sets.push('department_id = ?'); vals.push(data.department_id); }
    if (sets.length) {
      await db.run(`UPDATE contacts SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, [...vals, id]);
    }
  },
  removeContact: async (id: number) => {
    await db.run('DELETE FROM contacts WHERE id = ?', [id]);
    set((s) => ({ contacts: s.contacts.filter((c) => c.id !== id) }));
  },
}));
