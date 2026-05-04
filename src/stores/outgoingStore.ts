import { create } from 'zustand';
import { db } from '@/db';

export interface OutgoingDocUnit {
  id: number;
  outgoing_doc_id: number;
  unit_id: number;
  unit_name?: string;
  is_read: number;
}

export interface OutgoingDoc {
  id: number;
  title: string;
  level: string | null;
  reply_deadline: string | null;
  status: string;
  units?: OutgoingDocUnit[];
  created_at: string;
  updated_at: string;
}

interface OutgoingState {
  docs: OutgoingDoc[];

  loadDocs: (keyword?: string, dateRange?: [string, string]) => Promise<void>;
  addDoc: (data: Partial<OutgoingDoc>, unitIds?: number[]) => Promise<void>;
  updateDoc: (id: number, data: Partial<OutgoingDoc>, unitIds?: number[]) => Promise<void>;
  updateDocStatus: (id: number, status: string) => Promise<void>;
  toggleUnitRead: (docId: number, unitId: number) => Promise<void>;
  removeDoc: (id: number) => Promise<void>;
}

async function loadDocUnits(docIds: number[]): Promise<Map<number, OutgoingDocUnit[]>> {
  const map = new Map<number, OutgoingDocUnit[]>();
  if (docIds.length === 0) return map;

  const rows = await db.all<OutgoingDocUnit & { outgoing_doc_id: number }>(
    `SELECT odu.*, u.name as unit_name
     FROM outgoing_doc_units odu
     LEFT JOIN units u ON odu.unit_id = u.id
     WHERE odu.outgoing_doc_id IN (${docIds.map(() => '?').join(',')})`,
    docIds
  );

  for (const row of rows) {
    const list = map.get(row.outgoing_doc_id) || [];
    list.push({
      id: row.id,
      outgoing_doc_id: row.outgoing_doc_id,
      unit_id: row.unit_id,
      unit_name: row.unit_name,
      is_read: row.is_read,
    });
    map.set(row.outgoing_doc_id, list);
  }
  return map;
}

export const useOutgoingStore = create<OutgoingState>((set) => ({
  docs: [],

  loadDocs: async (keyword?: string, dateRange?: [string, string]) => {
    let sql = 'SELECT * FROM outgoing_docs';
    const params: any[] = [];
    const conditions: string[] = [];

    if (keyword) {
      conditions.push('title LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (dateRange) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(dateRange[0], `${dateRange[1]} 23:59:59`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY reply_deadline ASC';
    const rows = await db.all<OutgoingDoc>(sql, params);

    const docIds = rows.map((r) => r.id);
    const unitMap = await loadDocUnits(docIds);

    for (const row of rows) {
      row.units = unitMap.get(row.id) || [];
    }

    set({ docs: rows });
  },

  addDoc: async (data, unitIds) => {
    const result = await db.run(
      `INSERT INTO outgoing_docs (title, level, reply_deadline, status)
       VALUES (?, ?, ?, 'pending')`,
      [data.title, data.level, data.reply_deadline]
    );
    const id = Number(result.lastInsertRowId);

    if (unitIds && unitIds.length > 0) {
      for (const unitId of unitIds) {
        await db.run(
          'INSERT OR IGNORE INTO outgoing_doc_units (outgoing_doc_id, unit_id) VALUES (?, ?)',
          [id, unitId]
        );
      }
    }

    await useOutgoingStore.getState().loadDocs();
  },

  updateDoc: async (id, data, unitIds) => {
    const sets: string[] = [];
    const vals: any[] = [];
    const fields: (keyof OutgoingDoc)[] = ['title', 'level', 'reply_deadline', 'status'];
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${String(f)} = ?`);
        vals.push(data[f]);
      }
    }
    if (sets.length) {
      await db.run(
        `UPDATE outgoing_docs SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        [...vals, id]
      );
    }

    if (unitIds !== undefined) {
      await db.run('DELETE FROM outgoing_doc_units WHERE outgoing_doc_id = ?', [id]);
      for (const unitId of unitIds) {
        await db.run(
          'INSERT OR IGNORE INTO outgoing_doc_units (outgoing_doc_id, unit_id) VALUES (?, ?)',
          [id, unitId]
        );
      }
    }

    await useOutgoingStore.getState().loadDocs();
  },

  updateDocStatus: async (id, status) => {
    await db.run("UPDATE outgoing_docs SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, status } : d)),
    }));
  },

  toggleUnitRead: async (docId, unitId) => {
    const row = await db.get<{ is_read: number }>(
      'SELECT is_read FROM outgoing_doc_units WHERE outgoing_doc_id = ? AND unit_id = ?',
      [docId, unitId]
    );
    if (!row) return;

    const newVal = row.is_read ? 0 : 1;
    await db.run(
      'UPDATE outgoing_doc_units SET is_read = ? WHERE outgoing_doc_id = ? AND unit_id = ?',
      [newVal, docId, unitId]
    );

    // Check if all units are read → set status to done
    const allRead = await db.get<{ cnt: number; total: number }>(
      `SELECT
         SUM(is_read) as cnt,
         COUNT(*) as total
       FROM outgoing_doc_units
       WHERE outgoing_doc_id = ?`,
      [docId]
    );
    if (allRead && allRead.cnt === allRead.total) {
      await db.run("UPDATE outgoing_docs SET status = 'done', updated_at = datetime('now') WHERE id = ?", [docId]);
    } else {
      await db.run("UPDATE outgoing_docs SET status = 'pending', updated_at = datetime('now') WHERE id = ?", [docId]);
    }

    await useOutgoingStore.getState().loadDocs();
  },

  removeDoc: async (id) => {
    await db.run('DELETE FROM outgoing_docs WHERE id = ?', [id]);
    set((s) => ({ docs: s.docs.filter((d) => d.id !== id) }));
  },
}));
