import { create } from 'zustand';
import { db } from '@/db';
import * as XLSX from 'xlsx';

export interface Meeting {
  id: number;
  subject: string;
  meeting_time: string | null;
  meeting_time_end: string | null;
  location: string | null;
  notification_template: string | null;
  notes: string | null;
  leaders: string | null;
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
参会领导：{{参会领导}}
参会人员：{{参会人员}}

请各位参会人员准时参加。`;

interface MeetingState {
  meetings: Meeting[];
  attendees: MeetingAttendee[];
  files: MeetingFile[];

  loadMeetings: (keyword?: string, dateRange?: [string, string], year?: number) => Promise<void>;
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

  clearAll: () => Promise<void>;
  importFromExcel: (data: ArrayBuffer, year?: number) => Promise<{ imported: number; skipped: number }>;
  exportToExcel: (year?: number) => Promise<ArrayBuffer>;
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

  loadMeetings: async (keyword?: string, dateRange?: [string, string], year?: number) => {
    let sql = 'SELECT * FROM meetings';
    const params: any[] = [];
    const conditions: string[] = [];

    if (year) {
      conditions.push("strftime('%Y', meeting_time) = ?");
      params.push(String(year));
    }
    if (keyword) {
      conditions.push('subject LIKE ?');
      params.push(`%${keyword}%`);
    }
    if (dateRange) {
      conditions.push('meeting_time >= ? AND meeting_time <= ?');
      params.push(dateRange[0], `${dateRange[1]} 23:59:59`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY DATE(meeting_time) DESC, TIME(meeting_time) ASC';
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
      `INSERT INTO meetings (subject, meeting_time, meeting_time_end, location, notification_template, notes, leaders)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.subject, data.meeting_time, data.meeting_time_end || null, data.location, data.notification_template || defaultTemplate, data.notes, data.leaders || null]
    );
    await useMeetingStore.getState().loadMeetings();
    return Number(result.lastInsertRowId);
  },

  updateMeeting: async (id, data) => {
    const sets: string[] = [];
    const vals: any[] = [];
    const fields: (keyof Meeting)[] = ['subject', 'meeting_time', 'meeting_time_end', 'location', 'notification_template', 'notes', 'leaders'];
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

  clearAll: async () => {
    await db.run('DELETE FROM meeting_files');
    await db.run('DELETE FROM meeting_attendees');
    await db.run('DELETE FROM meetings');
    set({ meetings: [], attendees: [], files: [] });
  },

  importFromExcel: async (data: ArrayBuffer, importYear?: number) => {
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

    // Skip title row (row 0) and header row (row 1), then skip empty rows
    const dataRows = rows.slice(2).filter((r) => r.some((c) => String(c).trim()));

    const defaultYear = importYear || new Date().getFullYear();

    // Try to pull a clean date substring from mixed text like "2026-04-24 9:00、10:00"
    const extractDateText = (raw: string): string => {
      // Try common date patterns, pick the first match
      const patterns = [
        /(\d{4}-\d{1,2}-\d{1,2})/,        // 2026-04-24
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/,     // 1/6/26 or 1/6/2026
        /(\d{4}年\d{1,2}月\d{1,2}日)/,     // 2026年4月24日
        /(\d{1,2}月\d{1,2}日)/,            // 4月24日
        /(\d{4}\.\d{1,2}\.\d{1,2})/,       // 2026.04.24
      ];
      for (const p of patterns) {
        const m = raw.match(p);
        if (m) return m[1];
      }
      return raw;
    };

    // Parse a date string in various formats to { year, month, day }
    const parseDateStr = (raw: string): { year: number; month: number; day: number } | null => {
      if (!raw) return null;

      // "1/6/26" or "1/6/2026" or "01/06/2026"
      let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (m) {
        let y = parseInt(m[3]);
        if (y < 100) y += 2000;
        return { year: y, month: parseInt(m[1]), day: parseInt(m[2]) };
      }

      // "2026-01-06" or "2026-1-6"
      m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        return { year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) };
      }

      // "1月6日" (Chinese, without year)
      m = raw.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (m) {
        return { year: defaultYear, month: parseInt(m[1]), day: parseInt(m[2]) };
      }

      // "2026年1月6日" (Chinese, with year)
      m = raw.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
      if (m) {
        return { year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) };
      }

      // "2026.01.06" or "2026.1.6"
      m = raw.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
      if (m) {
        return { year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]) };
      }

      // Excel serial date number (in case raw:false didn't format it)
      if (/^\d{5}$/.test(raw)) {
        const n = parseInt(raw);
        if (n >= 40000 && n <= 60000) {
          // Excel date serial to date (epoch 1900-01-01, with leap year bug)
          const excelEpoch = new Date(1899, 11, 30);
          const jsDate = new Date(excelEpoch.getTime() + n * 86400000);
          return { year: jsDate.getFullYear(), month: jsDate.getMonth() + 1, day: jsDate.getDate() };
        }
      }

      return null;
    };

    // Build datetime string from parsed date and time; if time can't be parsed, return raw combined text
    const isValidTime = (t: string): boolean => /^\d{1,2}:\d{2}$/.test(t);
    const buildDateTime = (dateParts: { year: number; month: number; day: number }, timeStr: string): string | null => {
      if (!timeStr) return null;
      if (!isValidTime(timeStr)) {
        // Time is unparseable — keep as raw text
        return `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')} ${timeStr}`;
      }
      const timeParts = timeStr.split(':');
      const hour = timeParts[0].padStart(2, '0');
      const minute = timeParts[1] || '00';
      return `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')} ${hour}:${minute}`;
    };

    let imported = 0;
    let skipped = 0;
    let lastParsedDate: { year: number; month: number; day: number } | null = null;

    for (const row of dataRows) {
      const dateVal = String(row[0] || '').trim();
      const timeVal = String(row[1] || '').trim();
      const subject = String(row[2] || '').trim().replace(/\n/g, '');
      const location = String(row[3] || '').trim();
      const attendeesRaw = String(row[4] || '').trim();
      const notes = String(row[5] || '').trim();
      const leaders = String(row[6] || '').trim();

      if (!subject) {
        skipped++;
        continue;
      }

      // Parse time from time column only: "15:00-16:30", "15:00~16:30", "15:00、16:30", or single "15:00"
      const parseTimeRange = (raw: string): { start: string; end: string } => {
        if (!raw) return { start: '', end: '' };
        const m = raw.match(/^([\d:]+)\s*[-~～、]\s*([\d:]+)$/);
        if (m) return { start: m[1], end: m[2] };
        // Not a time range — return raw as-is, it'll be kept verbatim later
        return { start: raw, end: '' };
      };

      const timeRange = parseTimeRange(timeVal);
      const startTime = timeRange.start;
      const endTime = timeRange.end;

      // Parse date from date column only; carry forward if empty;
      // if can't parse, store raw text directly (don't mix with time column)
      let meetingTime: string | null = null;
      let meetingTimeEnd: string | null = null;

      if (dateVal) {
        // Extract clean date text first (e.g. "2026-04-24" from "2026-04-24 9:00、10:00")
        const cleanDate = extractDateText(dateVal);
        const parsed = parseDateStr(cleanDate);
        if (parsed) {
          lastParsedDate = parsed;
          meetingTime = buildDateTime(parsed, startTime);
          if (endTime) meetingTimeEnd = buildDateTime(parsed, endTime);
        } else {
          // Unparseable date — store raw date text only
          meetingTime = dateVal;
        }
      } else if (lastParsedDate) {
        meetingTime = buildDateTime(lastParsedDate, startTime);
        if (endTime) meetingTimeEnd = buildDateTime(lastParsedDate, endTime);
      }

      // Parse attendee names (split by newline)
      const attendeeNames = attendeesRaw
        ? attendeesRaw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
        : [];

      const insertResult = await db.run(
        `INSERT INTO meetings (subject, meeting_time, meeting_time_end, location, notes, leaders)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [subject, meetingTime, meetingTimeEnd, location || null, notes || null, leaders || null]
      );
      const meetingId = insertResult.lastInsertRowId;

      // Try to match attendee names to contacts
      if (meetingId && attendeeNames.length > 0) {
        for (const name of attendeeNames) {
          const contact = await db.get<{ id: number }>(
            'SELECT id FROM contacts WHERE name = ? OR alias = ?',
            [name, name]
          );
          if (contact) {
            await db.run(
              'INSERT OR IGNORE INTO meeting_attendees (meeting_id, contact_id) VALUES (?, ?)',
              [meetingId, contact.id]
            );
          }
        }
      }
      imported++;
    }

    await useMeetingStore.getState().loadMeetings();
    return { imported, skipped };
  },

  exportToExcel: async (year?: number) => {
    let sql = `SELECT m.*, GROUP_CONCAT(c.name, '\n') as attendees_str
       FROM meetings m
       LEFT JOIN meeting_attendees ma ON m.id = ma.meeting_id
       LEFT JOIN contacts c ON ma.contact_id = c.id`;
    const params: any[] = [];

    if (year) {
      sql += " WHERE strftime('%Y', m.meeting_time) = ?";
      params.push(String(year));
    }

    sql += ' GROUP BY m.id ORDER BY m.meeting_time ASC';

    const rows = await db.all<Meeting & { attendees_str?: string }>(sql, params);

    const headerRow = ['日期', '时间', '会议议题', '会议地点', '参会人员', '备注', '参会领导'];
    const exportYear = year || new Date().getFullYear();
    const titleRow = [`${exportYear}年会议安排表`, '', '', '', '', '', ''];
    const excelRows: string[][] = [titleRow, headerRow];

    for (const row of rows) {
      const dt = row.meeting_time ? row.meeting_time : '';
      let dateStr = '';
      let timeStr = '';
      if (dt) {
        const parts = dt.split(' ');
        const d = parts[0];
        const t = parts.slice(1).join(' ');
        const dateParts = d.split('-');
        if (dateParts.length === 3) {
          dateStr = `${parseInt(dateParts[1])}月${parseInt(dateParts[2])}日`;
          timeStr = t ? t.slice(0, 5) : '';
        } else {
          // Unparseable date — show raw text as date, leave time column for raw time part
          dateStr = dt;
        }
      }
      // Append end time if present
      if (row.meeting_time_end) {
        const endParts = row.meeting_time_end.split(' ');
        if (endParts.length >= 2) {
          const endT = endParts[1];
          if (endT) {
            timeStr = timeStr ? `${timeStr}-${endT.slice(0, 5)}` : endT.slice(0, 5);
          }
        }
      }
      excelRows.push([
        dateStr,
        timeStr,
        row.subject,
        row.location || '',
        row.attendees_str || '',
        row.notes || '',
        row.leaders || '',
      ]);
    }

    // Group same-date rows: merge date cells in Excel
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // title row
    ];
    let mergeStart = 2; // first data row is row 2 (0=title, 1=header)
    for (let i = 3; i < excelRows.length; i++) {
      if (excelRows[i][0] === excelRows[i - 1][0]) {
        excelRows[i][0] = '';
      } else {
        if (mergeStart < i - 1) {
          merges.push({ s: { r: mergeStart, c: 0 }, e: { r: i - 1, c: 0 } });
        }
        mergeStart = i;
      }
    }
    if (mergeStart < excelRows.length - 1) {
      merges.push({ s: { r: mergeStart, c: 0 }, e: { r: excelRows.length - 1, c: 0 } });
    }

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Apply merges (title row + date groups)
    ws['!merges'] = merges;

    // Set column widths to match original
    ws['!cols'] = [
      { wch: 10 },  // 日期
      { wch: 10 },  // 时间
      { wch: 45 },  // 会议议题
      { wch: 30 },  // 会议地点
      { wch: 25 },  // 参会人员
      { wch: 30 },  // 备注
      { wch: 25 },  // 参会领导
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '会议安排');

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  },
}));
