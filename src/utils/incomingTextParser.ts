/**
 * 收文「智能登记」文字解析：从一段公文文字里识别来文单位、转发股室、标题、回复日期与摘要。
 * 纯 TypeScript 实现，不依赖 React / DOM，便于离线验证。
 */

export interface NameItem {
  id: number;
  name: string;
}

export interface ParsedDeptAssignment {
  department_id: number;
  role: string;
}

export interface ParsedIncomingText {
  /** 最后一个【…】的内容 */
  title: string | null;
  /** 模糊匹配到的来文单位 */
  send_unit_id: number | null;
  send_unit_name: string | null;
  /** YYYY-MM-DD */
  reply_deadline: string | null;
  /** 转发短语之后的剩余文字（含日期、交办说明与 @人名） */
  summary: string | null;
  assignments: ParsedDeptAssignment[];
  /** 未匹配到单位时，从第一个（）里取出的候选单位名，交由界面确认是否新增 */
  unitCandidate: string | null;
  /** 未识别到的字段名 */
  warnings: string[];
}

export const SCORE_THRESHOLD = 0.7;

const ROLE_WORDS: { word: string; role: string }[] = [
  { word: '主办', role: 'lead' },
  { word: '协办', role: 'assist' },
  { word: '汇总', role: 'summary' },
  { word: '阅办', role: 'read_handle' },
  { word: '阅知', role: 'read_notify' },
];

const DEFAULT_ROLE = 'read_handle';

/** 「各股室/所有股室/各办」这类泛称 */
const ALL_DEPT_RE = /(各|所有|全部)(股室|科室|办)/;

const DATE_CN_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/;
const DATE_NUM_RE = /(\d{1,2})\s*[\/.]\s*(\d{1,2})(?!\d)/;

/** 去掉结尾的句号（如「于9月30日回复。」→「于9月30日回复」） */
export function stripTrailingPeriod(text: string): string {
  let out = (text || '').trim();
  while (out.endsWith('。')) out = out.slice(0, -1).trim();
  return out;
}

/** 去掉 [太阳] 这类标记、emoji 与多余空白 */
export function stripNoise(input: string): string {
  if (!input) return '';
  return input
    .replace(/\[[^\[\]\n]{1,12}\]/g, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u20E3]/gu, '')
    .replace(/[\u200B-\u200F\uFEFF]/g, '')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** 匹配用归一化：去掉空白、标点与符号 */
function normalizeForMatch(s: string): string {
  return s.replace(/[\s\p{P}\p{S}_]/gu, '').toLowerCase();
}

function bigramCounts(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + 1 < s.length; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

function sumValues(m: Map<string, number>): number {
  let total = 0;
  for (const v of m.values()) total += v;
  return total;
}

/** 字符二元组 Dice 系数 */
export function diceBigram(a: string, b: string): number {
  const x = normalizeForMatch(a);
  const y = normalizeForMatch(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ax = bigramCounts(x);
  const by = bigramCounts(y);
  if (ax.size === 0 || by.size === 0) return 0;
  let inter = 0;
  for (const [g, c] of ax) {
    const d = by.get(g);
    if (d) inter += Math.min(c, d);
  }
  return (2 * inter) / (sumValues(ax) + sumValues(by));
}

export interface TextMatch {
  score: number;
  index: number;
}

/** 在文字中为某个名称找最相似的窗口（完全包含记 1.0） */
export function bestMatch(name: string, text: string): TextMatch {
  if (!name || !text) return { score: 0, index: -1 };
  const direct = text.indexOf(name);
  if (direct >= 0) return { score: 1, index: direct };

  let best: TextMatch = { score: 0, index: -1 };
  for (const len of [name.length, name.length + 1, name.length - 1]) {
    if (len < 1 || len > text.length) continue;
    for (let i = 0; i + len <= text.length; i++) {
      const score = diceBigram(text.slice(i, i + len), name);
      if (score > best.score) best = { score, index: i };
    }
  }
  return best;
}

/** 名称后面紧跟的角色词；没写则返回 null */
export function explicitRole(afterText: string): string | null {
  const head = (afterText || '').slice(0, 4);
  for (const { word, role } of ROLE_WORDS) {
    if (head.includes(word)) return role;
  }
  return null;
}

/** 名称后面紧跟的角色词；没写角色词默认阅办 */
export function classifyRole(afterText: string): string {
  return explicitRole(afterText) ?? DEFAULT_ROLE;
}

/** 标题取最后一个【…】（可跳过【不打印[太阳][太阳]】这类前缀） */
function extractTitle(clean: string): string | null {
  const matches = [...clean.matchAll(/【([^【】]*)】/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1][1].trim();
  return last || null;
}

/** 单位名只从第一个（）里取 */
function extractUnitCandidate(clean: string): string | null {
  const m = clean.match(/（([^（）]*)）/);
  if (!m) return null;
  const candidate = m[1].trim();
  if (candidate.length < 2 || candidate.length > 40) return null;
  if (/[。，、；：！？【】（）《》“”"]/.test(candidate)) return null;
  return candidate;
}

function findDate(clean: string): { index: number; value: string } | null {
  const cn = clean.match(DATE_CN_RE);
  const num = clean.match(DATE_NUM_RE);
  return cn && typeof cn.index === 'number'
    ? { index: cn.index, value: cn[0] }
    : num && typeof num.index === 'number'
      ? { index: num.index, value: num[0] }
      : null;
}

function extractDeadline(clean: string, now: Date): string | null {
  const year = now.getFullYear();
  const build = (month: string, day: string): string | null => {
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const cn = clean.match(DATE_CN_RE);
  if (cn) return build(cn[1], cn[2]);
  const num = clean.match(DATE_NUM_RE);
  if (num) return build(num[1], num[2]);
  return null;
}

/** 转发短语之后的剩余文字作为摘要（去掉 @人名） */
function extractSummary(clean: string): string | null {
  const date = findDate(clean);
  const scope = date ? clean.slice(0, date.index) : clean;

  const lastRole = (source: string): { index: number; length: number } => {
    let found = { index: -1, length: 0 };
    for (const { word } of ROLE_WORDS) {
      const i = source.lastIndexOf(word);
      if (i > found.index) found = { index: i, length: word.length };
    }
    return found;
  };

  let role = lastRole(scope);
  if (role.index < 0) role = lastRole(clean);
  if (role.index < 0) return null;

  const rest = clean
    .slice(role.index + role.length)
    .replace(/[@＠]\s*[\p{L}\p{N}_·]{1,12}/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s，,。.；;、:：!！~～\-]+/, '')
    .replace(/[\s，,、；;:：]+$/, '')
    .trim();
  const trimmed = stripTrailingPeriod(rest);
  return trimmed || null;
}

/** 名称含「办公室」的股室稳定排到最后 */
function officeLast(
  assignments: ParsedDeptAssignment[],
  nameById: Map<number, string>,
): ParsedDeptAssignment[] {
  const others: ParsedDeptAssignment[] = [];
  const offices: ParsedDeptAssignment[] = [];
  for (const a of assignments) {
    const name = nameById.get(a.department_id) || '';
    (name.includes('办公室') ? offices : others).push(a);
  }
  return [...others, ...offices];
}

export function parseIncomingText(
  text: string,
  units: NameItem[],
  departments: NameItem[],
  now: Date = new Date(),
): ParsedIncomingText {
  const clean = stripNoise(text || '');
  const warnings: string[] = [];

  const title = extractTitle(clean);
  if (!title) warnings.push('标题');

  let sendUnitId: number | null = null;
  let sendUnitName: string | null = null;
  let bestScore = 0;
  for (const u of units) {
    const { score } = bestMatch(u.name, clean);
    if (score > bestScore) {
      bestScore = score;
      sendUnitId = u.id;
      sendUnitName = u.name;
    }
  }
  if (bestScore < SCORE_THRESHOLD) {
    sendUnitId = null;
    sendUnitName = null;
  }

  let unitCandidate: string | null = null;
  if (sendUnitId === null) {
    const candidate = extractUnitCandidate(clean);
    if (candidate && !units.some((u) => u.name === candidate)) unitCandidate = candidate;
  }
  if (sendUnitId === null && !unitCandidate) warnings.push('来文单位');

  const replyDeadline = extractDeadline(clean, now);
  if (!replyDeadline) warnings.push('回复日期');

  const summary = extractSummary(clean);
  if (!summary) warnings.push('摘要');

  const nameById = new Map<number, string>(departments.map((d) => [d.id, d.name]));
  // 点名股室（含「办公室协办」这类角色词）优先于「各股室」的默认角色
  const named = new Map<number, string | null>();
  for (const d of departments) {
    const { score, index } = bestMatch(d.name, clean);
    if (score < SCORE_THRESHOLD) continue;
    named.set(d.id, explicitRole(clean.slice(index + d.name.length)));
  }

  let assignments: ParsedDeptAssignment[] = [];
  const allDept = clean.match(ALL_DEPT_RE);
  if (allDept && typeof allDept.index === 'number') {
    // 出现「各股室」时展开为全部股室，角色取该短语后的词
    const baseRole = classifyRole(clean.slice(allDept.index + allDept[0].length));
    assignments = departments.map((d) => ({
      department_id: d.id,
      role: named.get(d.id) ?? baseRole,
    }));
  } else {
    for (const d of departments) {
      if (!named.has(d.id)) continue;
      assignments.push({
        department_id: d.id,
        role: named.get(d.id) ?? DEFAULT_ROLE,
      });
    }
  }
  assignments = officeLast(assignments, nameById);
  if (assignments.length === 0) warnings.push('转发股室');

  return {
    title,
    send_unit_id: sendUnitId,
    send_unit_name: sendUnitName,
    reply_deadline: replyDeadline,
    summary,
    assignments,
    unitCandidate,
    warnings,
  };
}
