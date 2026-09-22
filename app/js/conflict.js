// 중복(충돌) 찾기
//
// '같은 시간' 만으로는 중복이 아니다. 3학년 수업과 5학년 수업은 같은 교시라도 괜찮다.
// 셋 중 하나라도 겹쳐야 진짜 중복이다.
//   사람 : 같은 담당자가 동시에 두 곳에 있을 수 없다
//   공간 : 같은 장소를 동시에 둘이 쓸 수 없다
//   학생 : 같은 학년(반)이 동시에 두 활동을 할 수 없다
//
// 시간은 '3교시' 와 '10:30' 을 함께 다뤄야 해서 둘 다 분(minute)으로 바꿔 비교한다.
import { loadConfig } from './config.js';
import { list } from './store.js';

/** 학교마다 다르므로 설정에서 바꿀 수 있다. */
export const DEFAULT_PERIODS = [
  ['09:00', '09:40'],
  ['09:50', '10:30'],
  ['10:40', '11:20'],
  ['11:30', '12:10'],
  ['13:10', '13:50'],
  ['14:00', '14:40'],
  ['14:50', '15:30'],
  ['15:40', '16:20'],
];

const toMin = (hhmm) => {
  const m = String(hhmm).match(/(\d{1,2})\s*:\s*(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ── 시정표 ─────────────────────────────────────────────────
// 학교는 기본 시정 말고도 단축 시정을 쓰고, 수업공개 날에는 공개 학년만
// 다른 시정으로 움직인다(참관하러 가야 하므로). 그래서 시정은 하나가 아니다.
//
// 어느 시정을 쓸지는 좁은 쪽이 이긴다.
//   활동에 지정한 시정  →  그 날짜에 지정한 시정  →  기본 시정

/** 등록된 시정표. 하나도 없으면 설정의 교시 시각을 기본 시정으로 본다. */
export function bellList() {
  const rows = list('bells').slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (rows.length) return rows;
  const cfg = loadConfig();
  return [{
    id: '__default', name: '기본 시정', isDefault: true,
    periods: (cfg.periods && cfg.periods.length) ? cfg.periods : DEFAULT_PERIODS,
  }];
}

export function defaultBell() {
  const all = bellList();
  return all.find((b) => b.isDefault) || all[0];
}

export function bellById(id) {
  if (!id) return null;
  return bellList().find((b) => b.id === id) || null;
}

/** 그 날짜에 지정된 시정 id (단축수업 날 등) */
export function dayBellId(date) {
  if (!date) return '';
  const row = list('daybell').find((d) => d.id === date);
  return row ? row.bellId : '';
}

/** 이 항목에 실제로 적용되는 시정 */
export function bellFor(item) {
  return bellById(item && item.bellId)
    || bellById(dayBellId(item && item.date))
    || defaultBell();
}

/**
 * 시정표의 교시 시각을 [[시작, 끝], …] 로 돌려준다.
 *
 * 파이어스토어는 배열 안의 배열을 받지 않아서 문서에는 { s, e } 객체로 담는다.
 * 예전에 로컬로 저장해 둔 [[시작, 끝]] 모양도 그대로 읽히도록 둘 다 받는다.
 */
export function periodPairs(periods) {
  if (!periods || !periods.length) return DEFAULT_PERIODS;
  return periods.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p && p.s, p && p.e]))
    .filter(([s, e]) => s && e);
}

/** 저장할 모양으로 되돌린다. */
export const periodDocs = (pairs) =>
  pairs.filter(([s, e]) => s && e).map(([s, e]) => ({ s, e }));

export function periodTable(bell) {
  const b = bell || defaultBell();
  const rows = periodPairs(b && b.periods);
  return rows.map(([s, e]) => ({ s: toMin(s), e: toMin(e) }));
}

export const fmtMin = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** '3교시' → '3교시 (10:30~11:10)' — 기본이 아닌 시정일 때만 시각을 덧붙인다. */
export function describeTime(item) {
  const t = String(item.time || '');
  // 시정에 따라 달라지는 것은 '교시' 뿐이다. '10:30' 은 어느 시정에서나 10:30 이다.
  if (!t || !/교시/.test(t)) return t;
  const bell = bellFor(item);
  if (bell.id === defaultBell().id) return t;
  const r = timeRange(t, periodTable(bell));
  return r ? `${t} (${fmtMin(r.s)}~${fmtMin(r.e)})` : t;
}

const DEFAULT_LEN = 40;   // 시각만 적혀 있을 때 이만큼 쓰는 것으로 본다

/**
 * '3교시', '1~2교시', '10:30', '08:40~09:00', '아침활동' → { s, e } (분)
 * 알 수 없으면 null. 모르는 것을 중복이라고 우기지 않는다.
 */
export function timeRange(text, periods) {
  const table = periods || periodTable();
  const t = String(text || '').trim();
  if (!t) return null;
  const P = (n) => table[n - 1] || null;

  let m = t.match(/(\d{1,2})\s*:\s*(\d{2})\s*[~-]\s*(\d{1,2})\s*:\s*(\d{2})/);
  if (m) return { s: toMin(`${m[1]}:${m[2]}`), e: toMin(`${m[3]}:${m[4]}`) };

  m = t.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (m) { const s = toMin(`${m[1]}:${m[2]}`); return { s, e: s + DEFAULT_LEN }; }

  m = t.match(/(\d)\s*[~-]\s*(\d)\s*교시/);
  if (m) {
    const a = P(Number(m[1])); const b = P(Number(m[2]));
    if (a && b) return { s: a.s, e: b.e };
  }
  m = t.match(/(\d)\s*,\s*(\d)\s*교시/);      // '3,2교시' = 학년별로 다른 교시
  if (m) {
    const a = P(Number(m[1])); const b = P(Number(m[2]));
    if (a && b) return { s: Math.min(a.s, b.s), e: Math.max(a.e, b.e) };
  }
  m = t.match(/(\d)\s*교시/);
  if (m) { const a = P(Number(m[1])); if (a) return { s: a.s, e: a.e }; }

  const first = P(1);
  if (/아침|조회/.test(t)) return { s: (first ? first.s : 540) - 30, e: first ? first.s : 540 };
  if (/점심|중식/.test(t)) return { s: 720, e: 790 };
  return null;   // '방과후', 빈 값 등은 판정하지 않는다
}

export const overlapsTime = (a, b) => !!(a && b && a.s < b.e && b.s < a.e);

/**
 * 대상 글귀에서 학년 집합을 뽑는다.
 * '전교생' 은 전 학년, '3학년 2반' 은 3학년으로 본다(반까지 나누면 과하게 놓친다).
 */
export function gradeSet(text) {
  const t = String(text || '').replace(/\s/g, '');
  if (!t) return null;
  if (/전교생|전학년|모든학년/.test(t)) return new Set([1, 2, 3, 4, 5, 6]);
  const out = new Set();
  let m = t.match(/(\d)[~-](\d)\s*학?년/);
  if (m) { for (let i = Number(m[1]); i <= Number(m[2]); i++) out.add(i); }
  for (const g of t.matchAll(/(\d)\s*(?:,\s*(\d)\s*)?학?년/g)) {
    if (g[1]) out.add(Number(g[1]));
    if (g[2]) out.add(Number(g[2]));
  }
  return out.size ? out : null;
}

const sameText = (a, b) => {
  const x = String(a || '').replace(/\s/g, '');
  const y = String(b || '').replace(/\s/g, '');
  return !!x && !!y && x === y;
};

/** 두 항목이 왜 겹치는지. 겹치지 않으면 빈 배열. */
export function clashReasons(a, b) {
  // 두 항목이 서로 다른 시정으로 움직일 수 있다(수업공개 날의 이원화).
  const ra = timeRange(a.time, periodTable(bellFor(a)));
  const rb = timeRange(b.time, periodTable(bellFor(b)));
  if (!overlapsTime(ra, rb)) return [];

  const why = [];
  if (sameText(a.owner, b.owner)) why.push(`담당 ${a.owner}`);
  if (sameText(a.place, b.place)) why.push(`장소 ${a.place}`);

  const ga = gradeSet(a.target);
  const gb = gradeSet(b.target);
  if (ga && gb) {
    const both = [...ga].filter((g) => gb.has(g));
    if (both.length) why.push(`${both.join('·')}학년`);
  }
  return why;
}

/**
 * 같은 날의 항목들에서 중복을 찾는다.
 * @returns Map(항목 id → [{ other, why }])
 */
export function findClashes(items) {
  const out = new Map();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const why = clashReasons(items[i], items[j]);
      if (!why.length) continue;
      for (const [x, y] of [[i, j], [j, i]]) {
        const list = out.get(items[x].id) || [];
        list.push({ other: items[y], why });
        out.set(items[x].id, list);
      }
    }
  }
  return out;
}

/** 중복 한 건을 사람이 읽는 문장으로 */
export function clashLabel(hits) {
  if (!hits || !hits.length) return '';
  const first = hits[0];
  const more = hits.length > 1 ? ` 외 ${hits.length - 1}건` : '';
  return `'${first.other.title}' 과(와) 겹침 (${first.why.join(', ')})${more}`;
}
