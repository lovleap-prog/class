// 일정 입력/수정 모달. 교사가 쓰면 '확인 대기', 관리자가 쓰면 바로 승인 가능.
import { h, openModal, toast } from '../lib/dom.js';
import { CATEGORY, STATUS, newActivity, today } from '../model.js';
import { put, audit, currentUser, isAdmin } from '../store.js';
import { bellList, defaultBell, dayBellId, bellById } from '../conflict.js';

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function openActivityForm(existing, { onSaved, defaultDate } = {}) {
  const isNew = !existing;
  const a = existing ? structuredClone(existing) : newActivity({ date: defaultDate || today() });
  const before = existing ? structuredClone(existing) : null;
  const me = currentUser();

  const inp = {};
  const mk = (key, attrs = {}) => (inp[key] = h('input', { class: 'input', value: a[key] || '', ...attrs }));

  const catSel = h('select', { class: 'input' },
    ...Object.entries(CATEGORY).map(([k, v]) =>
      h('option', { value: k, selected: a.category === k }, v)));
  const detail = h('textarea', { class: 'input', rows: 3 });
  detail.value = a.detail || '';

  const statusSel = h('select', { class: 'input' },
    ...Object.values(STATUS).map((s) =>
      h('option', { value: s.key, selected: a.status === s.key }, s.label)));

  // 수업공개처럼 그 학년만 다른 시정으로 움직이는 활동을 위한 칸.
  // 비워두면 그 날짜의 시정을 따른다.
  const bells = bellList();
  const bellSel = h('select', { class: 'input' },
    h('option', { value: '' }, '그 날 시정 따름'),
    ...bells.map((b) => h('option', { value: b.id, selected: a.bellId === b.id }, b.name)));

  // 배차 — 차를 불러야 하는 활동은 교무행정사가 미리 신청해야 한다.
  // 체크만 하고 내용을 비우면 정작 신청할 때 다시 물어봐야 하므로 칸을 같이 연다.
  const busChk = h('input', { type: 'checkbox', checked: !!a.needsBus });
  const busNote = h('input', {
    class: 'input', value: a.busNote || '',
    placeholder: '예) 9:00 출발, 순천만생태교육문화원, 3~4학년 48명',
  });
  const busWrap = h('div', { class: 'sub-field' },
    h('span', { class: 'field-label' }, '배차 내용'), busNote,
    h('span', { class: 'field-hint' }, '출발 시각 · 가는 곳 · 인원을 적어주세요.'));
  const syncBus = () => { busWrap.style.display = busChk.checked ? '' : 'none'; };
  busChk.addEventListener('change', syncBus);
  setTimeout(syncBus, 0);
  const busBox = h('div', { class: 'bus-box' },
    h('label', { class: 'check' }, busChk, '\u{1F68C} 배차가 필요합니다'),
    busWrap);

  const body = h('div', { class: 'form-grid' },
    field('날짜 *', mk('date', { type: 'date' })),
    field('종료일', mk('endDate', { type: 'date' }), '여러 날 이어지는 일정만'),
    field('시간/교시', mk('time', { placeholder: '예) 3교시, 10:00~11:40, 아침활동' })),
    field('분류', catSel),
    h('div', { class: 'span2' }, field('활동명 *', mk('title', { placeholder: '예) 3학년 소방안전교육' }))),
    field('대상', mk('target', { placeholder: '예) 3학년, 전교생' })),
    field('장소', mk('place', { placeholder: '예) 시청각실' })),
    field('담당', mk('owner', { placeholder: '예) 김민수' })),
    field('부서/계', mk('dept', { placeholder: '예) 교무기획부' })),
    bells.length > 1
      ? h('div', { class: 'span2' }, field('시정', bellSel,
        '수업공개처럼 이 활동만 다른 시정으로 움직일 때 고르세요. 비워두면 그 날 시정을 따릅니다.'))
      : null,
    h('div', { class: 'span2' }, field('세부 내용', detail)),
    h('div', { class: 'span2' }, busBox),
    isAdmin() ? h('div', { class: 'span2' }, field('처리 상태', statusSel, '관리자만 변경할 수 있습니다.')) : null,
  );

  const close = openModal(isNew ? '교육활동 추가' : '교육활동 수정', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: isNew ? (isAdmin() ? '등록' : '제출(확인 요청)') : '저장',
      class: 'btn-primary',
      onClick: async (c) => {
        const val = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!val('date')) return toast('날짜를 입력해 주세요.', 'warn');
        if (!val('title')) return toast('활동명을 입력해 주세요.', 'warn');
        if (busChk.checked && !busNote.value.trim()) {
          return toast('배차 내용을 적어주세요. 출발 시각과 가는 곳이 있어야 신청할 수 있습니다.', 'warn');
        }

        Object.assign(a, {
          date: val('date'),
          endDate: val('endDate') && val('endDate') > val('date') ? val('endDate') : '',
          time: val('time'), title: val('title'),
          target: val('target'), place: val('place'),
          owner: val('owner') || (isNew ? me.name : a.owner),
          dept: val('dept') || (isNew ? me.dept : a.dept),
          category: catSel.value,
          detail: detail.value.trim(),
          bellId: bellSel.value,
          needsBus: busChk.checked,
          busNote: busChk.checked ? busNote.value.trim() : '',
        });

        if (isNew) {
          a.createdBy = me.name;
          a.status = isAdmin() ? 'approved' : 'pending';
          if (isAdmin()) { a.reviewedBy = me.name; a.reviewedAt = new Date().toISOString(); }
        } else if (isAdmin()) {
          if (statusSel.value !== a.status) {
            a.status = statusSel.value;
            a.reviewedBy = me.name;
            a.reviewedAt = new Date().toISOString();
          }
          // 관리자의 오기재 수정 이력
          a.history = (a.history || []).concat([{
            at: new Date().toISOString(), by: me.name, action: '수정',
          }]);
        }

        await put('activities', a);
        await audit(isNew ? '등록' : '수정', a.id, before, a);
        toast(isNew ? (isAdmin() ? '등록했습니다.' : '제출했습니다. 관리자 확인을 기다립니다.') : '저장했습니다.', 'ok');
        c();
        if (onSaved) onSaved(a);
      },
    },
  ]);
  setTimeout(() => inp.title && inp.title.focus(), 40);
  return close;
}
