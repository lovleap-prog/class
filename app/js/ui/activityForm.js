// 일정 입력/수정 모달. 교사가 쓰면 '확인 대기', 관리자가 쓰면 바로 승인 가능.
import { h, openModal, toast } from '../lib/dom.js';
import { CATEGORY, STATUS, newActivity, today } from '../model.js';
import { put, audit, currentUser, isAdmin } from '../store.js';

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
    h('div', { class: 'span2' }, field('세부 내용', detail)),
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

        Object.assign(a, {
          date: val('date'),
          endDate: val('endDate') && val('endDate') > val('date') ? val('endDate') : '',
          time: val('time'), title: val('title'),
          target: val('target'), place: val('place'),
          owner: val('owner') || (isNew ? me.name : a.owner),
          dept: val('dept') || (isNew ? me.dept : a.dept),
          category: catSel.value,
          detail: detail.value.trim(),
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
