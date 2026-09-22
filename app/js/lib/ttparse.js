// 교담 시간표 표 → 시간표 칸 목록
//
// 학교 교담 시간표는 이렇게 생겼다.
//        │ 월            │ 화              │ 수
//   1교시│ 공자람반1,2   │ 공자람반1,2     │ 공자람반1,2
//        │ 과학5         │ 영어(원어민)    │
//                          국악5
//
// 한 칸에 여러 줄이 들어가고 그 줄 하나가 항목 하나다.
// '공자람반1,2' 처럼 쉼표가 이름의 일부인 경우가 많아 쉼표로는 나누지 않는다.
// 줄바꿈으로만 나눈다.

const DOW_CHARS = ['일', '월', '화', '수', '목', '금', '토'];

/** 특별실·순회로 볼 만한 낱말 */
const SPECIAL = /꿈자람|공자람|보건|영양|국악|원어민|사서|순회|돌봄|상담|특수|바이올린|피아노|주산|드론/;

const clean = (v) => String(v == null ? '' : v).replace(/ /g, ' ').trim();

/**
 * @param {string[][]} rows  표 (행 × 칸)
 * @returns {{slots: Array, dowCols: number, periods: number}}
 */
export function parseTimetableGrid(rows) {
  if (!rows || !rows.length) return { slots: [], dowCols: 0, periods: 0 };

  // 1) 요일 머리글 줄 찾기 — 월·화·수가 같은 줄에 있어야 한다.
  let headIdx = -1;
  let colDow = {};
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const map = {};
    rows[i].forEach((c, j) => {
      const t = clean(c).replace(/요일|\s/g, '');
      const d = DOW_CHARS.indexOf(t);
      if (d >= 1 && d <= 5 && map[j] === undefined) map[j] = d;
    });
    if (Object.keys(map).length >= 3) { headIdx = i; colDow = map; break; }
  }
  if (headIdx < 0) return { slots: [], dowCols: 0, periods: 0 };

  // 2) 교시 줄 찾기 — 어느 칸에든 'N교시' 가 있으면 그 줄이다.
  const slots = [];
  const seenPeriods = new Set();
  for (let i = headIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    let period = 0;
    for (let j = 0; j <= 2 && j < row.length; j++) {
      const m = clean(row[j]).match(/^(\d)\s*교시/);
      if (m) { period = Number(m[1]); break; }
    }
    if (!period) continue;
    seenPeriods.add(period);

    for (const [colStr, dow] of Object.entries(colDow)) {
      const text = clean(row[Number(colStr)]);
      if (!text) continue;
      for (const line of splitCell(text)) {
        slots.push({
          dow, period,
          title: line,
          kind: SPECIAL.test(line) ? 'special' : 'subject',
          target: '', place: '', owner: '', note: '',
        });
      }
    }
  }
  return { slots, dowCols: Object.keys(colDow).length, periods: seenPeriods.size };
}

/** 한 칸을 항목들로. 줄바꿈으로만 나눈다('공자람반1,2' 의 쉼표는 이름이다). */
export function splitCell(text) {
  return String(text)
    .split(/[\r\n]+/)
    .map((x) => x.replace(/\s{2,}/g, ' ').trim())
    .filter((x) => x && !/^[-–—·]+$/.test(x));
}

/**
 * '월 1교시 과학5' 처럼 줄마다 적은 것도 받는다.
 * 표를 옮기기 어려울 때 쓰는 길.
 */
export function parseTimetableLines(text) {
  const slots = [];
  let dow = 0;
  let period = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let rest = line;
    const dm = rest.match(/^([월화수목금])\s*(?:요일)?\s*[:,)\]]?\s*/);
    if (dm) { dow = DOW_CHARS.indexOf(dm[1]); rest = rest.slice(dm[0].length).trim(); }
    const pm = rest.match(/^(\d)\s*교시\s*[:,)\]]?\s*/);
    if (pm) { period = Number(pm[1]); rest = rest.slice(pm[0].length).trim(); }

    if (!rest) continue;
    if (!dow || !period) continue;
    for (const part of rest.split('/').map((x) => x.trim()).filter(Boolean)) {
      slots.push({
        dow, period, title: part,
        kind: SPECIAL.test(part) ? 'special' : 'subject',
        target: '', place: '', owner: '', note: '',
      });
    }
  }
  return slots;
}

/** 엑셀·한글에서 복사한 탭 구분 표 */
export function parsePastedGrid(text) {
  const t = String(text).replace(/^﻿/, '');
  const hasTab = t.includes('\t');
  if (!hasTab) return null;
  // 칸 안의 줄바꿈은 따옴표로 묶여 온다.
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}
