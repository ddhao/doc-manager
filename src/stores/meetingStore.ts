import { create } from 'zustand';
import { db } from '@/db';

export interface Meeting {
  id: number;
  subject: string;
  meeting_time: string | null;
  location: string | null;
  notification_template: string | null;
  notes: string | null;
  attendees?: MeetingAttendee[];
  created_at: string;
  updated_at: string;
}

export interface MeetingAttendee {
  id: number;
  meeting_id: number;
  contact_id: number;
  contact_name?: string;
  contact_alias?: string;
  contact_title?: string;
  contact_phone?: string;
}

export interface MeetingFile {
  id: number;
  meeting_id: number;
  file_name: string;
  file_path: string;
}

const defaultTemplate = `会议通知

主题：{{主题}}
时间：{{时间}}
地点：{{地点}}
参会人员：{{参会人员}}

请各位参会人员准时参加。`;

interface MeetingState {
  meetings: Meeting[];
  attendees: MeetingAttendee[];
  files: MeetingFile[];

  loadMeetings: (keyword?: string, dateRange?: [string, string]) => Promise<void>;
  addMeeting: (data: Partial<Meeting>) => Promise<number>;
  updateMeeting: (id: number, data: Partial<Meeting>) => Promise<void>;
  removeMeeting: (id: number) => Promise<void>;

  loadAttendees: (meetingId: number) => Promise<void>;
  addAttendee: (meetingId: number, contactId: number) => Promise<void>;
  removeAttendee: (id: number) => Promise<void>;
  setAttendees: (meetingId: number, contactIds: number[]) => Promise<void>;

  loadFiles: (meetingId: number) => Promise<void>;
  addFile: (meetingId: number, fileName: string, filePath: string) => Promise<void>;
  removeFile: (id: number) => Promise<void>;
}

async function loadMeetingAttendees(meetingIds: number[]): Promise<Map<number, MeetingAttendee[]>> {
  const map = new Map<number, MeetingAttendee[]>();
  if (meetingIds.length === 0) return map;

  const rows = await db.all<MeetingAttendee & { meeting_id: number }>(
    `SELECT ma.*, c.name as contact_name, c.alias as contact_alias, c.title as contact_title, c.phone as contact_phone
     FROM meeting_attendees ma
     LEFT JOIN contacts c ON ma.contact_id = c.id
     WHERE ma.meeting_id IN (${meetingIds.map(() => '?').join(',')})`,
    meetingIds
  );

  for (const row of rows) {
    const list = map.get(row.meeting_id) || [];
    list.push({
      id: row.id,
      meeting_id: row.meeting_id,
      contact_id: row.contact_id,
      contact_name: row.contact_name,
      contact_alias: row.contact_alias,
      contact_title: row.contact_title,
      contact_phone: row.contact_phone,
    });
    map.set(row.meeting_id, list);
  }
  return map;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  meetings: [],
  attendees: [],
  files: [],

  loadMeetings: async (keyword?: string, dateRange?: [string, string]) => {
    let sql = 'SELECT * FROM meetings';
    const params: any[] = [];
    const conditions: string[] = [];

    if (keyword) {
      conditions.push('subject LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (dateRange) {
      conditions.push('created_at >= ? AND created_at <= ?');
      params.push(dateRange[0], `${dateRange[1]} 23:59:59`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY meeting_time DESC';
    const rows = await db.all<Meeting>(sql, params);

    const ids = rows.map((r) => r.id);
    const attendeeMap = await loadMeetingAttendees(ids);
    for (const row of rows) {
      row.attendees = attendeeMap.get(row.id) || [];
    }

    set({ meetings: rows });
  },

  addMeeting: async (data) => {
    const result = await db.run(
      `INSERT INTO meetings (subject, meeting_time, location, notification_template, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [data.subject, data.meeting_time, data.location, data.notification_template || defaultTemplate, data.notes]
    );
    await useMeetingStore.getState().loadMeetings();
    return Number(result.lastInsertRowId);
  },

  updateMeeting: async (id, data) => {
    const sets: string[] = [];
    const vals: any[] = [];
    const fields: (keyof Meeting)[] = ['subject', 'meeting_time', 'location', 'notification_template', 'notes'];
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${String(f)} = ?`);
        vals.push(data[f]);
      }
    }
    if (sets.length) {
      await db.run(
        `UPDATE meetings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        [...vals, id]
      );
      await useMeetingStore.getState().loadMeetings();
    }
  },

  removeMeeting: async (id) => {
    await db.run('DELETE FROM meetings WHERE id = ?', [id]);
    set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) }));
  },

  loadAttendees: async (meetingId) => {
    const rows = await db.all<MeetingAttendee>(
      `SELECT ma.*, c.name as contact_name, c.alias as contact_alias, c.title as contact_title, c.phone as contact_phone
       FROM meeting_attendees ma
       LEFT JOIN contacts c ON ma.contact_id = c.id
       WHERE ma.meeting_id = ?`,
      [meetingId]
    );
    set({ attendees: rows });
  },

  addAttendee: async (meetingId, contactId) => {
    await db.run(
      'INSERT OR IGNORE INTO meeting_attendees (meeting_id, contact_id) VALUES (?, ?)',
      [meetingId, contactId]
    );
    await useMeetingStore.getState().loadAttendees(meetingId);
  },

  removeAttendee: async (id) => {
    await db.run('DELETE FROM meeting_attendees WHERE id = ?', [id]);
    set((s) => ({ attendees: s.attendees.filter((a) => a.id !== id) }));
  },

  setAttendees: async (meetingId, contactIds) => {
    const database = db;
    await database.run('DELETE FROM meeting_attendees WHERE meeting_id = ?', [meetingId]);
    for (const contactId of contactIds) {
      await database.run(
        'INSERT OR IGNORE INTO meeting_attendees (meeting_id, contact_id) VALUES (?, ?)',
        [meetingId, contactId]
      );
    }
    const attendeeMap = await loadMeetingAttendees([meetingId]);
    set((s) => ({
      meetings: s.meetings.map((m) =>
        m.id === meetingId ? { ...m, attendees: attendeeMap.get(meetingId) || [] } : m
      ),
      attendees: attendeeMap.get(meetingId) || [],
    }));
  },

  loadFiles: async (meetingId) => {
    const rows = await db.all<MeetingFile>(
      'SELECT * FROM meeting_files WHERE meeting_id = ? ORDER BY id',
      [meetingId]
    );
    set({ files: rows });
  },

  addFile: async (meetingId, fileName, filePath) => {
    await db.run(
      'INSERT INTO meeting_files (meeting_id, file_name, file_path) VALUES (?, ?, ?)',
      [meetingId, fileName, filePath]
    );
    await useMeetingStore.getState().loadFiles(meetingId);
  },

  removeFile: async (id) => {
    await db.run('DELETE FROM meeting_files WHERE id = ?', [id]);
    set((s) => ({ files: s.files.filter((f) => f.id !== id) }));
  },
}));
