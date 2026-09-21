// 반복일정 탭 — 매주/격주/매월 반복되는 상시 활동을 따로 관리한다.
// 여기 등록한 항목은 일일·주간·월간 화면과 나이스 결재 문구에 자동으로 따라 들어간다.
import { h, openModal, toast, confirmDialog } from '../lib/dom.js';
import { CATEGORY, WEEKDAY, newRecurring, describeRule, today } from '../model.js';
import { list, put, remove, isAdmin, currentUser, audit } from '../store.js';

export function renderRecurring(ctx) {
  const rules = list('recurring').slice().sort((a, b) => String(a.time).localeCompare(String(b.time)));
  const refresh = () => ctx.refresh();

  return h('div', { class: 'view' },
    h('div', { class: 'datebar' },
      h('div', { class: 'datebar-nav' }, h('strong', { class: 'datebar-label' }, `반복 일정 ${rules.length}건`)),
      h('div', { class: 'datebar-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => openRuleForm(null, refresh) }, '+ 반복일정 추가'))),

    h('p', { class: 'note' },
      '아침독서·주간 다모임처럼 매번 반복되는 활동을 여기에 한 번만 등록하면, 일일·주간·월간 화면과 ',
      h('strong', {}, '나이스 결재 문구·메신저 안내문'),
      '에 자동으로 포함됩니다. 매일 다시 입력할 필요가 없습니다.'),

    rules.length
      ? h('div', { class: 'table-wrap' },
        h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {},
            ...['운영', '주기', '시간', '활동명', '대상', '장소', '담당', '결재문구', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, ...rules.map((r) => ruleRow(r, refresh)))))
      : h('div', { class: 'empty' }, '등록된 반복일정이 없습니다.'));
}

function ruleRow(r, refresh) {
  const toggle = async (key) => {
    await put('recurring', { ...r, [key]: !r[key] });
    refresh();
  };
  return h('tr', { class: r.active ? '' : 'row-off' },
    h('td', {}, h('button', {
      class: `toggle${r.active ? ' on' : ''}`, title: r.active ? '운영 중' : '중지됨',
      onClick: () => toggle('active'),
    }, r.active ? '운영' : '중지')),
    h('td', { class: 'nowrap' },
      describeRule(r),
      (r.exceptions || []).length
        ? h('button', {
          class: 'chip-sug is-click',
          title: `제외된 날짜: ${(r.exceptions || []).join(', ')}\n눌러서 되돌리기`,
          onClick: async () => {
            if (!(await confirmDialog(`제외해 둔 ${(r.exceptions || []).length}일을 모두 되돌릴까요?`, { okText: '되돌리기' }))) return;
            await put('recurring', { ...r, exceptions: [] });
            toast('제외를 모두 풀었습니다.', 'ok'); refresh();
          },
        }, `${(r.exceptions || []).length}일 제외`)
        : null),
    h('td', { class: 'nowrap' }, r.time || '—'),
    h('td', { class: 'strong' }, r.title),
    h('td', {}, r.target || ''),
    h('td', {}, r.place || ''),
    h('td', {}, r.owner || ''),
    h('td', {}, h('button', {
      class: `toggle${r.includeInNeis !== false ? ' on' : ''}`,
      title: '나이스 결재문구·메신저 안내에 포함할지',
      onClick: () => toggle('includeInNeis'),
    }, r.includeInNeis !== false ? '포함' : '제외')),
    h('td', { class: 'nowrap' },
      h('button', { class: 'icon-btn', title: '수정', onClick: () => openRuleForm(r, refresh) }, '✎'),
      h('button', {
        class: 'icon-btn danger', title: '삭제',
        onClick: async () => {
          if (!(await confirmDialog(`"${r.title}" 반복일정을 삭제할까요?`, { danger: true, okText: '삭제' }))) return;
          await audit('반복삭제', r.id, r, null);
          await remove('recurring', r.id);
          toast('삭제했습니다.', 'ok'); refresh();
        },
      }, '✕')));
}

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function openRuleForm(existing, onSaved) {
  const r = existing ? structuredClone(existing) : newRecurring({ startDate: today() });
  const inp = {};
  const mk = (k, attrs = {}) => (inp[k] = h('input', { class: 'input', value: r[k] || '', ...attrs }));

  const freqSel = h('select', { class: 'input' },
    ...[['weekly', '매주'], ['biweekly', '격주'], ['monthlyNth', '매월 n번째 요일'], ['monthlyDate', '매월 지정일'], ['daily', '매일']]
      .map(([k, v]) => h('option', { value: k, selected: r.freq === k }, v)));

  const wdBoxes = WEEKDAY.map((w, i) =>
    h('label', { class: 'wd' },
      h('input', { type: 'checkbox', checked: (r.weekdays || []).includes(i) }), w));

  const nthInput = h('input', { class: 'input', value: (r.nth || []).join(','), placeholder: '예) 1,3' });

  const catSel = h('select', { class: 'input' },
    ...Object.entries(CATEGORY).map(([k, v]) => h('option', { value: k, selected: r.category === k }, v)));

  const neisCb = h('input', { type: 'checkbox', checked: r.includeInNeis !== false });
  const note = h('textarea', { class: 'input', rows: 2 }); note.value = r.note || '';

  const wdRow = h('div', { class: 'wd-row' }, ...wdBoxes);
  const nthField = field('몇 번째 / 며칠', nthInput, '쉼표로 구분. 매월 지정일이면 날짜(예 1,15)');

  const syncVisibility = () => {
    const f = freqSel.value;
    wdRow.parentNode.style.display = (f === 'daily' || f === 'monthlyDate') ? 'none' : '';
    nthField.style.display = (f === 'monthlyNth' || f === 'monthlyDate') ? '' : 'none';
  };
  freqSel.addEventListener('change', syncVisibility);

  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, field('활동명 *', mk('title', { placeholder: '예) 아침 독서활동' }))),
    field('반복 주기', freqSel),
    field('시간', mk('time', { placeholder: '예) 08:40~09:00' })),
    h('div', { class: 'span2' }, field('요일', wdRow)),
    nthField,
    field('분류', catSel),
    field('대상', mk('target', { placeholder: '예) 전교생' })),
    field('장소', mk('place')),
    field('담당', mk('owner')),
    field('부서/계', mk('dept')),
    field('시작일', mk('startDate', { type: 'date' })),
    field('종료일', mk('endDate', { type: 'date' }), '학기 말 등. 비우면 계속'),
    h('div', { class: 'span2' }, field('메모', note)),
    h('div', { class: 'span2' },
      h('label', { class: 'check' }, neisCb, '나이스 결재문구·메신저 안내문에 포함')));

  setTimeout(syncVisibility, 0);

  openModal(existing ? '반복일정 수정' : '반복일정 추가', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: '저장', class: 'btn-primary',
      onClick: async (c) => {
        const val = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!val('title')) return toast('활동명을 입력해 주세요.', 'warn');
        const weekdays = wdBoxes.map((l, i) => (l.firstChild.checked ? i : -1)).filter((i) => i >= 0);
        const freq = freqSel.value;
        if ((freq === 'weekly' || freq === 'biweekly' || freq === 'monthlyNth') && !weekdays.length) {
          return toast('요일을 하나 이상 선택해 주세요.', 'warn');
        }
        const nth = nthInput.value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
        if ((freq === 'monthlyNth' || freq === 'monthlyDate') && !nth.length) {
          return toast('몇 번째(또는 며칠)인지 입력해 주세요.', 'warn');
        }
        Object.assign(r, {
          title: val('title'), freq, weekdays, nth,
          time: val('time'), target: val('target'), place: val('place'),
          owner: val('owner') || currentUser().name, dept: val('dept'),
          category: catSel.value,
          startDate: val('startDate') || today(), endDate: val('endDate'),
          note: note.value.trim(), includeInNeis: neisCb.checked,
          createdBy: r.createdBy || currentUser().name,
        });
        await put('recurring', r);
        await audit(existing ? '반복수정' : '반복등록', r.id, existing || null, r);
        toast('저장했습니다.', 'ok');
        c(); if (onSaved) onSaved();
      },
    },
  ]);
}

export { isAdmin };
