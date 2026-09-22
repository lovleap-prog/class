// 개인 메모 — 본인에게만 보인다
//
// 체크(checks.js)와 같은 방식이다. 사람마다 문서 하나를 두고 그 안에 메모를 담는다.
// 남의 메모가 섞이지 않고, 파이어스토어 규칙으로 본인 문서만 읽고 쓰게 막을 수 있다.
//
// 메모는 세 가지로 쓴다.
//   그냥 메모      — 바탕화면 스티커처럼
//   체크리스트     — 체크하면 줄이 그어진다
//   기간이 있는 것 — 날짜를 적으면 일일·주간·월간 화면에 함께 뜬다(스케줄러)
import { list, put, currentUser } from './store.js';
import { newMemo, occursOn } from './model.js';

export const MEMO_COLORS = {
  yellow: '노랑', blue: '파랑', green: '초록', pink: '분홍', gray: '회색',
};

function myId() {
  const u = currentUser();
  return u.uid || u.name || 'anon';
}

export function myMemoDoc() {
  const found = list('memos').find((d) => d.id === myId());
  return found || { id: myId(), owner: currentUser().name || '', items: [] };
}

export function memoList() {
  const items = (myMemoDoc().items || []).slice();
  return items.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (!!a.done !== !!b.done) return a.done ? 1 : -1;
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    if (!!a.date !== !!b.date) return a.date ? -1 : 1;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

async function saveItems(items) {
  const doc = myMemoDoc();
  await put('memos', { ...doc, owner: currentUser().name || '', items });
}

export async function addMemo(partial) {
  const item = newMemo(partial);
  await saveItems([...(myMemoDoc().items || []), item]);
  return item;
}

export async function updateMemo(id, patch) {
  await saveItems((myMemoDoc().items || []).map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

export async function removeMemo(id) {
  await saveItems((myMemoDoc().items || []).filter((m) => m.id !== id));
}

export async function clearDoneMemos() {
  const items = myMemoDoc().items || [];
  const left = items.filter((m) => !m.done);
  await saveItems(left);
  return items.length - left.length;
}

/** 그 날짜에 걸리는 내 메모 (기간을 적어둔 것만) */
export function memosOn(date) {
  return memoList().filter((m) => m.date && occursOn(m, date));
}

/** 기간이 [from, to] 와 겹치는 내 메모 */
export function memosBetween(from, to) {
  return memoList().filter((m) => m.date && m.date <= to && (m.endDate || m.date) >= from);
}

export function memoCounts() {
  const all = memoList();
  return { total: all.length, open: all.filter((m) => !m.done).length };
}
