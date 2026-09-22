// 방과후학교 탭 — 강좌를 표로 깔끔하게 보여주고, 표 그대로 한글/엑셀로 내보낸다.
import { h, openModal, toast, confirmDialog } from '../lib/dom.js';
import { WEEKDAY, newAfterSchool } from '../model.js';
import { list, put, remove, audit, currentUser } from '../store.js';
import { openAfterSchoolExport } from '../ui/exporter.js';

const COLS = [
  ['요일', (p) => (p.weekdays || []).map((w) => WEEKDAY[w]).join('·')],
  ['시간', (p) => p.time || ''],
  ['강좌명', (p) => p.name || '', 'strong'],
  ['대상', (p) => p.grade || ''],
  ['장소', (p) => p.room || ''],
  ['강사', (p) => p.teacher || ''],
  ['정원', (p) => p.capacity || ''],
  ['현원', (p) => p.enrolled || ''],
  ['수강료', (p) => p.fee || ''],
  ['비고', (p) => p.note || ''],
];

export function renderAfterSchool(ctx) {
  const all = list('afterschool');
  const refresh = () => ctx.refresh();

  let filterWd = ctx.state.asWeekday ?? -1;
  const shown = all
    .filter((p) => filterWd < 0 || (p.weekdays || []).includes(filterWd))
    .sort((a, b) => {
      const wa = Math.min(...((a.weekdays || []).length ? a.weekdays : [9]));
      const wb = Math.min(...((b.weekdays || []).length ? b.weekdays : [9]));
      return wa - wb || String(a.time).localeCompare(String(b.time)) || String(a.name).localeCompare(String(b.name), 'ko');
    });

  const totalEnrolled = all.reduce((s, p) => s + (Number(p.enrolled) || 0), 0);

  return h('div', { class: 'view' },
    h('div', { class: 'datebar' },
      h('div', { class: 'datebar-nav' },
        h('strong', { class: 'datebar-label' }, `방과후학교 ${all.length}강좌`),
        h('span', { class: 'muted small' }, totalEnrolled ? `수강 ${totalEnrolled}명` : '')),
      h('div', { class: 'datebar-actions' },
        h('button', { class: 'btn', onClick: () => openAfterSchoolExport(shown) }, '표 내보내기'),
        h('button', { class: 'btn btn-primary', onClick: () => openProgramForm(null, refresh) }, '+ 강좌 추가'))),

    h('div', { class: 'seg' },
      ...[['전체', -1], ...WEEKDAY.map((w, i) => [w, i]).slice(1, 6)].map(([label, wd]) =>
        h('button', {
          class: `seg-btn${filterWd === wd ? ' on' : ''}`,
          onClick: () => { ctx.state.asWeekday = wd; refresh(); },
        }, label))),

    shown.length
      ? h('div', { class: 'table-wrap' },
        h('table', { class: 'tbl tbl-zebra' },
          h('thead', {}, h('tr', {}, ...COLS.map(([t]) => h('th', {}, t)), h('th', {}, ''))),
          h('tbody', {}, ...shown.map((p) => h('tr', { class: p.active === false ? 'row-off' : '' },
            ...COLS.map(([, get, cls]) => h('td', { class: cls || '' }, get(p))),
            h('td', { class: 'nowrap' },
              h('button', { class: 'icon-btn', title: '수정', onClick: () => openProgramForm(p, refresh) }, '✎'),
              h('button', {
                class: 'icon-btn danger', title: '삭제',
                onClick: async () => {
                  if (!(await confirmDialog(`"${p.name}" 강좌를 삭제할까요?`, { danger: true, okText: '삭제' }))) return;
                  await audit('방과후삭제', p.id, p, null);
                  await remove('afterschool', p.id);
                  toast('삭제했습니다.', 'ok'); refresh();
                },
              }, '✕')))))))
      : h('div', { class: 'empty' }, '등록된 강좌가 없습니다. [불러오기] 탭에서 엑셀·hwpx 표를 통째로 올릴 수도 있습니다.'));
}

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function openProgramForm(existing, onSaved) {
  const p = existing ? structuredClone(existing) : newAfterSchool();
  const inp = {};
  const mk = (k, attrs = {}) => (inp[k] = h('input', { class: 'input', value: p[k] || '', ...attrs }));
  const wdBoxes = WEEKDAY.map((w, i) =>
    h('label', { class: 'wd' }, h('input', { type: 'checkbox', checked: (p.weekdays || []).includes(i) }), w));
  const activeCb = h('input', { type: 'checkbox', checked: p.active !== false });
  const note = h('textarea', { class: 'input', rows: 2 }); note.value = p.note || '';

  const body = h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, field('강좌명 *', mk('name', { placeholder: '예) 창의로봇과학' }))),
    h('div', { class: 'span2' }, field('운영 요일', h('div', { class: 'wd-row' }, ...wdBoxes))),
    field('시간', mk('time', { placeholder: '예) 15:00~16:40' })),
    field('대상', mk('grade', { placeholder: '예) 3~4학년' })),
    field('장소', mk('room', { placeholder: '예) 과학실' })),
    field('강사', mk('teacher')),
    field('정원', mk('capacity', { type: 'number', min: '0' })),
    field('현원', mk('enrolled', { type: 'number', min: '0' })),
    field('수강료', mk('fee', { placeholder: '예) 무료 / 30,000원' })),
    field('운영 기간', mk('term', { placeholder: '예) 2026학년도 1학기' })),
    h('div', { class: 'span2' }, field('비고', note)),
    h('div', { class: 'span2' }, h('label', { class: 'check' }, activeCb, '운영 중')));

  openModal(existing ? '강좌 수정' : '강좌 추가', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: '저장', class: 'btn-primary',
      onClick: async (c) => {
        const val = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!val('name')) return toast('강좌명을 입력해 주세요.', 'warn');
        Object.assign(p, {
          name: val('name'), time: val('time'), grade: val('grade'), room: val('room'),
          teacher: val('teacher'), capacity: val('capacity'), enrolled: val('enrolled'),
          fee: val('fee'), term: val('term'), note: note.value.trim(),
          weekdays: wdBoxes.map((l, i) => (l.firstChild.checked ? i : -1)).filter((i) => i >= 0),
          active: activeCb.checked,
          updatedBy: currentUser().name,
        });
        await put('afterschool', p);
        await audit(existing ? '방과후수정' : '방과후등록', p.id, existing || null, p);
        toast('저장했습니다.', 'ok');
        c(); if (onSaved) onSaved();
      },
    },
  ]);
}
