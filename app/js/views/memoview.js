// 개인 메모 — 바탕화면 스티커 + 체크리스트 + 기간이 있는 할 일
import { h, toast, confirmDialog, clear } from '../lib/dom.js';
import { fmtK, today } from '../model.js';
import { MEMO_COLORS, memoList, addMemo, updateMemo, removeMemo, clearDoneMemos, memoCounts } from '../memo.js';

/** 메모 한 장 */
export function memoCard(m, onChange, { compact = false } = {}) {
  const ta = h('textarea', { class: 'memo-text', rows: 1 });
  ta.value = m.text;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  setTimeout(grow, 0);
  ta.addEventListener('input', grow);
  ta.addEventListener('change', async () => {
    const v = ta.value.trim();
    if (!v) { await removeMemo(m.id); toast('빈 메모를 지웠습니다.'); }
    else await updateMemo(m.id, { text: v });
    if (onChange) onChange();
  });

  const range = m.date
    ? `${fmtK(m.date, { year: false })}${m.endDate && m.endDate > m.date ? ` ~ ${fmtK(m.endDate, { year: false })}` : ''}`
    : '';
  const overdue = m.date && !m.done && (m.endDate || m.date) < today();

  return h('div', { class: `memo color-${m.color || 'yellow'}${m.done ? ' is-done' : ''}${m.pinned ? ' is-pinned' : ''}` },
    h('div', { class: 'memo-head' },
      m.checklist
        ? h('label', { class: 'memo-check', title: m.done ? '되돌리기' : '했음으로 표시' },
          h('input', {
            type: 'checkbox', checked: !!m.done,
            onChange: async (e) => { await updateMemo(m.id, { done: e.target.checked }); if (onChange) onChange(); },
          }))
        : null,
      range ? h('span', { class: `memo-date${overdue ? ' is-over' : ''}` }, range, overdue ? ' · 지남' : '') : null,
      h('div', { class: 'memo-tools' },
        h('button', {
          class: `icon-btn${m.pinned ? ' on' : ''}`, title: m.pinned ? '고정 풀기' : '위에 고정',
          onClick: async () => { await updateMemo(m.id, { pinned: !m.pinned }); if (onChange) onChange(); },
        }, '\u{1F4CC}'),
        !compact ? h('button', {
          class: 'icon-btn', title: m.checklist ? '체크리스트 끄기' : '체크리스트로',
          onClick: async () => { await updateMemo(m.id, { checklist: !m.checklist, done: false }); if (onChange) onChange(); },
        }, '✓') : null,
        !compact ? colorPicker(m, onChange) : null,
        h('button', {
          class: 'icon-btn danger', title: '지우기',
          onClick: async () => {
            if (m.text && !(await confirmDialog('이 메모를 지울까요?', { danger: true, okText: '지우기' }))) return;
            await removeMemo(m.id); if (onChange) onChange();
          },
        }, '✕'))),
    ta,
    // 날짜 입력을 머리줄에 두면 자리를 다 잡아먹는다. 아래로 내렸다.
    !compact ? dateBtn(m, onChange) : null);
}

function colorPicker(m, onChange) {
  const keys = Object.keys(MEMO_COLORS);
  return h('button', {
    class: 'icon-btn', title: '색 바꾸기',
    onClick: async () => {
      const next = keys[(keys.indexOf(m.color || 'yellow') + 1) % keys.length];
      await updateMemo(m.id, { color: next });
      if (onChange) onChange();
    },
  }, '◐');
}

/** 기간 입력. 날짜가 없으면 접어두고 '기간 넣기' 만 보여준다. */
function dateBtn(m, onChange) {
  if (!m.date) {
    return h('button', {
      class: 'memo-addrange',
      title: '기간을 넣으면 일일·주간·월간 화면에 함께 뜹니다',
      onClick: async () => { await updateMemo(m.id, { date: today() }); if (onChange) onChange(); },
    }, '+ 기간 넣기');
  }
  const inp = h('input', {
    type: 'date', class: 'memo-datepick', value: m.date, title: '시작일',
    onChange: async (e) => { await updateMemo(m.id, { date: e.target.value }); if (onChange) onChange(); },
  });
  const inp2 = h('input', {
    type: 'date', class: 'memo-datepick', value: m.endDate || '', title: '끝나는 날(선택)',
    onChange: async (e) => { await updateMemo(m.id, { endDate: e.target.value }); if (onChange) onChange(); },
  });
  return h('div', { class: 'memo-dates' },
    inp, h('span', { class: 'memo-tilde' }, '~'), inp2,
    h('button', {
      class: 'memo-addrange', title: '기간 없애기',
      onClick: async () => { await updateMemo(m.id, { date: '', endDate: '' }); if (onChange) onChange(); },
    }, '✕'));
}

/** 메모 목록 전체 (스티커 패널과 일일 화면에서 함께 쓴다) */
export function memoPanel(onChange, { compact = false, filter = null, emptyText = '' } = {}) {
  const wrap = h('div', { class: 'memo-wrap' });
  const draw = () => {
    clear(wrap);
    const all = filter ? filter() : memoList();
    if (!all.length) {
      wrap.appendChild(h('div', { class: 'empty' }, emptyText || '메모가 없습니다. 아래에서 새로 적어보세요.'));
    } else {
      for (const m of all) wrap.appendChild(memoCard(m, onChange, { compact }));
    }
  };
  draw();
  return wrap;
}

/** 새 메모 입력줄 */
export function memoComposer(onChange, seed = {}) {
  const ta = h('textarea', { class: 'input', rows: 2, placeholder: '메모를 적으세요. 엔터로 저장, Shift+엔터로 줄바꿈.' });
  const asCheck = h('input', { type: 'checkbox' });
  const save = async () => {
    const v = ta.value.trim();
    if (!v) return;
    await addMemo({ ...seed, text: v, checklist: asCheck.checked });
    ta.value = '';
    toast('메모를 적었습니다.', 'ok');
    if (onChange) onChange();
  };
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
  });
  return h('div', { class: 'memo-composer' },
    ta,
    h('div', { class: 'row gap' },
      h('label', { class: 'check' }, asCheck, '체크리스트로'),
      h('button', { class: 'btn btn-primary btn-sm', onClick: save }, '메모 추가')));
}

export { memoCounts, clearDoneMemos };
