import { create } from 'zustand';
import { db } from '@/db';

export interface DocDepartment {
  id: number;
  department_id: number;
  department_name?: string;
  receiver?: string;
  role: string;
}

export interface IncomingDoc {
  id: number;
  document_type: string | null;
  document_tag: string | null;
  level: string | null;
  send_unit_id: number | null;
  send_unit_name?: string;
  title: string;
  summary: string | null;
  approval_number: string | null;
  reply_deadline: string | null;
  status: string;
  departments?: DocDepartment[];
  created_at: string;
  updated_at: string;
}

export interface IncomingFile {
  id: number;
  incoming_doc_id: number;
  file_name: string;
  file_path: string;
}

const roleLabels: Record<string, string> = {
  lead: '主办',
  assist: '协办',
  summary: '汇总',
  read_handle: '阅办',
  read_notify: '阅知',
};

interface IncomingState {
  docs: IncomingDoc[];
  files: IncomingFile[];
  loading: boolean;

  loadDocs: (departmentId?: number, keyword?: string, dateRange?: [string, string]) => Promise<void>;
  generateApprovalNumber: () => Promise<string>;
  addDoc: (data: Partial<IncomingDoc>, deptAssignments?: { department_id: number; role: string }[]) => Promise<number>;
  updateDoc: (id: number, data: Partial<IncomingDoc>, deptAssignments?: { department_id: number; role: string }[]) => Promise<void>;
  removeDoc: (id: number) => Promise<void>;
  updateDocStatus: (id: number, status: string) => Promise<void>;

  loadFiles: (docId: number) => Promise<void>;
  addFile: (docId: number, fileName: string, filePath: string) => Promise<void>;
  removeFile: (id: number) => Promise<void>;
}

async function loadDocDepartments(docIds: number[]): Promise<Map<number, DocDepartment[]>> {
  const map = new Map<number, DocDepartment[]>();
  if (docIds.length === 0) return map;

  const rows = await db.all<DocDepartment & { incoming_doc_id: number }>(
    `SELECT idd.*, d.name as department_name, d.receiver
     FROM incoming_doc_departments idd
     LEFT JOIN departments d ON idd.department_id = d.id
     WHERE idd.incoming_doc_id IN (${docIds.map(() => '?').join(',')})
     ORDER BY
       CASE idd.role
         WHEN 'lead' THEN 1
         WHEN 'summary' THEN 2
         WHEN 'assist' THEN 3
         WHEN 'read_handle' THEN 4
         WHEN 'read_notify' THEN 5
       END`,
    docIds
  );

  for (const row of rows) {
    const list = map.get(row.incoming_doc_id) || [];
    list.push({
      id: row.id,
      department_id: row.department_id,
      department_name: row.department_name,
      receiver: row.receiver,
      role: row.role,
    });
    map.set(row.incoming_doc_id, list);
  }
  return map;
}

export const useIncomingStore = create<IncomingState>((set) => ({
  docs: [],
  files: [],
  loading: false,

  loadDocs: async (departmentId?: number, keyword?: string, dateRange?: [string, string]) => {
    let sql = `
      SELECT i.*, u.name as send_unit_name
      FROM incoming_docs i
      LEFT JOIN units u ON i.send_unit_id = u.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (departmentId) {
      conditions.push(`i.id IN (
        SELECT incoming_doc_id FROM incoming_doc_departments WHERE department_id = ?
      )`);
      params.push(departmentId);
    }
    if (keyword) {
      conditions.push('i.title LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (dateRange) {
      conditions.push('i.created_at >= ? AND i.created_at <= ?');
      params.push(dateRange[0], `${dateRange[1]} 23:59:59`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY i.reply_deadline ASC';
    const rows = await db.all<IncomingDoc>(sql, params);

    const docIds = rows.map((r) => r.id);
    const deptMap = await loadDocDepartments(docIds);

    for (const row of rows) {
      row.departments = deptMap.get(row.id) || [];
    }

    set({ docs: rows });
  },

  generateApprovalNumber: async () => {
    const year = new Date().getFullYear().toString();
    const row = await db.get<{ max_num: string | null }>(
      "SELECT MAX(approval_number) as max_num FROM incoming_docs WHERE approval_number LIKE ?",
      [`${year}%`]
    );
    if (row && row.max_num) {
      const seq = parseInt(row.max_num.slice(4), 10) + 1;
      return `${year}${String(seq).padStart(4, '0')}`;
    }
    return `${year}0001`;
  },

  addDoc: async (data, deptAssignments) => {
    const status = data.reply_deadline ? 'pending' : 'done';
    const result = await db.run(
      `INSERT INTO incoming_docs
       (document_type, document_tag, level, send_unit_id, title, summary, approval_number, reply_deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.document_type, data.document_tag, data.level, data.send_unit_id, data.title, data.summary,
        data.approval_number, data.reply_deadline, status,
      ]
    );
    const id = Number(result.lastInsertRowId);

    if (deptAssignments && deptAssignments.length > 0) {
      for (const da of deptAssignments) {
        await db.run(
          'INSERT INTO incoming_doc_departments (incoming_doc_id, department_id, role) VALUES (?, ?, ?)',
          [id, da.department_id, da.role]
        );
      }
    }

    await useIncomingStore.getState().loadDocs();
    return id;
  },

  updateDoc: async (id, data, deptAssignments) => {
    const sets: string[] = [];
    const vals: any[] = [];
    const fields: (keyof IncomingDoc)[] = [
      'document_type', 'document_tag', 'level', 'send_unit_id', 'title', 'summary',
      'approval_number', 'reply_deadline',
    ];
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${String(f)} = ?`);
        vals.push(data[f]);
      }
    }
    if (sets.length) {
      await db.run(
        `UPDATE incoming_docs SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        [...vals, id]
      );
    }

    if (deptAssignments !== undefined) {
      await db.run('DELETE FROM incoming_doc_departments WHERE incoming_doc_id = ?', [id]);
      for (const da of deptAssignments) {
        await db.run(
          'INSERT INTO incoming_doc_departments (incoming_doc_id, department_id, role) VALUES (?, ?, ?)',
          [id, da.department_id, da.role]
        );
      }
    }

    await useIncomingStore.getState().loadDocs();
  },

  removeDoc: async (id) => {
    await db.run('DELETE FROM incoming_docs WHERE id = ?', [id]);
    set((s) => ({ docs: s.docs.filter((d) => d.id !== id) }));
  },

  updateDocStatus: async (id, status) => {
    await db.run("UPDATE incoming_docs SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
    set((s) => ({
      docs: s.docs.map((d) => (d.id === id ? { ...d, status } : d)),
    }));
  },

  loadFiles: async (docId) => {
    const rows = await db.all<IncomingFile>(
      'SELECT * FROM incoming_files WHERE incoming_doc_id = ? ORDER BY id',
      [docId]
    );
    set({ files: rows });
  },

  addFile: async (docId, fileName, filePath) => {
    await db.run(
      'INSERT INTO incoming_files (incoming_doc_id, file_name, file_path) VALUES (?, ?, ?)',
      [docId, fileName, filePath]
    );
    await useIncomingStore.getState().loadFiles(docId);
  },

  removeFile: async (id) => {
    await db.run('DELETE FROM incoming_files WHERE id = ?', [id]);
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
  },
}));

export { roleLabels };
