// 개인 체크 표시 — "내가 이 일정을 확인/처리했다"
//
// 일정 문서 자체를 건드리지 않는다. 체크는 사람마다 다르고, 한 사람이 체크했다고
// 다른 선생님 화면의 일정이 바뀌면 안 되기 때문이다.
// 그래서 사람별로 문서를 따로 두고(문서 id = 그 사람), 그 안에 체크한 항목만 담는다.
// 같은 사람이 컴퓨터와 휴대전화에서 봐도 체크 상태는 따라간다.
import { list, put, currentUser } from './store.js';

/** 이 사람의 체크 문서 id. 구글 로그인 시 uid, 로컬 모드면 이름. */
function myId() {
  const u = currentUser();
  return u.uid || u.name || 'anon';
}

export function myChecks() {
  const found = list('checks').find((d) => d.id === myId());
  return found || { id: myId(), owner: currentUser().name || '', items: {} };
}

/** 같은 일정이라도 날짜별로 따로 체크한다(여러 날 이어지는 일정·반복일정 때문). */
export const checkKey = (date, a) => `${date}|${a.id}`;

export function isChecked(date, a) {
  if (!date) return false;
  return !!(myChecks().items || {})[checkKey(date, a)];
}

export async function toggleCheck(date, a) {
  const doc = myChecks();
  const items = { ...(doc.items || {}) };
  const k = checkKey(date, a);
  if (items[k]) delete items[k];
  else items[k] = new Date().toISOString();
  await put('checks', { ...doc, owner: currentUser().name || '', items });
}

/** 그 날짜의 내 체크만 지운다. */
export async function clearChecks(date) {
  const doc = myChecks();
  const prefix = `${date}|`;
  const items = {};
  for (const [k, v] of Object.entries(doc.items || {})) {
    if (!k.startsWith(prefix)) items[k] = v;
  }
  await put('checks', { ...doc, owner: currentUser().name || '', items });
}

export function countChecked(date, activities) {
  const mine = myChecks().items || {};
  return activities.filter((a) => mine[checkKey(date, a)]).length;
}
