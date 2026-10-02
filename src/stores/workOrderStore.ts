import { create } from 'zustand';
import * as XLSX from 'xlsx';
import { db } from '@/db';
import { useIncomingStore } from '@/stores/incomingStore';
import { useHandlerStore } from '@/stores/handlerStore';

/** 工单生成的收文里固定的主办股室与来文单位 */
export const WORK_ORDER_LEAD_DEPT = '信访维稳与宅基地审批小组';
export const WORK_ORDER_SEND_UNIT = '镇政务服务中心';

export interface WorkOrder {
  id: number;
  order_no: string | null;
  accept_time: string | null;
  deadline: string | null;
  citizen_name: string | null;
  contact_phone: string | null;
  caller_phone: string | null;
  title: string | null;
  subject: string | null;
  location: string | null;
  form_content: string | null;
  appeal: string | null;
  source: string | null;
  urgency: string | null;
  order_type: string | null;
  accept_dept: string | null;
  category: string | null;
  business_point: string | null;
  status: string;
  is_duplicate: number;
  duplicate_ref_id: number | null;
  created_at: string;
  updated_at: string;
}

export const workOrderStatusMap: Record<string, { color: string; text: string }> = {
  processing: { color: 'blue', text: '处理中' },
  closed: { color: 'green', text: '已办结' },
  returned: { color: 'red', text: '已退单' },
  suspended: { color: 'orange', text: '已挂起' },
};

export interface WorkOrderFilters {
  dateRange?: [string, string];
  /** 日期区间作用于哪个字段：登记时间（默认）或处理期限 */
  dateField?: 'created_at' | 'deadline';
  status?: string;
  duplicate?: 'all' | 'only' | 'none';
  keyword?: string;
}

export interface ParsedOrder {
  filePath: string;
  data: Partial<WorkOrder>;
}

export interface DuplicatedOrder extends ParsedOrder {
  existing: WorkOrder;
}

/** 拟办单里的标签 → 数据库字段 */
const LABEL_FIELD_MAP: Record<string, keyof WorkOrder> = {
  '工单编号': 'order_no',
  '受理时间': 'accept_time',
  '处理期限': 'deadline',
  '市民称呼': 'citizen_name',
  '联系电话': 'contact_phone',
  '来电电话': 'caller_phone',
  '诉求标题': 'title',
  '涉事主体': 'subject',
  '事发地点': 'location',
  '表单内容': 'form_content',
  '市民诉求': 'appeal',
  '诉求来源': 'source',
  '紧急程度': 'urgency',
  '工单类型': 'order_type',
  '受理部门': 'accept_dept',
  '事项分类': 'category',
  '业务点选': 'business_point',
};

/** 空值、`*`、`***` 这类掩码值不参与重复判定与统计 */
export function isUsableContactValue(value?: string | null): boolean {
  const text = (value || '').trim();
  return text.length > 0 && !/^\*+$/.test(text);
}

/** 统一换行符（Excel 单元格里常用单独的 \r） */
function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

/** 解析「诉求拟办单」：A/B、C/D 两列成对的标签-值 */
export function parseWorkOrderExcel(data: ArrayBuffer): Partial<WorkOrder> {
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return {};
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const result: Record<string, string> = {};
  for (const row of rows) {
    const pairs: [string, string][] = [
      [String(row[0] ?? '').trim(), normalizeNewlines(String(row[1] ?? ''))],
      [String(row[2] ?? '').trim(), normalizeNewlines(String(row[3] ?? ''))],
    ];
    for (const [label, value] of pairs) {
      if (!label || !value) continue;
      const field = LABEL_FIELD_MAP[label];
      if (!field || result[field]) continue;
      result[field] = value;
    }
  }
  return result as Partial<WorkOrder>;
}

/** 找一条命中「称呼或电话相同」的已有工单 */
async function findDuplicateId(data: Partial<WorkOrder>, excludeId?: number): Promise<number | null> {
  const conditions: string[] = [];
  const params: any[] = [excludeId ?? -1];

  if (isUsableContactValue(data.citizen_name)) {
    conditions.push('TRIM(citizen_name) = ?');
    params.push(data.citizen_name!.trim());
  }
  for (const phone of [data.contact_phone, data.caller_phone]) {
    if (isUsableContactValue(phone)) {
      conditions.push('(TRIM(contact_phone) = ? OR TRIM(caller_phone) = ?)');
      params.push(phone!.trim(), phone!.trim());
    }
  }
  if (conditions.length === 0) return null;

  const rows = await db.all<{ id: number }>(
    `SELECT id FROM work_orders WHERE id != ? AND (${conditions.join(' OR ')}) ORDER BY id LIMIT 1`,
    params
  );
  return rows[0]?.id ?? null;
}

function buildWhere(filters: WorkOrderFilters) {
  const conditions: string[] = [];
  const params: any[] = [];
  if (filters.dateRange) {
    const column = filters.dateField === 'deadline' ? 'deadline' : 'created_at';
    conditions.push(`DATE(${column}) >= DATE(?) AND DATE(${column}) <= DATE(?)`);
    params.push(filters.dateRange[0], filters.dateRange[1]);
  }
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.duplicate === 'only') conditions.push('is_duplicate = 1');
  if (filters.duplicate === 'none') conditions.push('is_duplicate = 0');
  if (filters.keyword) {
    conditions.push(
      '(order_no LIKE ? OR title LIKE ? OR citizen_name LIKE ? OR contact_phone LIKE ? OR caller_phone LIKE ?)'
    );
    const like = `%${filters.keyword}%`;
    params.push(like, like, like, like, like);
  }
  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

/** 「2026-09-22」→「9月22日」 */
function formatChineseDate(value?: string | null): string | null {
  const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec((value || '').trim());
  if (!matched) return null;
  return `${Number(matched[2])}月${Number(matched[3])}日`;
}

/** 往前推一个工作日（跳过周六、周日），用于生成收文的回复期限 */
export function previousWorkday(value?: string | null): string | null {
  const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec((value || '').trim());
  if (!matched) return null;
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  if (Number.isNaN(date.getTime())) return null;
  do {
    date.setDate(date.getDate() - 1);
  } while (date.getDay() === 0 || date.getDay() === 6);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function ensureUnitId(name: string): Promise<number> {
  const rows = await db.all<{ id: number }>('SELECT id FROM units WHERE name = ?', [name]);
  if (rows[0]) return rows[0].id;
  await db.run('INSERT INTO units (name) VALUES (?)', [name]);
  const created = await db.all<{ id: number }>('SELECT id FROM units WHERE name = ?', [name]);
  return created[0].id;
}

interface WorkOrderState {
  orders: WorkOrder[];
  statsRows: WorkOrder[];
  /** 已经生成过收文的工单 id */
  linkedOrderIds: number[];
  loading: boolean;

  loadOrders: (filters?: WorkOrderFilters) => Promise<void>;
  /** 统计取数，可按登记时间或处理期限的区间过滤 */
  loadStats: (options?: { dateRange?: [string, string]; dateField?: 'created_at' | 'deadline' }) => Promise<void>;
  loadLinkedOrderIds: () => Promise<void>;
  addOrder: (data: Partial<WorkOrder>) => Promise<number>;
  updateOrder: (id: number, data: Partial<WorkOrder>) => Promise<void>;
  updateOrderStatus: (id: number, status: string) => Promise<void>;
  removeOrder: (id: number) => Promise<void>;
  createLinkedIncoming: (
    order: WorkOrder,
    assistDepartmentIds: number[]
  ) => Promise<{ ok: boolean; message?: string; docId?: number }>;
  parseImportFiles: (
    files: { filePath: string; data: ArrayBuffer }[]
  ) => Promise<{ fresh: ParsedOrder[]; duplicated: DuplicatedOrder[]; skipped: number }>;
  /** 返回新建工单的精简信息，供随后逐个生成关联收文 */
  insertOrders: (items: ParsedOrder[]) => Promise<WorkOrder[]>;
}

export const useWorkOrderStore = create<WorkOrderState>((set) => ({
  orders: [],
  statsRows: [],
  linkedOrderIds: [],
  loading: false,

  loadOrders: async (filters = {}) => {
    set({ loading: true });
    const { sql, params } = buildWhere(filters);
    const rows = await db.all<WorkOrder>(
      `SELECT * FROM work_orders ${sql} ORDER BY datetime(created_at) DESC, id DESC`,
      params
    );
    set({ orders: rows, loading: false });
  },

  loadStats: async (options = {}) => {
    const { sql, params } = buildWhere({ dateRange: options.dateRange, dateField: options.dateField });
    const rows = await db.all<WorkOrder>(`SELECT * FROM work_orders ${sql} ORDER BY id`, params);
    set({ statsRows: rows });
  },

  loadLinkedOrderIds: async () => {
    const rows = await db.all<{ work_order_id: number }>(
      'SELECT work_order_id FROM incoming_docs WHERE work_order_id IS NOT NULL'
    );
    set({ linkedOrderIds: rows.map((r) => r.work_order_id) });
  },

  addOrder: async (data) => {
    const refId = await findDuplicateId(data);
    const result = await db.run(
      `INSERT INTO work_orders
        (order_no, accept_time, deadline, citizen_name, contact_phone, caller_phone, title, subject,
         location, form_content, appeal, source, urgency, order_type, accept_dept, category,
         business_point, status, is_duplicate, duplicate_ref_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
      [
        data.order_no ?? null, data.accept_time ?? null, data.deadline ?? null,
        data.citizen_name ?? null, data.contact_phone ?? null, data.caller_phone ?? null,
        data.title ?? null, data.subject ?? null, data.location ?? null,
        data.form_content ?? null, data.appeal ?? null, data.source ?? null,
        data.urgency ?? null, data.order_type ?? null, data.accept_dept ?? null,
        data.category ?? null, data.business_point ?? null,
        data.status || 'processing', refId ? 1 : 0, refId,
      ]
    );
    await useWorkOrderStore.getState().loadOrders();
    return Number(result.lastInsertRowId);
  },

  updateOrder: async (id, data) => {
    const refId = await findDuplicateId(data, id);
    await db.run(
      `UPDATE work_orders SET
        order_no = ?, accept_time = ?, deadline = ?, citizen_name = ?, contact_phone = ?,
        caller_phone = ?, title = ?, subject = ?, location = ?, form_content = ?, appeal = ?,
        source = ?, urgency = ?, order_type = ?, accept_dept = ?, category = ?,
        business_point = ?, status = ?, is_duplicate = ?, duplicate_ref_id = ?,
        updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [
        data.order_no ?? null, data.accept_time ?? null, data.deadline ?? null,
        data.citizen_name ?? null, data.contact_phone ?? null, data.caller_phone ?? null,
        data.title ?? null, data.subject ?? null, data.location ?? null,
        data.form_content ?? null, data.appeal ?? null, data.source ?? null,
        data.urgency ?? null, data.order_type ?? null, data.accept_dept ?? null,
        data.category ?? null, data.business_point ?? null,
        data.status || 'processing', refId ? 1 : 0, refId, id,
      ]
    );
    await useWorkOrderStore.getState().loadOrders();
  },

  updateOrderStatus: async (id, status) => {
    await db.run("UPDATE work_orders SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [status, id]);
    set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)) }));
  },

  createLinkedIncoming: async (order, assistDepartmentIds) => {
    const leadRows = await db.all<{ id: number; name: string; receiver: string | null }>(
      'SELECT id, name, receiver FROM departments WHERE name = ?',
      [WORK_ORDER_LEAD_DEPT]
    );
    const lead = leadRows[0];
    if (!lead) {
      return { ok: false, message: `未找到固定主办股室「${WORK_ORDER_LEAD_DEPT}」，请先在股室管理中新增` };
    }

    const assistIds = assistDepartmentIds.filter((id) => id !== lead.id);
    const assists = assistIds.length > 0
      ? await db.all<{ id: number; name: string; receiver: string | null }>(
          `SELECT id, name, receiver FROM departments WHERE id IN (${assistIds.map(() => '?').join(',')})
           ORDER BY sort_order, id`,
          assistIds
        )
      : [];

    const orderNo = (order.order_no || '').trim();
    const orderTitle = (order.title || '').trim();
    const docTitle = `热线工单${orderNo}${orderTitle ? `（${orderTitle}）` : ''}`;
    const deptClause = [`${lead.name}主办`, ...assists.map((d) => `${d.name}协办`)].join('，');
    const receivers = [
      ...new Set(
        [lead, ...assists]
          .flatMap((d) => (d.receiver || '').split(',').map((name) => name.trim()).filter(Boolean))
      ),
    ];
    // 按规定：收文的回复期限比工单处理期限提前一个工作日
    const replyDeadline = previousWorkday(order.deadline) ?? order.deadline ?? null;
    const deadlineCn = formatChineseDate(replyDeadline);

    let summary = `（${WORK_ORDER_SEND_UNIT}）【${docTitle}】转${deptClause}`;
    if (deadlineCn) summary += `，于${deadlineCn}前回复。`;
    if (receivers.length > 0) summary += receivers.map((name) => `@${name}`).join(' ');

    const sendUnitId = await ensureUnitId(WORK_ORDER_SEND_UNIT);
    const approvalNumber = await useIncomingStore.getState().generateApprovalNumber();
    const handler =
      useHandlerStore.getState().currentHandler || useHandlerStore.getState().defaultHandler || null;

    const docId = await useIncomingStore.getState().addDoc(
      {
        title: docTitle,
        summary,
        send_unit_id: sendUnitId,
        reply_deadline: replyDeadline,
        approval_number: approvalNumber,
        document_type: '镇府公文',
        handler,
      },
      [
        { department_id: lead.id, role: 'lead' },
        ...assists.map((d) => ({ department_id: d.id, role: 'assist' })),
      ]
    );

    await db.run('UPDATE incoming_docs SET work_order_id = ? WHERE id = ?', [order.id, docId]);
    await useWorkOrderStore.getState().loadLinkedOrderIds();
    return { ok: true, docId };
  },

  removeOrder: async (id) => {
    await db.run('DELETE FROM work_orders WHERE id = ?', [id]);
    set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }));
  },

  parseImportFiles: async (files) => {
    const existing = await db.all<WorkOrder>('SELECT * FROM work_orders');
    const byNo = new Map<string, WorkOrder>();
    existing.forEach((row) => {
      const no = (row.order_no || '').trim();
      if (no && !byNo.has(no)) byNo.set(no, row);
    });

    const fresh: ParsedOrder[] = [];
    const duplicated: DuplicatedOrder[] = [];
    let skipped = 0;

    for (const file of files) {
      let parsed: Partial<WorkOrder>;
      try {
        parsed = parseWorkOrderExcel(file.data);
      } catch {
        skipped++;
        continue;
      }
      // 完全没有识别到任何字段，视为无效文件
      if (Object.keys(parsed).length === 0) {
        skipped++;
        continue;
      }
      const no = (parsed.order_no || '').trim();
      const hit = no ? byNo.get(no) : undefined;
      if (hit) duplicated.push({ filePath: file.filePath, data: parsed, existing: hit });
      else fresh.push({ filePath: file.filePath, data: parsed });
    }

    return { fresh, duplicated, skipped };
  },

  insertOrders: async (items) => {
    if (items.length === 0) return [];
    await db.autoBackup();
    const created: WorkOrder[] = [];
    const insert = async (item: ParsedOrder) => {
      const refId = await findDuplicateId(item.data);
      const d = item.data;
      const result = await db.run(
        `INSERT INTO work_orders
          (order_no, accept_time, deadline, citizen_name, contact_phone, caller_phone, title, subject,
           location, form_content, appeal, source, urgency, order_type, accept_dept, category,
           business_point, status, is_duplicate, duplicate_ref_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))`,
        [
          d.order_no ?? null, d.accept_time ?? null, d.deadline ?? null,
          d.citizen_name ?? null, d.contact_phone ?? null, d.caller_phone ?? null,
          d.title ?? null, d.subject ?? null, d.location ?? null,
          d.form_content ?? null, d.appeal ?? null, d.source ?? null,
          d.urgency ?? null, d.order_type ?? null, d.accept_dept ?? null,
          d.category ?? null, d.business_point ?? null,
          d.status || 'processing', refId ? 1 : 0, refId,
        ]
      );
      created.push({
        id: Number(result.lastInsertRowId),
        order_no: d.order_no ?? null,
        title: d.title ?? null,
        deadline: d.deadline ?? null,
      } as WorkOrder);
    };
    for (const item of items) await insert(item);
    await useWorkOrderStore.getState().loadOrders();
    return created;
  },
}));
