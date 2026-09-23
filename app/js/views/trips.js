// 출장 현황 탭 — 개인이 신청하고, 보결이 필요하면 표시한다.
//
// 보결은 남이 대신 들어가 줘야 하는 일이라 '몇 교시에 필요한지' 가 핵심이다.
// 그래서 보결 체크와 메모란을 눈에 띄게 뒀다.
import { h, openModal, toast, confirmDialog, promptDialog, labeledChips } from '../lib/dom.js';
import { newTrip, fmtK, today, addDays, weekStart, STATUS } from '../model.js';
import { list, put, remove, isAdmin, currentUser, audit } from '../store.js';

const RANGES = [
  ['upcoming', '앞으로'],
  ['month', '이번 달'],
  ['all', '전체'],
  ['mine', '내 신청'],
];

export function renderTrips(ctx) {
  const st = ctx.state.trips || (ctx.state.trips = { range: 'upcoming' });
  const me = currentUser();
  const admin = isAdmin();
  const refresh = () => ctx.refresh();
  const all = list('trips');

  const t0 = today();
  const monthPrefix = t0.slice(0, 7);
  const rows = all.filter((x) => {
    if (st.range === 'mine') return x.applicant === me.name;
    if (st.range === 'month') return String(x.date).slice(0, 7) === monthPrefix;
    if (st.range === 'upcoming') return (x.endDate || x.date) >= t0;
    return true;
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const pending = all.filter((x) => x.status === 'pending');
  const needSub = rows.filter((x) => x.needsSub && x.status !== 'rejected');

  return h('div', { class: 'view' },
    h('div', { class: 'datebar' },
      h('div', { class: 'datebar-nav' },
        h('div', { class: 'seg' }, ...RANGES.map(([k, label]) => h('button', {
          class: `seg-btn${st.range === k ? ' on' : ''}`,
          onClick: () => { st.range = k; refresh(); },
        }, label))),
        pending.length ? h('span', { class: 'clash-count' }, `확인 대기 ${pending.length}건`) : null,
        needSub.length ? h('span', { class: 'sub-count' }, `보결 필요 ${needSub.length}건`) : null),
      h('div', { class: 'datebar-actions' },
        h('button', { class: 'btn btn-primary', onClick: () => openTripForm(null, refresh) }, '+ 출장 신청'))),

    needSub.length
      ? h('section', { class: 'sec sec-sub' },
        h('div', { class: 'sec-head' },
          h('h3', {}, `\u{1F464} 보결이 필요한 출장 ${needSub.length}건`),
          h('span', { class: 'muted small' }, '몇 교시에 누가 들어갈지 정해야 합니다')),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {}, ...['날짜', '신청자', '사유', '보결 내용'].map((x) => h('th', {}, x)))),
            h('tbody', {}, ...needSub.map((x) => h('tr', {},
              h('td', { class: 'nowrap' }, fmtK(x.date, { year: false })),
              h('td', { class: 'strong' }, x.applicant),
              h('td', {}, x.reason),
              h('td', { class: 'sub-note' }, x.subNote || h('span', { class: 'warn-text' }, '교시 미기재')))))))) 
      : null,

    rows.length
      ? h('div', {}, ...rows.map((x) => tripCard(x, me, admin, refresh)))
      : h('div', { class: 'empty' }, '해당하는 출장이 없습니다.'));
}

function tripCard(x, me, admin, refresh) {
  const mine = x.applicant === me.name;
  const canEdit = admin || (mine && x.status === 'pending');
  const s = STATUS[x.status];
  const span = x.endDate && x.endDate > x.date;

  return h('div', { class: `card trip-card st-${x.status}${x.needsSub ? ' need-sub' : ''}` },
    h('div', { class: 'card-time' },
      fmtK(x.date, { year: false }),
      span ? h('span', { class: 'muted small' }, `~ ${fmtK(x.endDate, { year: false })}`) : null,
      x.time ? h('span', { class: 'muted small' }, x.time) : null),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, x.reason || '(사유 없음)'),
        s ? h('span', { class: `badge ${s.cls}` }, s.label) : null,
        x.needsSub ? h('span', { class: 'badge badge-sub' }, '보결 필요') : null),
      labeledChips([['신청', x.applicant], ['계', x.dept], ['장소', x.place]]),
      x.needsSub
        ? h('p', { class: 'trip-sub' }, '보결: ', x.subNote || h('span', { class: 'warn-text' }, '몇 교시인지 적어주세요'))
        : null,
      x.status === 'rejected' && x.rejectReason
        ? h('p', { class: 'card-reject' }, `반려 사유: ${x.rejectReason}`) : null),
    h('div', { class: 'card-actions' },
      admin && x.status === 'pending'
        ? h('button', {
          class: 'btn btn-sm btn-primary',
          onClick: async () => {
            const after = { ...x, status: 'approved', reviewedBy: me.name, reviewedAt: new Date().toISOString(), rejectReason: '' };
            await put('trips', after);
            await audit('출장승인', x.id, x, after);
            toast('승인했습니다.', 'ok'); refresh();
          },
        }, '승인')
        : null,
      admin && x.status === 'pending'
        ? h('button', {
          class: 'btn btn-sm btn-danger',
          onClick: async () => {
            const why = await promptDialog('반려 사유를 적어주세요.', { placeholder: '예) 같은 날 학교 행사가 있습니다.' });
            if (why === null) return;
            const after = { ...x, status: 'rejected', rejectReason: why, reviewedBy: me.name, reviewedAt: new Date().toISOString() };
            await put('trips', after);
            await audit('출장반려', x.id, x, after);
            toast('반려했습니다.', 'ok'); refresh();
          },
        }, '반려')
        : null,
      canEdit ? h('button', { class: 'icon-btn', title: '수정', onClick: () => openTripForm(x, refresh) }, '✎') : null,
      canEdit ? h('button', {
        class: 'icon-btn danger', title: '삭제',
        onClick: async () => {
          if (!(await confirmDialog('이 출장 신청을 지울까요?', { danger: true, okText: '지우기' }))) return;
          await remove('trips', x.id); toast('지웠습니다.', 'ok'); refresh();
        },
      }, '✕') : null));
}

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function openTripForm(existing, onSaved) {
  const me = currentUser();
  const x = existing ? structuredClone(existing) : newTrip({
    date: today(), applicant: me.name, dept: me.dept,
  });
  const inp = {};
  const mk = (k, attrs = {}) => (inp[k] = h('input', { class: 'input', value: x[k] || '', ...attrs }));

  const subCb = h('input', { type: 'checkbox', checked: !!x.needsSub });
  const subNote = h('textarea', {
    class: 'input', rows: 2,
    placeholder: '예) 3~4교시 3학년 2반 수학, 5교시 체육관 이동 지도',
  });
  subNote.value = x.subNote || '';
  const subWrap = h('div', { class: 'span2 sub-wrap' },
    field('보결 내용 (몇 교시에 무엇이 필요한지)', subNote,
      '이 내용을 보고 보결 교사를 정합니다. 교시와 학급을 꼭 적어주세요.'));
  const syncSub = () => { subWrap.style.display = subCb.checked ? '' : 'none'; };
  subCb.addEventListener('change', syncSub);
  setTimeout(syncSub, 0);

  const body = h('div', { class: 'form-grid' },
    field('출장일 *', mk('date', { type: 'date' })),
    field('종료일', mk('endDate', { type: 'date' }), '여러 날일 때만'),
    field('시간', mk('time', { placeholder: '예) 종일, 오후, 3~6교시' })),
    field('장소', mk('place', { placeholder: '예) 교육지원청' })),
    h('div', { class: 'span2' }, field('출장 사유 *', mk('reason', { placeholder: '예) 교육과정 담당자 협의회' }))),
    field('신청자', mk('applicant')),
    field('부서/계', mk('dept')),
    h('div', { class: 'span2 sub-toggle' },
      h('label', { class: 'check' }, subCb, h('strong', {}, '보결이 필요합니다'))),
    subWrap);

  openModal(existing ? '출장 신청 수정' : '출장 신청', body, [
    { label: '취소', onClick: (c) => c() },
    {
      label: existing ? '저장' : '신청', class: 'btn-primary',
      onClick: async (c) => {
        const v = (k) => (inp[k] ? inp[k].value.trim() : '');
        if (!v('date')) return toast('출장일을 입력해 주세요.', 'warn');
        if (!v('reason')) return toast('출장 사유를 입력해 주세요.', 'warn');
        if (subCb.checked && !subNote.value.trim()) {
          return toast('보결이 필요하면 몇 교시인지 적어주세요.', 'warn');
        }
        const after = {
          ...x,
          date: v('date'),
          endDate: v('endDate') && v('endDate') > v('date') ? v('endDate') : '',
          time: v('time'), place: v('place'), reason: v('reason'),
          applicant: v('applicant') || me.name, dept: v('dept'),
          needsSub: subCb.checked, subNote: subCb.checked ? subNote.value.trim() : '',
        };
        if (!existing) after.status = isAdmin() ? 'approved' : 'pending';
        await put('trips', after);
        await audit(existing ? '출장수정' : '출장신청', after.id, existing || null, after);
        toast(existing ? '저장했습니다.' : (after.status === 'approved' ? '등록했습니다.' : '신청했습니다. 관리자 확인을 기다립니다.'), 'ok');
        c(); if (onSaved) onSaved();
      },
    },
  ]);
}

/** 그 날짜의 출장 (일일 화면에서 쓴다) */
export function tripsOn(date) {
  return list('trips')
    .filter((x) => x.status !== 'rejected')
    .filter((x) => {
      const e = x.endDate && x.endDate > x.date ? x.endDate : x.date;
      return date >= x.date && date <= e;
    });
}

export { weekStart, addDays };
