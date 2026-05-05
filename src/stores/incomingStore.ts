import { create } from 'zustand';
import { db } from '@/db';
import * as XLSX from 'xlsx';

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
  document_number: string | null;
  security_level: string | null;
  handler: string | null;
  reviewer: string | null;
  reply_date: string | null;
  notes: string | null;
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

  loadDocs: (departmentId?: number, keyword?: string, dateRange?: [string, string], status?: string) => Promise<void>;
  generateApprovalNumber: () => Promise<string>;
  addDoc: (data: Partial<IncomingDoc>, deptAssignments?: { department_id: number; role: string }[]) => Promise<number>;
  updateDoc: (id: number, data: Partial<IncomingDoc>, deptAssignments?: { department_id: number; role: string }[]) => Promise<void>;
  removeDoc: (id: number) => Promise<void>;
  updateDocStatus: (id: number, status: string) => Promise<void>;
  batchReply: (ids: number[]) => Promise<void>;
  clearAll: () => Promise<void>;
  importFromExcel: (data: ArrayBuffer) => Promise<{ imported: number; skipped: number }>;
  exportToExcel: () => Promise<ArrayBuffer>;

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

  loadDocs: async (departmentId?: number, keyword?: string, dateRange?: [string, string], status?: string) => {
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
    if (status) {
      conditions.push('i.status = ?');
      params.push(status);
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
       (document_type, document_tag, level, send_unit_id, title, summary, approval_number, reply_deadline, status, document_number, security_level, handler, reviewer, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.document_type, data.document_tag, data.level, data.send_unit_id, data.title, data.summary,
        data.approval_number, data.reply_deadline, status,
        data.document_number, data.security_level, data.handler, data.reviewer,
        data.notes,
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
      'approval_number', 'reply_deadline', 'document_number', 'security_level',
      'handler', 'reviewer', 'notes',
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

  batchReply: async (ids) => {
    // Beijing time (UTC+8) formatted as YYYY-MM-DD HH:mm:ss
    const d = new Date();
    const bj = new Date(d.getTime() + 8 * 3600000);
    const now = bj.toISOString().replace('T', ' ').slice(0, 19);
    for (const id of ids) {
      await db.run(
        "UPDATE incoming_docs SET reply_date = ?, status = 'done', updated_at = datetime('now') WHERE id = ?",
        [now, id]
      );
    }
    set((s) => ({
      docs: s.docs.map((d) => ids.includes(d.id) ? { ...d, reply_date: now, status: 'done' } : d),
    }));
  },

  clearAll: async () => {
    await db.run('DELETE FROM incoming_doc_departments');
    await db.run('DELETE FROM incoming_files');
    await db.run('DELETE FROM incoming_docs');
    set({ docs: [], files: [] });
  },

  importFromExcel: async (data: ArrayBuffer) => {
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0]; // '收文' sheet
    const sheet = wb.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    // Skip title (row 0) and header (row 1)
    const dataRows = rows.slice(2).filter((r) => r.some((c) => String(c).trim()));

    // Load all units for name matching
    const allUnits = await db.all<{ id: number; name: string }>('SELECT id, name FROM units');

    const parseDateStr = (raw: string): string | null => {
      if (!raw) return null;
      // "1/4/26" or "1/4/2026"
      let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) {
        let y = parseInt(m[3]);
        if (y < 100) y += 2000;
        return `${y}-${String(parseInt(m[1])).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`;
      }
      // "1.5" or "1.12" (month.day)
      m = raw.match(/^(\d{1,2})\.(\d{1,2})$/);
      if (m) {
        return `2026-${String(parseInt(m[1])).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`;
      }
      // "1月8日上午" or "1月12日"
      m = raw.match(/^(\d{1,2})月(\d{1,2})日/);
      if (m) {
        return `2026-${String(parseInt(m[1])).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`;
      }
      // "1 月 16 日"
      m = raw.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
      if (m) {
        return `2026-${String(parseInt(m[1])).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`;
      }
      return raw; // Keep as-is if unparseable
    };

    let imported = 0;
    let skipped = 0;

    for (const row of dataRows) {
      const title = String(row[2] || '').trim();
      const unitName = String(row[3] || '').trim();
      const replyDeadlineRaw = String(row[4] || '').trim();
      const notes = String(row[5] || '').trim();

      if (!title) {
        skipped++;
        continue;
      }

      const replyDeadline = parseDateStr(replyDeadlineRaw);

      // Match unit by name with progressively looser fallbacks
      let sendUnitId: number | null = null;
      if (unitName) {
        const matchUnit = (name: string): typeof allUnits[0] | undefined => {
          // 1. Exact match
          let u = allUnits.find((x) => x.name === name);
          if (u) return u;
          // 2. Strip 镇/市 prefix from Excel name and retry
          const stripped = name.replace(/^[镇市]/, '');
          u = allUnits.find((x) => x.name === stripped);
          if (u) return u;
          // 3. Add 镇/市 prefix and retry
          u = allUnits.find((x) => x.name === '镇' + name || x.name === '市' + name);
          if (u) return u;
          // 4. DB name contains Excel name (min 3 chars to avoid false matches)
          if (name.length >= 3) {
            u = allUnits.find((x) => x.name.includes(name));
            if (u) return u;
          }
          // 5. Excel name contains DB name (min 3 chars)
          u = allUnits.find((x) => x.name.length >= 3 && name.includes(x.name));
          if (u) return u;
          return undefined;
        };
        const unit = matchUnit(unitName);
        if (unit) sendUnitId = unit.id;
      }

      await db.run(
        `INSERT INTO incoming_docs (title, send_unit_id, reply_deadline, notes, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [title, sendUnitId, replyDeadline, notes || null]
      );
      imported++;
    }

    await useIncomingStore.getState().loadDocs();
    return { imported, skipped };
  },

  exportToExcel: async () => {
    const rows = await db.all<IncomingDoc & { send_unit_name?: string; dept_text?: string }>(
      `SELECT i.*, u.name as send_unit_name
       FROM incoming_docs i
       LEFT JOIN units u ON i.send_unit_id = u.id
       ORDER BY i.created_at ASC`
    );

    // Build dept text for each doc
    const docIds = rows.map((r) => r.id);
    if (docIds.length > 0) {
      const deptRows = await db.all<{ incoming_doc_id: number; department_name: string; role: string }>(
        `SELECT idd.incoming_doc_id, d.name as department_name, idd.role
         FROM incoming_doc_departments idd
         LEFT JOIN departments d ON idd.department_id = d.id
         WHERE idd.incoming_doc_id IN (${docIds.map(() => '?').join(',')})`,
        docIds
      );
      const deptMap = new Map<number, string[]>();
      for (const dr of deptRows) {
        const list = deptMap.get(dr.incoming_doc_id) || [];
        list.push(`${dr.department_name || ''}(${roleLabels[dr.role] || dr.role})`);
        deptMap.set(dr.incoming_doc_id, list);
      }
      for (const row of rows) {
        (row as any).dept_text = (deptMap.get(row.id) || []).join('、');
      }
    }

    const titleRow = ['2026年收文记录', '', '', '', '', '', '', ''];
    const headerRow = ['收文日期', '文件类型', '文件名称', '来文单位', '回文日期（字体加粗为已办理，红色字体为已回复）', '备注', '文件', '流转股室'];
    const excelRows: any[][] = [titleRow, headerRow];

    for (const row of rows) {
      let createdDate = '';
      if (row.created_at) {
        const d = row.created_at.split(' ')[0];
        const parts = d.split('-');
        if (parts.length === 3) {
          createdDate = `${parseInt(parts[1])}/${parseInt(parts[2])}/${parts[0].slice(2)}`;
        } else {
          createdDate = d;
        }
      }

      excelRows.push([
        createdDate,
        row.document_type || '',
        row.title,
        row.send_unit_name || '',
        row.reply_deadline || '',
        row.notes || '',
        '',
        (row as any).dept_text || '',
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Merge title row
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];

    // Set column widths
    ws['!cols'] = [
      { wch: 12 },  // 收文日期
      { wch: 14 },  // 文件类型
      { wch: 50 },  // 文件名称
      { wch: 30 },  // 来文单位
      { wch: 20 },  // 回文日期
      { wch: 30 },  // 备注
      { wch: 10 },  // 文件
      { wch: 30 },  // 流转股室
    ];

    // Apply red font for rows with reply_date set (row 0=title, 1=header, data starts at row 2)
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].reply_date) {
        const rowIdx = i + 2;
        for (let c = 0; c < 8; c++) {
          const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
          if (ws[addr]) {
            ws[addr].s = { font: { color: { rgb: 'FF0000' } } };
          }
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '收文');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
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
