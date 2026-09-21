// 일일 · 주간 · 월간 화면
import { h, confirmDialog, toast } from '../lib/dom.js';
import {
  CATEGORY, STATUS, WEEKDAY, fmtK, today, addDays, addMonths,
  weekStart, monthStart, monthEnd, range, parseYmd, isWeekend, ymd,
} from '../model.js';
import { activitiesOn, recurringOn, afterSchoolFor, dayBundle } from '../select.js';
import { openActivityForm } from '../ui/activityForm.js';
import { openDayExport, openPeriodExport } from '../ui/exporter.js';
import { isAdmin, put, remove, audit, currentUser, list } from '../store.js';

// ── 공통 조각 ───────────────────────────────────────────────
export function statusBadge(a) {
  const s = STATUS[a.status];
  return s ? h('span', { class: `badge ${s.cls}` }, s.label) : null;
}

export function activityCard(a, { compact = false, onChange } = {}) {
  const chips = [a.target, a.place, a.owner, a.dept].filter(Boolean);
  const canEdit = isAdmin() || a.createdBy === currentUser().name;

  return h('div', { class: `card cat-${a.category}${a.status === 'pending' ? ' is-pending' : ''}` },
    h('div', { class: 'card-time' }, a.time || '—'),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, a.title),
        a.isRecurring ? h('span', { class: 'badge st-rec' }, '상시') : statusBadge(a),
        a.endDate ? h('span', { class: 'badge st-span' }, `~ ${fmtK(a.endDate, { year: false })}`) : null),
      chips.length ? h('div', { class: 'chips' }, ...chips.map((c) => h('span', { class: 'chip' }, c))) : null,
      !compact && a.detail ? h('p', { class: 'card-detail' }, a.detail) : null,
      !compact && a.status === 'rejected' && a.rejectReason
        ? h('p', { class: 'card-reject' }, `반려 사유: ${a.rejectReason}`) : null),
    !a.isRecurring && canEdit
      ? h('div', { class: 'card-actions' },
        h('button', { class: 'icon-btn', title: '수정', onClick: () => openActivityForm(a, { onSaved: onChange }) }, '✎'),
        h('button', {
          class: 'icon-btn danger', title: '삭제',
          onClick: async () => {
            if (!(await confirmDialog(`"${a.title}" 일정을 삭제할까요?`, { danger: true, okText: '삭제' }))) return;
            await audit('삭제', a.id, a, null);
            await remove('activities', a.id);
            toast('삭제했습니다.', 'ok');
            if (onChange) onChange();
          },
        }, '✕'))
      : null);
}

function emptyBox(msg) { return h('div', { class: 'empty' }, msg); }

function section(title, nodes, extra) {
  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' }, h('h3', {}, title), extra || null),
    ...(nodes.length ? nodes : [emptyBox('등록된 내용이 없습니다.')]));
}

export function afterSchoolTableNode(programs) {
  if (!programs.length) return emptyBox('이 날짜에 운영하는 방과후 강좌가 없습니다.');
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {},
        ...['시간', '강좌명', '대상', '장소', '강사', '인원'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...programs.map((p) => h('tr', {},
        h('td', { class: 'nowrap' }, p.time || '—'),
        h('td', { class: 'strong' }, p.name || ''),
        h('td', {}, p.grade || ''),
        h('td', {}, p.room || ''),
        h('td', {}, p.teacher || ''),
        h('td', {}, [p.enrolled, p.capacity].filter(Boolean).join(' / ') || ''))))));
}

// ── 일일 ───────────────────────────────────────────────────
export function renderDaily(ctx) {
  const d = ctx.date;
  const acts = activitiesOn(d);
  const approved = acts.filter((a) => a.status === 'approved');
  const pending = acts.filter((a) => a.status === 'pending');
  const rejected = acts.filter((a) => a.status === 'rejected');
  const rec = recurringOn(d);
  const after = afterSchoolFor(d);
  const rerender = () => ctx.refresh();

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: fmtK(d),
      onPrev: () => ctx.setDate(addDays(d, -1)),
      onNext: () => ctx.setDate(addDays(d, 1)),
      picker: h('input', { type: 'date', class: 'input date-pick', value: d, onChange: (e) => ctx.setDate(e.target.value) }),
      actions: [
        h('button', { class: 'btn btn-primary', onClick: () => openActivityForm(null, { defaultDate: d, onSaved: rerender }) }, '+ 일정 추가'),
        h('button', { class: 'btn', onClick: () => openDayExport(d) }, '결재문구·한글파일'),
      ],
    }),

    pending.length
      ? section(`확인 대기 ${pending.length}건`, pending.map((a) => activityCard(a, { onChange: rerender })),
        isAdmin() ? h('button', { class: 'btn btn-sm', onClick: () => ctx.go('approvals') }, '승인함에서 처리') : null)
      : null,

    section('교육활동', approved.map((a) => activityCard(a, { onChange: rerender }))),
    section('상시·반복 운영', rec.map((a) => activityCard(a, { compact: true })),
      h('button', { class: 'btn btn-sm', onClick: () => ctx.go('recurring') }, '반복일정 관리')),
    section('방과후학교', [afterSchoolTableNode(after)],
      h('button', { class: 'btn btn-sm', onClick: () => ctx.go('afterschool') }, '강좌 관리')),

    rejected.length ? section('반려된 일정', rejected.map((a) => activityCard(a, { onChange: rerender }))) : null,
  );
}

// ── 주간 ───────────────────────────────────────────────────
export function renderWeekly(ctx) {
  const from = weekStart(ctx.date);
  const to = addDays(from, 6);
  const days = range(from, to);
  const rerender = () => ctx.refresh();

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: `${fmtK(from, { weekday: false })} ~ ${fmtK(to, { weekday: false, year: false })}`,
      onPrev: () => ctx.setDate(addDays(from, -7)),
      onNext: () => ctx.setDate(addDays(from, 7)),
      actions: [
        h('button', { class: 'btn', onClick: () => openPeriodExport(from, to, '주간 교육활동 계획') }, '주간 계획 내보내기'),
      ],
    }),
    h('div', { class: 'week-grid' }, ...days.map((day) => {
      const b = dayBundle(day, { onlyApproved: false });
      const pend = b.activities.filter((a) => a.status === 'pending').length;
      return h('div', { class: `week-col${day === today() ? ' is-today' : ''}${isWeekend(day) ? ' is-weekend' : ''}` },
        h('button', {
          class: 'week-head', onClick: () => { ctx.setDate(day); ctx.go('daily'); },
          title: '이 날짜의 일일 화면으로',
        },
          h('span', { class: 'week-dow' }, WEEKDAY[parseYmd(day).getDay()]),
          h('span', { class: 'week-date' }, parseYmd(day).getDate()),
          pend ? h('span', { class: 'dot-pending', title: `확인 대기 ${pend}건` }, pend) : null),
        h('div', { class: 'week-body' },
          ...b.activities.map((a) => activityCard(a, { compact: true, onChange: rerender })),
          ...b.recurring.map((a) => activityCard(a, { compact: true })),
          b.afterSchool.length
            ? h('div', { class: 'mini-after' }, `방과후 ${b.afterSchool.length}강좌`)
            : null,
          !b.activities.length && !b.recurring.length ? h('div', { class: 'empty sm' }, '—') : null));
    })));
}

// ── 월간 ───────────────────────────────────────────────────
export function renderMonthly(ctx) {
  const first = monthStart(ctx.date);
  const last = monthEnd(ctx.date);
  const gridStart = weekStart(first);
  const gridEnd = addDays(weekStart(last), 6);
  const cells = range(gridStart, gridEnd);
  const mm = first.slice(0, 7);

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: `${parseYmd(first).getFullYear()}년 ${parseYmd(first).getMonth() + 1}월`,
      onPrev: () => ctx.setDate(addMonths(ctx.date, -1)),
      onNext: () => ctx.setDate(addMonths(ctx.date, 1)),
      actions: [
        h('button', { class: 'btn', onClick: () => openPeriodExport(first, last, '월간 교육활동 계획') }, '월간 계획 내보내기'),
      ],
    }),
    h('div', { class: 'month-grid' },
      ...WEEKDAY.map((w, i) => h('div', { class: `month-dow${i === 0 || i === 6 ? ' is-weekend' : ''}` }, w)),
      ...cells.map((day) => {
        const out = day.slice(0, 7) !== mm;
        const acts = activitiesOn(day);
        const rec = recurringOn(day);
        return h('button', {
          class: `month-cell${out ? ' is-out' : ''}${day === today() ? ' is-today' : ''}${isWeekend(day) ? ' is-weekend' : ''}`,
          onClick: () => { ctx.setDate(day); ctx.go('daily'); },
        },
          h('span', { class: 'month-num' }, parseYmd(day).getDate()),
          ...acts.slice(0, 3).map((a) => h('span', {
            class: `month-item cat-${a.category}${a.status === 'pending' ? ' is-pending' : ''}`,
            title: a.title,
          }, a.title)),
          acts.length > 3 ? h('span', { class: 'month-more' }, `+${acts.length - 3}`) : null,
          rec.length ? h('span', { class: 'month-rec' }, `상시 ${rec.length}`) : null);
      })));
}

// ── 날짜 이동 막대 ──────────────────────────────────────────
function dateBar(ctx, { label, onPrev, onNext, picker, actions = [] }) {
  return h('div', { class: 'datebar' },
    h('div', { class: 'datebar-nav' },
      h('button', { class: 'icon-btn', title: '이전', onClick: onPrev }, '‹'),
      h('strong', { class: 'datebar-label' }, label),
      h('button', { class: 'icon-btn', title: '다음', onClick: onNext }, '›'),
      h('button', { class: 'btn btn-sm', onClick: () => ctx.setDate(today()) }, '오늘'),
      picker || null),
    h('div', { class: 'datebar-actions' }, ...actions));
}

export { list, put, ymd };
