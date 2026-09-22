// 법정공휴일 · 휴업일 — 수업이 없는 날을 한 곳에서 판정한다.
//
// 출처가 셋이다.
//  1) 양력으로 날짜가 고정된 공휴일. 해마다 계산할 수 있어 코드에 둔다.
//  2) 학사일정 탭에 올린 학교 문서. 설날·추석·부처님오신날·대체휴일처럼
//     음력을 따라 해마다 옮겨 다니는 날은 여기서 읽는다. 학교가 직접 만든
//     문서이므로 이쪽이 가장 믿을 만하다.
//  3) 관리자가 손으로 켜고 끈 것(재량휴업일 등). 위 둘을 덮어쓴다.
import { list, on } from '../store.js';
import { parseYmd, pad } from '../model.js';

/** 날짜가 해마다 같은 공휴일 */
const FIXED = [
  [1, 1, '신정'],
  [3, 1, '삼일절'],
  [5, 5, '어린이날'],
  [6, 6, '현충일'],
  [8, 15, '광복절'],
  [10, 3, '개천절'],
  [10, 9, '한글날'],
  [12, 25, '성탄절'],
];

/**
 * 학사일정 제목이 '쉬는 날' 로 보이는가.
 *
 * 음력 공휴일과 대체휴일은 학교 문서에서 읽어 오는 수밖에 없다.
 * 잘못 집는 일이 있을 수 있어, 학사일정 탭에서 한 줄씩 켜고 끌 수 있게 해 두었다.
 */
// 방학식·개학식·시업식은 수업이 있는 날이라 넣지 않는다.
// 방학 기간은 학사일정에 하루짜리로 적히는 일이 많아 자동으로 잡지 않는다.
// 필요하면 학사일정 탭에서 한 줄씩 켜면 된다.
const OFF_WORDS = [
  '설날', '추석', '대체\\s*휴일', '대체\\s*공휴일', '부처님\\s*오신\\s*날', '석가탄신일',
  '신정', '삼일절', '어린이날', '현충일', '광복절', '개천절', '한글날',
  '성탄절', '크리스마스', '임시\\s*공휴일', '개교\\s*기념일', '재량\\s*휴업일?', '휴업일',
];
const OFF_RE = new RegExp(`^(?:${OFF_WORDS.join('|')})(?:\\s*연휴)?$|연휴$`);

export const looksLikeHoliday = (title) => OFF_RE.test(String(title || '').trim());

const ymdOf = (year, m, d) => `${year}-${pad(m)}-${pad(d)}`;

/** 그 해의 고정 공휴일 { 날짜: 이름 } */
export function fixedHolidays(year) {
  const out = {};
  for (const [m, d, name] of FIXED) out[ymdOf(year, m, d)] = name;
  return out;
}

// 달력은 한 화면에 35칸을 그리면서 날마다 물어 온다. 학사일정이 바뀌기 전까지는
// 같은 답이므로 한 번 만든 것을 재사용한다.
let memo = new Map();
on('academic', () => { memo = new Map(); });

/**
 * 기간 안의 쉬는 날 { 날짜: 이름 }.
 * 학사일정과 손으로 켠 것까지 합친다.
 */
export function holidayMap(from, to) {
  const key = `${from}|${to}`;
  if (memo.has(key)) return memo.get(key);
  const out = build(from, to);
  if (memo.size > 60) memo.clear();
  memo.set(key, out);
  return out;
}

function build(from, to) {
  const out = {};
  const y0 = parseYmd(from).getFullYear();
  const y1 = parseYmd(to).getFullYear();
  for (let y = y0; y <= y1; y++) {
    for (const [d, name] of Object.entries(fixedHolidays(y))) {
      if (d >= from && d <= to) out[d] = name;
    }
  }

  for (const a of list('academic')) {
    if (!a.date || a.date < from || a.date > to) continue;
    if ((a.kind || 'event') !== 'event') continue;
    // isHoliday 를 손으로 정했으면 그 뜻을 그대로 따른다.
    const off = a.isHoliday === undefined ? looksLikeHoliday(a.title) : !!a.isHoliday;
    if (off) out[a.date] = a.title || '휴업일';
    else if (a.isHoliday === false && out[a.date] === a.title) delete out[a.date];
  }
  return out;
}

/** 이 날 쉬는가. 쉬면 이름을, 아니면 빈 글자를 돌려준다. */
export function holidayOn(date) {
  if (!date) return '';
  return holidayMap(date, date)[date] || '';
}

/** 수업이 없는 날인가 (공휴일·휴업일 또는 주말) */
export function isOffDay(date) {
  const w = parseYmd(date).getDay();
  return w === 0 || w === 6 || !!holidayOn(date);
}
