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
    // 한 칸에 '시업식, 입학식' 처럼 여러 개면 나눈다
    for (const piece of t.split(/\s*[,/·]\s*/).map((x) => x.trim()).filter(Boolean)) {
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
