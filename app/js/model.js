// 데이터 모델 · 상태값 · 날짜 유틸 · 반복일정 전개
export const STATUS = {
  pending:  { key: 'pending',  label: '확인 대기', cls: 'st-pending' },
  approved: { key: 'approved', label: '승인 완료', cls: 'st-approved' },
  rejected: { key: 'rejected', label: '반려',      cls: 'st-rejected' },
};

export const CATEGORY = {
  academic: '교과·수업',
  event:    '행사·체험',
  safety:   '안전·보건',
  meeting:  '회의·연수',
  afterschool: '방과후',
  etc:      '기타',
};

export const ROLE = { admin: '관리자(결재)', teacher: '교사(입력)' };

export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// ── 날짜 유틸 ───────────────────────────────────────────────
export const pad = (n) => String(n).padStart(2, '0');

export function ymd(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseYmd(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s, n) {
  const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d);
}
export function today() { return ymd(new Date()); }

/** 그 주의 월요일 */
export function weekStart(s) {
  const d = parseYmd(s);
  const off = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - off);
  return ymd(d);
}
export function monthStart(s) { return s.slice(0, 8) + '01'; }
export function monthEnd(s) {
  const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
export function addMonths(s, n) {
  const d = parseYmd(s);
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return ymd(d);
}
export function range(from, to) {
  const out = []; let c = from;
  while (c <= to) { out.push(c); c = addDays(c, 1); }
  return out;
}
export function fmtK(s, { weekday = true, year = true } = {}) {
  const d = parseYmd(s);
  const base = `${year ? d.getFullYear() + '. ' : ''}${d.getMonth() + 1}. ${d.getDate()}.`;
  return weekday ? `${base}(${WEEKDAY[d.getDay()]})` : base;
}
export const dow = (s) => parseYmd(s).getDay();
export const isWeekend = (s) => dow(s) === 0 || dow(s) === 6;

// ── 기본값 ─────────────────────────────────────────────────
export function newActivity(partial = {}) {
  return {
    id: uid('act'),
    date: today(), endDate: '', time: '',
    title: '', detail: '', target: '', place: '', dept: '', owner: '',
    category: 'academic',
    status: 'pending',
    source: 'manual',
    createdBy: '', createdAt: new Date().toISOString(),
    reviewedBy: '', reviewedAt: '', rejectReason: '',
    history: [],
    ...partial,
  };
}

export function newRecurring(partial = {}) {
  return {
    id: uid('rec'),
    title: '', freq: 'weekly', weekdays: [1, 2, 3, 4, 5], nth: [],
    time: '', place: '', target: '', owner: '', dept: '',
    category: 'academic',
    startDate: today(), endDate: '',
    active: true, includeInNeis: true, note: '',
    createdBy: '', createdAt: new Date().toISOString(),
    ...partial,
  };
}

export function newAfterSchool(partial = {}) {
  return {
    id: uid('as'),
    name: '', teacher: '', grade: '', room: '',
    weekdays: [], time: '', term: '', capacity: '', enrolled: '', fee: '', note: '',
    active: true,
    ...partial,
  };
}

let seq = 0;
export function uid(prefix = 'id') {
  seq = (seq + 1) % 1000;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;
}

// ── 반복일정 전개 ───────────────────────────────────────────
/** 반복 규칙을 [from, to] 구간의 가상 활동 목록으로 전개한다. */
export function expandRecurring(rules, from, to) {
  const out = [];
  for (const r of rules) {
    if (!r.active) continue;
    for (const day of range(from, to)) {
      if (r.startDate && day < r.startDate) continue;
      if (r.endDate && day > r.endDate) continue;
      if (!matchesRule(r, day)) continue;
      out.push({
        id: `${r.id}@${day}`,
        recurringId: r.id,
        date: day, endDate: '', time: r.time,
        title: r.title, detail: r.note,
        target: r.target, place: r.place, dept: r.dept, owner: r.owner,
        category: r.category,
        status: 'approved',       // 반복일정은 사전 승인된 상시 운영 활동
        source: 'recurring',
        isRecurring: true,
        includeInNeis: r.includeInNeis !== false,
      });
    }
  }
  return out;
}

export function matchesRule(r, day) {
  const d = parseYmd(day);
  const wd = d.getDay();
  switch (r.freq) {
    case 'daily':
      return true;
    case 'weekly':
      return (r.weekdays || []).includes(wd);
    case 'biweekly': {
      if (!(r.weekdays || []).includes(wd)) return false;
      const base = parseYmd(weekStart(r.startDate || day));
      const weeks = Math.round((parseYmd(weekStart(day)) - base) / (7 * 864e5));
      return weeks >= 0 && weeks % 2 === 0;
    }
    case 'monthlyNth': {
      if (!(r.weekdays || []).includes(wd)) return false;
      const nth = Math.floor((d.getDate() - 1) / 7) + 1;
      return (r.nth || []).map(Number).includes(nth);
    }
    case 'monthlyDate':
      return (r.nth || []).map(Number).includes(d.getDate());
    default:
      return false;
  }
}

export function describeRule(r) {
  const wd = (r.weekdays || []).map((i) => WEEKDAY[i]).join('·');
  switch (r.freq) {
    case 'daily': return '매일';
    case 'weekly': return `매주 ${wd}`;
    case 'biweekly': return `격주 ${wd}`;
    case 'monthlyNth': return `매월 ${(r.nth || []).join('·')}번째 ${wd}`;
    case 'monthlyDate': return `매월 ${(r.nth || []).join('·')}일`;
    default: return '';
  }
}

/** 방과후 프로그램을 특정 날짜의 활동처럼 변환 */
export function afterSchoolOn(programs, day) {
  const wd = dow(day);
  return programs.filter((p) => p.active !== false && (p.weekdays || []).includes(wd));
}

/** 정렬: 시간 → 제목 */
export function byTime(a, b) {
  const ka = timeKey(a.time), kb = timeKey(b.time);
  if (ka !== kb) return ka - kb;
  return String(a.title).localeCompare(String(b.title), 'ko');
}

/** '3교시', '09:30', '2~3교시' 등을 정렬 가능한 숫자로 */
export function timeKey(t) {
  if (!t) return 9999;
  const hm = String(t).match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const per = String(t).match(/(\d)\s*교시/);
  if (per) return 480 + Number(per[1]) * 45; // 1교시=09:05 부근으로 근사
  if (/아침|조회/.test(t)) return 500;
  if (/점심|중식/.test(t)) return 720;
  if (/방과\s*후|하교/.test(t)) return 900;
  return 9998;
}

/** 활동이 특정 날짜에 걸치는지 (기간 일정 지원) */
export function occursOn(a, day) {
  const s = a.date;
  const e = a.endDate && a.endDate > a.date ? a.endDate : a.date;
  return day >= s && day <= e;
}
