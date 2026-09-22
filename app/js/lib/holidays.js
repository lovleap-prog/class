// 법정공휴일 · 휴업일 — 수업이 없는 날을 한 곳에서 판정한다.
//
// 출처가 셋이다.
//  1) 코드에 적어 둔 공휴일. 양력으로 고정된 날(삼일절·개천절…)과,
//     음력을 따라 옮겨 다니는 날(설날·부처님오신날·추석)의 2026~2032년 표다.
//     학사일정을 안 올려도 이만큼은 잡힌다.
//  2) 학사일정 탭에 올린 학교 문서. 대체휴일·재량휴업일처럼 학교마다 다른 날,
//     그리고 표에 없는 해의 음력 공휴일을 여기서 읽는다. 학교가 직접 만든
//     문서이므로 1) 보다 늘 우선한다.
//  3) 관리자가 손으로 켜고 끈 것. 위 둘을 덮어쓴다.
import { list, on } from '../store.js';
import { parseYmd, pad, addDays } from '../model.js';

/**
 * 음력을 따라 해마다 옮겨 다니는 공휴일 — [설날, 부처님오신날, 추석] 당일.
 *
 * 삭(합삭)과 동지·중기를 천문 계산으로 뽑은 뒤, 2020~2030년 실제 달력과
 * 하나하나 맞춰 본 값이다. 2026년 추석(9.25)은 학교 학사일정 문서와도 같았다.
 *
 * **대체공휴일은 일부러 넣지 않았다.** 대체공휴일 규칙은 법이 몇 번 바뀌었고
 * 앞으로도 바뀐다. 하루라도 틀리면 수업하는 날을 '쉬는 날' 로 적게 되는데,
 * 그것은 빠뜨리는 것보다 나쁘다. 학사일정에 적힌 '대체 휴일' 이 그 자리를 맡고,
 * 아래 값보다 늘 우선한다.
 *
 * 표에 없는 해는 예전처럼 학사일정만 본다.
 */
const LUNAR = {
  2026: ['2026-02-17', '2026-05-24', '2026-09-25'],
  2027: ['2027-02-07', '2027-05-13', '2027-09-15'],
  2028: ['2028-01-27', '2028-05-02', '2028-10-03'],
  2029: ['2029-02-13', '2029-05-20', '2029-09-22'],
  2030: ['2030-02-03', '2030-05-09', '2030-09-12'],
  2031: ['2031-01-23', '2031-05-28', '2031-10-01'],
  2032: ['2032-02-11', '2032-05-16', '2032-09-19'],
};

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

/** 그 해의 공휴일 { 날짜: 이름 } — 양력 고정분과 음력분을 합친다. */
export function fixedHolidays(year) {
  const out = {};
  for (const [m, d, name] of FIXED) out[ymdOf(year, m, d)] = name;

  const lunar = LUNAR[year];
  if (lunar) {
    const [seol, buddha, chuseok] = lunar;
    // 설과 추석은 전날·당일·다음날 사흘이 다 공휴일이다.
    for (const [day, name] of [[seol, '설날'], [chuseok, '추석']]) {
      out[addDays(day, -1)] = `${name} 연휴`;
      out[day] = name;
      out[addDays(day, 1)] = `${name} 연휴`;
    }
    out[buddha] = '부처님오신날';
  }
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
  // 설 연휴가 해를 걸치는 일이 있어 앞뒤 한 해씩 더 본다.
  const y0 = parseYmd(from).getFullYear() - 1;
  const y1 = parseYmd(to).getFullYear() + 1;
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
