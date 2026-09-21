// 화면들이 공통으로 쓰는 조회 함수 모음
import { list } from './store.js';
import { expandRecurring, afterSchoolOn, occursOn, byTime, range, weekStart, dow } from './model.js';
import { findClashes } from './conflict.js';

export function activitiesOn(date, { onlyApproved = false } = {}) {
  return list('activities')
    .filter((a) => occursOn(a, date))
    .filter((a) => (onlyApproved ? a.status === 'approved' : a.status !== 'rejected'))
    .sort(byTime);
}

export function pendingList() {
  return list('activities')
    .filter((a) => a.status === 'pending')
    .sort((x, y) => (x.date === y.date ? byTime(x, y) : x.date.localeCompare(y.date)));
}

export function recurringOn(date) {
  return expandRecurring(list('recurring'), date, date).sort(byTime);
}

export function afterSchoolFor(date) {
  return afterSchoolOn(list('afterschool'), date)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

/** 결재문구·내보내기에 쓰는 하루치 묶음 */
export function dayBundle(date, { onlyApproved = true } = {}) {
  return {
    date,
    activities: activitiesOn(date, { onlyApproved }),
    recurring: recurringOn(date).filter((r) => r.includeInNeis !== false),
    afterSchool: afterSchoolFor(date),
  };
}

export function periodBundle(from, to, opt = {}) {
  return range(from, to).map((d) => dayBundle(d, opt));
}

export function countPendingInRange(from, to) {
  return list('activities').filter((a) => a.status === 'pending' && a.date >= from && a.date <= to).length;
}

/** 그 날 그 주 시간표에 잡힌 칸들 (교과교담·특별실) */
export function timetableOn(date) {
  const wk = weekStart(date);
  const d = dow(date);
  return list('timetable')
    .filter((s) => s.week === wk && Number(s.dow) === d && s.title)
    .sort((a, b) => a.period - b.period);
}

/**
 * 그 날 '자리를 차지하는' 모든 것. 중복 판정은 이 목록 위에서 한다.
 * 교육활동만 보면 시간표와의 충돌을 놓친다.
 */
export function occupancyOn(date) {
  const acts = activitiesOn(date, { onlyApproved: false })
    .map((a) => ({ ...a, kind: 'activity' }));
  const recs = recurringOn(date).map((a) => ({ ...a, kind: 'recurring' }));
  const slots = timetableOn(date).map((s) => ({
    ...s, kind: 'timetable',
    time: `${s.period}교시`,
    id: `tt_${s.id}`,
  }));
  return [...acts, ...recs, ...slots];
}

/** 그 날의 중복 목록. Map(id → [{other, why}]) */
export function clashesOn(date) {
  return findClashes(occupancyOn(date));
}

/** 그 날 중복이 몇 건인지(항목 수 기준) */
export function clashCountOn(date) {
  return clashesOn(date).size;
}
