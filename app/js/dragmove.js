// 주간·월간에서 일정을 끌어다 날짜 옮기기
//
// 승인 흐름을 건너뛰지 않는 것이 핵심이다.
//   관리자  → 바로 옮기고 이력을 남긴다.
//   교사    → 옮긴 뒤 '확인 대기' 로 되돌려 관리자 승인을 받는다.
//            원래 날짜를 prevDate 에 적어두어, 반려되면 되돌릴 수 있게 한다.
//
// 손가락 조작(휴대전화)은 HTML5 끌어놓기를 지원하지 않는다.
// 그쪽에서는 카드를 눌러 [수정] 으로 날짜를 바꾸면 된다.
import { toast, confirmDialog } from './lib/dom.js';
import { fmtK, parseYmd, addDays, ymd } from './model.js';
import { get, put, audit, isAdmin, currentUser } from './store.js';

const dayDiff = (from, to) => Math.round((parseYmd(to) - parseYmd(from)) / 864e5);

/** 이 사람이 이 일정을 옮길 수 있나 */
export function canMove(a) {
  if (!a || a.isRecurring || a.source === 'recurring') return false;
  return isAdmin() || a.createdBy === currentUser().name;
}

export function makeDraggable(el, a) {
  if (!canMove(a)) return el;
  el.setAttribute('draggable', 'true');
  el.classList.add('is-draggable');
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', a.id);
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
    document.body.classList.add('dragging-now');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    document.body.classList.remove('dragging-now');
  });
  return el;
}

export function makeDropTarget(el, day, onDone) {
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-on');
  });
  el.addEventListener('dragleave', (e) => {
    // 자식 위로 옮겨갈 때도 dragleave 가 오므로 진짜 벗어났을 때만 지운다.
    if (!el.contains(e.relatedTarget)) el.classList.remove('drop-on');
  });
  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drop-on');
    document.body.classList.remove('dragging-now');
    const id = e.dataTransfer.getData('text/plain');
    if (id) await moveActivity(id, day, onDone);
  });
  return el;
}

export async function moveActivity(id, toDate, onDone) {
  const a = get('activities', id);
  if (!a) return;
  if (!canMove(a)) { toast('이 일정은 옮길 권한이 없습니다.', 'warn'); return; }
  if (a.date === toDate) return;

  const me = currentUser();
  const before = structuredClone(a);
  // 기간 일정은 길이를 유지한 채 통째로 옮긴다.
  const span = a.endDate && a.endDate > a.date ? dayDiff(a.date, a.endDate) : 0;
  const next = {
    ...a,
    date: toDate,
    endDate: span ? addDays(toDate, span) : '',
  };
  const label = `${fmtK(a.date, { year: false })} → ${fmtK(toDate, { year: false })}`;

  if (isAdmin()) {
    next.history = (a.history || []).concat([{
      at: new Date().toISOString(), by: me.name, action: `날짜 이동 ${label}`,
    }]);
    await put('activities', next);
    await audit('날짜이동', a.id, before, next);
    toast(`'${a.title}' 을(를) ${fmtK(toDate, { year: false })} 로 옮겼습니다.`, 'ok');
    if (onDone) onDone();
    return;
  }

  // 교사가 승인된 일정을 옮기면 다시 확인을 받아야 한다.
  const needsApproval = a.status === 'approved';
  if (needsApproval) {
    const ok = await confirmDialog(
      `'${a.title}' 을(를) ${label} 로 옮깁니다.\n이미 승인된 일정이라 관리자 확인을 다시 받습니다.`,
      { okText: '변경 요청' });
    if (!ok) return;
    next.status = 'pending';
    next.prevDate = a.date;
    next.prevEndDate = a.endDate || '';
    next.changeNote = `날짜 변경 요청 ${label}`;
    next.reviewedBy = '';
    next.reviewedAt = '';
  }
  next.history = (a.history || []).concat([{
    at: new Date().toISOString(), by: me.name, action: `날짜 이동 ${label}`,
  }]);
  await put('activities', next);
  await audit(needsApproval ? '날짜변경요청' : '날짜이동', a.id, before, next);
  toast(needsApproval
    ? `변경을 요청했습니다. 관리자 승인 후 반영됩니다.`
    : `${fmtK(toDate, { year: false })} 로 옮겼습니다.`, 'ok');
  if (onDone) onDone();
}

/** 반려됐을 때 날짜 변경 요청을 원래대로 되돌린다. */
export function revertDateChange(a) {
  if (!a.prevDate) return null;
  return {
    ...a,
    date: a.prevDate,
    endDate: a.prevEndDate || '',
    prevDate: '', prevEndDate: '', changeNote: '',
    status: 'approved',   // 원래 승인돼 있던 일정이므로 승인 상태로 되돌린다
  };
}

export { ymd };
