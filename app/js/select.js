// 화면들이 공통으로 쓰는 조회 함수 모음
import { list } from './store.js';
import { expandRecurring, afterSchoolOn, occursOn, byTime, range } from './model.js';

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
