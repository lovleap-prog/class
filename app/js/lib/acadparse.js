// 학사일정 표 → 일정 목록
//
// 학사일정표는 학교마다 모양이 제각각이다. 흔한 것만 추려 받는다.
//   날짜 | 요일 | 주요 행사          (한 줄에 하루)
//   월 | 일 | 요일 | 행사            (월이 따로 있는 형태)
//   3월 | 2(월) 시업식 / 4(수) 입학식 (한 칸에 여러 날)
import { extractDate, pad2 } from './textparse.js';

const clean = (v) => String(v == null ? '' : v).replace(/ /g, ' ').trim();

/** 문서에서 학년도를 찾는다. '2026학년도', '2026년' */
export function findYear(text) {
  const m = String(text || '').match(/(20\d{2})\s*(?:학년도|년)/);
  return m ? Number(m[1]) : new Date().getFullYear();
}

/**
 * @param {string[][]} rows
 * @param {{year?:number, term?:string}} ctx
 */
export function parseAcademic(rows, ctx = {}) {
  if (!rows || !rows.length) return [];

  // 달력형(여러 달 가로 배치)이 가장 흔하다. 먼저 본다.
  const cal = parseAcademicCalendar(rows, ctx);
  if (cal) return cal;

  const year = ctx.year || new Date().getFullYear();
  const out = [];

  // 열 찾기. '날짜' 한 칸짜리도 있고 '월'·'일' 로 갈린 것도 있다.
  const looksHeader = (r) => {
    const cs = r.map((c) => clean(c).replace(/\s/g, ''));
    const hasDate = cs.some((c) => /날짜|월일|일자|기간/.test(c))
      || (cs.includes('월') && cs.includes('일'));
    const hasTitle = cs.some((c) => /행사|내용|일정|주요/.test(c));
    return hasDate && hasTitle;
  };
  const headIdx = rows.findIndex(looksHeader);

  // 머리글도 없고 'N월' 칸도 없으면 일정표가 아니다(수업일수·통계표 등).
  // 이걸 막지 않으면 숫자를 행사명으로 읽어 쓰레기가 쌓인다.
  if (headIdx < 0) {
    const hasMonthCell = rows.some((r) => r.some((c) => /^\s*\d{1,2}\s*월\s*$/.test(String(c || ''))));
    if (!hasMonthCell) return [];
  }
  const head = (headIdx >= 0 ? rows[headIdx] : []).map((c) => clean(c).replace(/\s/g, ''));
  const col = (re) => head.findIndex((c) => re.test(c));
  const iDate = col(/날짜|월일|일자|기간/);
  const iMon = col(/^월$/);
  const iDay = col(/^일$/);
  const iTitle = col(/행사|내용|일정|주요/);
  const iNote = col(/비고|참고/);

  let curMonth = 3;   // 학사일정은 3월에서 시작하는 경우가 많다

  const push = (date, endDate, title, note) => {
    const t = clean(title);
    if (!t || !date) return;
    // 한 칸에 '시업식·입학식' 처럼 여러 개면 나눈다
    for (const piece of splitTitle(t)) {
      out.push({ date, endDate: endDate || '', title: piece, note: clean(note) });
    }
  };

  const start = headIdx >= 0 ? headIdx + 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.some((c) => clean(c))) continue;

    // (가) 월 열이 따로 있는 형태
    if (iMon >= 0) {
      const mm = clean(r[iMon]).match(/(\d{1,2})/);
      if (mm) curMonth = Number(mm[1]);
      const dd = iDay >= 0 ? clean(r[iDay]).match(/(\d{1,2})/) : null;
      if (dd) {
        push(`${year}-${pad2(curMonth)}-${pad2(dd[1])}`, '',
          iTitle >= 0 ? r[iTitle] : r.slice(-1)[0], iNote >= 0 ? r[iNote] : '');
        continue;
      }
    }

    // (나) 날짜 열이 있는 형태
    const dateCell = iDate >= 0 ? clean(r[iDate]) : '';
    if (dateCell) {
      const d = extractDate(dateCell, year, curMonth);
      if (d) {
        curMonth = Number(d.start.slice(5, 7));
        push(d.start, d.end, iTitle >= 0 ? r[iTitle] : r.slice(-1)[0], iNote >= 0 ? r[iNote] : '');
        continue;
      }
    }

    // (다) 한 칸 안에 '2(월) 시업식' 처럼 날짜와 내용이 같이 있는 형태
    const monthCell = clean(r[0]).match(/^(\d{1,2})\s*월/);
    if (monthCell) curMonth = Number(monthCell[1]);
    for (const cell of r) {
      const text = clean(cell);
      if (!text || /^\d{1,2}\s*월$/.test(text)) continue;
      for (const line of text.split(/[\r\n]+/)) {
        const m = line.match(/^\s*(\d{1,2})\s*\(?\s*[월화수목금토일]?\s*\)?\s*[.~-]?\s*(.+)$/);
        if (!m) continue;
        const day = Number(m[1]);
        if (!(day >= 1 && day <= 31)) continue;
        push(`${year}-${pad2(curMonth)}-${pad2(day)}`, '', m[2], '');
      }
    }
  }
  return out;
}

// ── 여러 달을 가로로 늘어놓은 달력형 학사일정 ──────────────
// 학교 학사일정표는 대개 이렇게 생겼다.
//
//   2026학년도 1학기
//   │  3월      │  4월      │  5월      │ …      ← 달마다 여러 열을 차지한다
//   │ 1 일 삼일절│ 1 수 동아리│ 1 금      │ …
//   │ 2 월 대체휴일│ 2 목     │ 2 토      │ …
//
// 달마다 [일, 요일, 행사…] 열이 붙어 있고, 주간 행사 띠 때문에 열이 하나 더 있기도 하다.

const MONTH_CELL = /^\s*(\d{1,2})\s*월\s*$/;

/**
 * 한 칸에 든 행사를 나눈다.
 * 괄호 안의 쉼표·슬래시는 구분자가 아니다. '건강검진(1,4)' 는 하나다.
 * 줄바꿈은 이미 공백으로 합쳐져 들어온다. 한 칸에 두 줄로 적힌 것은 한 행사다.
 */
export function splitTitle(text) {
  const t = String(text || '').replace(/\s*\n\s*/g, ' ').trim();
  if (!t) return [];
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of t) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === ',' || ch === '·' || ch === '/')) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((x) => x.replace(/\s{2,}/g, ' ').trim()).filter(Boolean);
}

/**
 * '1학기 (2026.03.01. ~ 2026.08.18.)' 같은 칸에서 학기 기간을 읽는다.
 * 8월처럼 문서 편의상 1학기 표에 들어 있는 날짜를 제자리로 보내는 근거가 된다.
 */
export function parseTermRanges(rows) {
  const out = [];
  for (const r of rows || []) {
    for (const cell of r) {
      const t = String(cell || '').replace(/\s+/g, ' ');
      const m = t.match(/([12])\s*학기\s*\(\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*~\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
      if (!m) continue;
      out.push({
        term: m[1],
        from: `${m[2]}-${pad2(m[3])}-${pad2(m[4])}`,
        to: `${m[5]}-${pad2(m[6])}-${pad2(m[7])}`,
      });
    }
  }
  return out;
}

export function termOfDate(date, ranges) {
  for (const r of ranges || []) {
    if (date >= r.from && date <= r.to) return r.term;
  }
  return '';
}

/** '학기 / 월 / 수업일수' 표 → 학사일정 맨 위에 보여줄 요약 */
export function parseSchoolDays(rows) {
  if (!rows || rows.length < 2) return null;
  const rowOf = (re) => rows.find((r) => re.test(String(r[0] || '').replace(/\s/g, '')));
  const termRow = rowOf(/^학기$/);
  const monthRow = rowOf(/^월$/);
  const dayRow = rowOf(/^수업일수$/);
  if (!monthRow || !dayRow) return null;

  const months = [];
  const subtotal = {};
  let total = 0;
  for (let j = 1; j < monthRow.length; j++) {
    const mm = String(monthRow[j] || '').replace(/\s/g, '');
    const dd = String(dayRow[j] || '').replace(/\s/g, '');
    const term = termRow ? String(termRow[j] || '').replace(/\s/g, '').replace('학기', '') : '';
    if (/^\d{1,2}$/.test(mm) && /^\d+$/.test(dd)) {
      months.push({ term, month: Number(mm), days: Number(dd) });
    } else if (/소계/.test(mm) && /^\d+$/.test(dd)) {
      if (term) subtotal[term] = Number(dd);
    } else if (!mm && /^\d+$/.test(dd)) {
      total = Number(dd);
    }
  }
  if (!months.length) return null;
  // 소계 칸을 못 읽었으면 달에서 더한다.
  for (const t of ['1', '2']) {
    if (subtotal[t] === undefined) {
      const sum = months.filter((m) => m.term === t).reduce((a, m) => a + m.days, 0);
      if (sum) subtotal[t] = sum;
    }
  }
  if (!total) total = Object.values(subtotal).reduce((a, b) => a + b, 0);
  return { months, subtotal, total };
}

/**
 * '※ 비급식일(2일): 4.29.(수)-…, 7.15.(수)' 에서 비급식일을 뽑는다.
 * 뒤에 붙는 '돌봄교실 신학기 준비기간' 같은 다른 안내는 잘라낸다.
 */
export function parseNoMealDays(texts, schoolYear) {
  const out = [];
  for (const raw of texts || []) {
    const line = String(raw || '').replace(/\s+/g, ' ');
    const at = line.indexOf('비급식일');
    if (at < 0) continue;
    let body = line.slice(at).replace(/^비급식일\s*\([^)]*\)\s*[:：]?\s*/, '');
    const stop = body.search(/(돌봄교실|준비기간|※)/);
    if (stop > 0) body = body.slice(0, stop);

    for (const chunk of body.split(',')) {
      const m = chunk.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/);
      if (!m) continue;
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
      const note = (chunk.split(/[-–—]/)[1] || '').replace(/\([^)]*\)/g, '').trim();
      out.push({ date: schoolYearDate(schoolYear, month, day), note });
    }
  }
  return out;
}

/** '2026학년도' 는 3~12월이 그 해, 1~2월은 이듬해다. */
export function schoolYearDate(schoolYear, month, day) {
  const y = month >= 3 ? schoolYear : schoolYear + 1;
  return `${y}-${pad2(month)}-${pad2(day)}`;
}

export function findSchoolYear(text) {
  const m = String(text || '').match(/(20\d{2})\s*학년도/);
  return m ? Number(m[1]) : null;
}

/** 표 안에서 '1학기' / '2학기' 를 찾는다. */
function findTerm(rows) {
  for (const r of rows.slice(0, 3)) {
    for (const c of r) {
      const m = String(c || '').match(/([12])\s*학기/);
      if (m) return m[1];
    }
  }
  return '';
}

/** 달력형 표인지 보고, 맞으면 일정 목록을 돌려준다. 아니면 null. */
export function parseAcademicCalendar(rows, ctx = {}) {
  if (!rows || rows.length < 3) return null;

  // 달 머리글 줄 찾기 — 'N월' 칸이 둘 이상인 줄
  let headIdx = -1;
  let cols = [];
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const found = [];
    let prev = '';
    rows[i].forEach((cell, j) => {
      const m = String(cell || '').match(MONTH_CELL);
      if (!m) { prev = ''; return; }
      const month = Number(m[1]);
      if (!(month >= 1 && month <= 12)) return;
      // 가로 병합이라 같은 값이 여러 열에 걸쳐 있다. 처음 나온 열만 잡는다.
      if (String(cell) === prev) { found[found.length - 1].end = j; return; }
      prev = String(cell);
      found.push({ month, start: j, end: j });
    });
    if (found.length >= 2) { headIdx = i; cols = found; break; }
  }
  if (headIdx < 0) return null;

  const schoolYear = ctx.schoolYear
    || findSchoolYear(rows.slice(0, headIdx + 1).map((r) => r.join(' ')).join(' '))
    || ctx.year
    || new Date().getFullYear();
  const term = findTerm(rows) || ctx.term || '';

  const out = [];
  for (let i = headIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    for (const g of cols) {
      // 열 위치를 못 박으면 안 된다. 달마다 병합이 달라서 요일이 세 번째 칸일 때도 있다.
      // 가로 병합으로 같은 값이 이어지므로 먼저 붙은 중복을 접는다.
      const vals = [];
      for (let c = g.start; c <= g.end; c++) {
        const v = String(row[c] || '').replace(/\s*\n\s*/g, ' ').trim();
        if (vals.length && vals[vals.length - 1] === v) continue;
        vals.push(v);
      }
      const day = Number(/^\d{1,2}$/.test(vals[0] || '') ? vals[0] : NaN);
      if (!(day >= 1 && day <= 31)) continue;

      // 두 번째가 요일이면 건너뛴다. 남은 것 중 마지막이 실제 행사다.
      // (주간 띠가 세로로 병합돼 있으면 앞쪽에 띠 이름이 하나 더 끼어든다)
      const rest = vals.slice(/^[월화수목금토일]$/.test(vals[1] || '') ? 2 : 1);
      let title = '';
      for (const v of rest) if (v) title = v;
      if (!title) continue;

      const date = schoolYearDate(schoolYear, g.month, day);
      for (const piece of splitTitle(title)) {
        out.push({ date, endDate: '', title: piece, note: '', term });
      }
    }
  }
  return out.length ? out : null;
}

/** 자유 형식 줄: '3/2 시업식' */
export function parseAcademicLines(text, year) {
  const y = year || new Date().getFullYear();
  const out = [];
  let curMonth = 3;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const d = extractDate(line, y, curMonth);
    if (!d) continue;
    curMonth = Number(d.start.slice(5, 7));
    const title = d.rest.replace(/^[\s,.:·\-~)\]]+/, '').trim();
    if (!title) continue;
    out.push({ date: d.start, endDate: d.end || '', title, note: '' });
  }
  return out;
}
