import { create } from 'zustand';
import { db } from '@/db';

export interface ArchiveBox {
  id: number;
  box_number: string;
  box_type: string;
  created_at: string;
}

export interface ArchiveRecord {
  id: number;
  archive_box_id: number;
  box_number?: string;
  box_type?: string;
  archive_number: number | null;
  doc_type: string;
  doc_id: number;
  doc_title?: string;
  reply_date: string | null;
  created_at: string;
}

interface ArchiveState {
  boxes: ArchiveBox[];
  records: ArchiveRecord[];

  loadBoxes: () => Promise<void>;
  addBox: (boxNumber: string, boxType: string) => Promise<void>;
  removeBox: (id: number) => Promise<void>;

  loadRecords: (boxId?: number) => Promise<void>;
  addRecord: (data: Partial<ArchiveRecord>) => Promise<void>;
  removeRecord: (id: number) => Promise<void>;
}

export const useArchiveStore = create<ArchiveState>((set) => ({
  boxes: [],
  records: [],

  loadBoxes: async () => {
    const rows = await db.all<ArchiveBox>('SELECT * FROM archive_boxes ORDER BY id');
    set({ boxes: rows });
  },

  addBox: async (boxNumber, boxType) => {
    await db.run(
      'INSERT INTO archive_boxes (box_number, box_type) VALUES (?, ?)',
      [boxNumber, boxType]
    );
    await useArchiveStore.getState().loadBoxes();
  },

  removeBox: async (id) => {
    await db.run('DELETE FROM archive_boxes WHERE id = ?', [id]);
    set((s) => ({ boxes: s.boxes.filter((b) => b.id !== id) }));
  },

  loadRecords: async (boxId?: number) => {
    let sql = `
      SELECT ar.*, ab.box_number, ab.box_type,
        CASE
          WHEN ar.doc_type = 'incoming' THEN (SELECT title FROM incoming_docs WHERE id = ar.doc_id)
          WHEN ar.doc_type = 'reply' THEN (SELECT title FROM incoming_docs WHERE id = ar.doc_id)
          WHEN ar.doc_type = 'outgoing' THEN (SELECT title FROM outgoing_docs WHERE id = ar.doc_id)
        END as doc_title
      FROM archive_records ar
      LEFT JOIN archive_boxes ab ON ar.archive_box_id = ab.id
    `;
    const params: any[] = [];
    if (boxId) {
      sql += ' WHERE ar.archive_box_id = ?';
      params.push(boxId);
    }
    sql += ' ORDER BY ar.id DESC';
    const rows = await db.all<ArchiveRecord>(sql, params);
    set({ records: rows });
  },

  addRecord: async (data) => {
    await db.run(
      `INSERT INTO archive_records (archive_box_id, archive_number, doc_type, doc_id, reply_date)
       VALUES (?, ?, ?, ?, ?)`,
      [data.archive_box_id, data.archive_number, data.doc_type, data.doc_id, data.reply_date]
    );
    await useArchiveStore.getState().loadRecords(data.archive_box_id);
  },

  removeRecord: async (id) => {
    await db.run('DELETE FROM archive_records WHERE id = ?', [id]);
    set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
  },
}));
