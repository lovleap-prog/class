// 일일 · 주간 · 월간 화면
import { h, confirmDialog, toast } from '../lib/dom.js';
import {
  CATEGORY, STATUS, WEEKDAY, fmtK, today, addDays, addMonths,
  weekStart, sundayStart, monthStart, monthEnd, range, parseYmd, isWeekend, ymd, occursOn,
} from '../model.js';
import { activitiesOn, recurringOn, afterSchoolFor, dayBundle } from '../select.js';
import { openActivityForm } from '../ui/activityForm.js';
import { openDayExport, openPeriodExport } from '../ui/exporter.js';
import { isAdmin, put, remove, audit, currentUser, list } from '../store.js';
import { isChecked, toggleCheck, clearChecks, countChecked } from '../checks.js';
import { makeDraggable, makeDropTarget, canMove } from '../dragmove.js';

// ── 공통 조각 ───────────────────────────────────────────────
/**
 * 상태 배지.
 * '승인 완료' 는 기본 상태라 일일·주간·월간에서는 붙이지 않는다.
 * 대부분이 승인된 일정이라 배지가 도배되면 정작 봐야 할 '확인 대기' 가 묻힌다.
 * 승인 여부를 확인하러 오는 화면(승인함)에서만 showAll 로 켠다.
 */
export function statusBadge(a, { showAll = false } = {}) {
  if (!showAll && a.status === 'approved') return null;
  const s = STATUS[a.status];
  return s ? h('span', { class: `badge ${s.cls}` }, s.label) : null;
}

/**
 * @param checkDate  이 날짜 기준으로 내 체크 상태를 반영한다(빈 값이면 체크 개념 없음)
 * @param showCheck  체크박스를 그릴지. 주간 화면은 상태만 반영하고 체크박스는 안 그린다.
 */
export function activityCard(a, { compact = false, onChange, checkDate = '', showCheck = false, showStatus = false } = {}) {
  const chips = [a.target, a.place, a.owner, a.dept].filter(Boolean);
  const canEdit = isAdmin() || a.createdBy === currentUser().name;
  const done = isChecked(checkDate, a);
  const card = h('div', { class: `card cat-${a.category}${a.status === 'pending' ? ' is-pending' : ''}${done ? ' is-done' : ''}${showCheck ? ' has-check' : ''}` },
    showCheck
      ? h('label', { class: 'card-check', title: done ? '확인 표시 해제' : '확인했으면 체크하세요 (나에게만 보입니다)' },
        h('input', {
          type: 'checkbox', checked: done,
          onChange: () => toggleCheck(checkDate, a),
        }))
      : null,
    h('div', { class: 'card-time' }, a.time || '—'),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, a.title),
        a.isRecurring ? h('span', { class: 'badge st-rec' }, '상시') : statusBadge(a, { showAll: showStatus }),
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

  // 좁은 칸(주간)에서만 끌어 옮긴다. 일일 화면은 세로 목록이라 끌 곳이 없다.
  if (compact && canMove(a)) {
    makeDraggable(card, a);
    card.title = '끌어서 다른 날짜로 옮길 수 있습니다';
  }
  return card;
}

function emptyBox(msg) { return h('div', { class: 'empty' }, msg); }

/** 여러 날에 걸치는 일정인가 */
export const isSpan = (a) => !!(a.endDate && a.endDate > a.date);

/**
 * 기간 일정을 [from, to] 구간의 띠로 배치한다.
 * 겹치는 띠는 위아래 줄로 나눠 서로 가리지 않게 한다.
 * @returns [{ a, start, span, lane, cutLeft, cutRight }]
 */
export function layoutBands(spans, from, to) {
  const days = range(from, to);
  const idx = (d) => days.indexOf(d);
  const lanes = [];   // lane 별로 [끝난 칸 번호]

  return spans
    .slice()
    .sort((x, y) => (x.date === y.date
      ? (y.endDate || '').localeCompare(x.endDate || '')
      : x.date.localeCompare(y.date)))
    .map((a) => {
      const s = Math.max(0, idx(a.date < from ? from : a.date));
      const eDate = a.endDate > to ? to : a.endDate;
      const e = Math.max(s, idx(eDate));
      let lane = lanes.findIndex((end) => end < s);
      if (lane < 0) { lane = lanes.length; lanes.push(-1); }
      lanes[lane] = e;
      return {
        a, start: s, span: e - s + 1, lane,
        cutLeft: a.date < from, cutRight: (a.endDate || a.date) > to,
      };
    });
}

/** 띠 하나 */
function bandNode(b, { compact = false, onClick } = {}) {
  const { a } = b;
  const node = h(onClick ? 'button' : 'div', {
    class: `band cat-${a.category}${b.cutLeft ? ' cut-l' : ''}${b.cutRight ? ' cut-r' : ''}`,
    style: { gridColumn: `${b.start + 1} / span ${b.span}`, gridRow: String(b.lane + 1) },
    title: `${a.title} (${fmtK(a.date, { year: false })} ~ ${fmtK(a.endDate, { year: false })})`,
    onClick: onClick ? () => onClick(a) : undefined,
  },
    b.cutLeft ? h('span', { class: 'band-arrow' }, '\u25C0') : null,
    h('span', { class: 'band-text' }, compact ? a.title : `${a.title}${a.target ? ` · ${a.target}` : ''}`),
    b.cutRight ? h('span', { class: 'band-arrow' }, '\u25B6') : null);
  return makeDraggable(node, a);
}

/** 일일 화면의 기간 일정 — 며칠째인지 함께 보여준다. */
function spanCard(a, day, onChange) {
  const days = range(a.date, a.endDate);
  const nth = days.indexOf(day) + 1;
  return h('div', { class: `band band-day cat-${a.category}` },
    h('span', { class: 'band-text' }, a.title),
    h('span', { class: 'band-meta' },
      `${fmtK(a.date, { year: false })} ~ ${fmtK(a.endDate, { year: false })}`,
      nth > 0 ? ` · ${nth}일째/${days.length}일` : ''),
    ...[a.target, a.place, a.owner].filter(Boolean).map((c) => h('span', { class: 'chip' }, c)),
    (isAdmin() || a.createdBy === currentUser().name)
      ? h('button', {
        class: 'icon-btn', title: '수정',
        onClick: () => openActivityForm(a, { onSaved: onChange }),
      }, '\u270E')
      : null);
}

/** 7칸짜리 띠 영역 (주간·월간 공통) */
function bandGrid(bands, opt) {
  if (!bands.length) return null;
  const lanes = Math.max(...bands.map((b) => b.lane)) + 1;
  return h('div', {
    class: 'band-grid',
    style: { gridTemplateRows: `repeat(${lanes}, auto)` },
  }, ...bands.map((b) => bandNode(b, opt)));
}

/** '확인 2/5' 와 초기화 버튼. 체크는 사람마다 따로라 안내 문구를 함께 둔다. */
function progressNode(date, items, rerender) {
  if (!items.length) return null;
  const done = countChecked(date, items);
  return h('div', { class: 'row gap' },
    h('span', { class: `progress${done === items.length ? ' all-done' : ''}` },
      done === items.length ? `확인 완료 ${done}/${items.length}` : `확인 ${done}/${items.length}`),
    h('span', { class: 'muted small' }, '체크는 나에게만 보입니다'),
    done
      ? h('button', {
        class: 'btn btn-sm',
        onClick: async () => { await clearChecks(date); rerender(); },
      }, '내 체크 지우기')
      : null);
}

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
  // 여러 날 걸치는 일정은 시간이 없어 맨 아래로 밀리곤 했다. 맨 위 띠로 따로 뺀다.
  const spans = acts.filter((a) => a.status === 'approved' && isSpan(a));
  const approved = acts.filter((a) => a.status === 'approved' && !isSpan(a));
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
      ? section(`확인 대기 ${pending.length}건`, pending.map((a) => activityCard(a, { onChange: rerender, checkDate: d })),
        isAdmin() ? h('button', { class: 'btn btn-sm', onClick: () => ctx.go('approvals') }, '승인함에서 처리') : null)
      : null,

    spans.length
      ? h('section', { class: 'sec sec-span' },
        h('div', { class: 'sec-head' }, h('h3', {}, `기간 운영 ${spans.length}건`),
          h('span', { class: 'muted small' }, '오늘을 포함해 여러 날 이어지는 활동입니다')),
        ...spans.map((a) => spanCard(a, d, rerender)))
      : null,

    section('교육활동', approved.map((a) => activityCard(a, { onChange: rerender, checkDate: d, showCheck: true })),
      progressNode(d, [...spans, ...approved, ...rec], rerender)),
    section('상시·반복 운영', rec.map((a) => activityCard(a, { compact: true, checkDate: d, showCheck: true })),
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
    weekBands(from, to, ctx),
    h('div', { class: 'week-grid' }, ...days.map((day) => {
      const b = dayBundle(day, { onlyApproved: false });
      const pend = b.activities.filter((a) => a.status === 'pending').length;
      const col = h('div', {
        class: `week-col${day === today() ? ' is-today' : ''}${isWeekend(day) ? ' is-weekend' : ''}`,
        dataset: { day },
      },
        h('button', {
          class: 'week-head', onClick: () => { ctx.setDate(day); ctx.go('daily'); },
          title: '이 날짜의 일일 화면으로',
        },
          h('span', { class: 'week-dow' }, WEEKDAY[parseYmd(day).getDay()]),
          h('span', { class: 'week-date' }, parseYmd(day).getDate()),
          pend ? h('span', { class: 'dot-pending', title: `확인 대기 ${pend}건` }, pend) : null),
        h('div', { class: 'week-body' },
          // 기간 일정은 위쪽 띠에 이미 나와 있으므로 칸 안에서는 뺀다
          ...b.activities.filter((a) => !isSpan(a)).map((a) => activityCard(a, { compact: true, onChange: rerender, checkDate: day })),
          ...b.recurring.map((a) => activityCard(a, { compact: true, checkDate: day })),
          b.afterSchool.length
            ? h('div', { class: 'mini-after' }, `방과후 ${b.afterSchool.length}강좌`)
            : null,
          !b.activities.length && !b.recurring.length ? h('div', { class: 'empty sm' }, '—') : null));
      return makeDropTarget(col, day, rerender);
    })));
}

function weekBands(from, to, ctx) {
  const spans = list('activities')
    .filter((a) => a.status !== 'rejected' && isSpan(a) && a.date <= to && a.endDate >= from);
  if (!spans.length) return null;
  const bands = layoutBands(spans, from, to);
  return h('div', { class: 'week-bandwrap' },
    h('div', { class: 'band-label' }, '기간 운영'),
    bandGrid(bands, { onClick: (a) => { ctx.setDate(a.date); ctx.go('daily'); } }));
}

// ── 월간 ───────────────────────────────────────────────────
export function renderMonthly(ctx) {
  const first = monthStart(ctx.date);
  const last = monthEnd(ctx.date);
  // 머리글이 일·월·화… 이므로 달력 격자도 일요일에서 시작해야 칸이 맞는다.
  const gridStart = sundayStart(first);
  const gridEnd = addDays(sundayStart(last), 6);
  const mm = first.slice(0, 7);

  // 주 단위로 나눠야 여러 날짜에 걸친 띠를 그릴 수 있다.
  const weeks = [];
  for (let w = gridStart; w <= gridEnd; w = addDays(w, 7)) weeks.push(w);
  const allSpans = list('activities').filter((a) => a.status !== 'rejected' && isSpan(a));

  const goDay = (day) => { ctx.setDate(day); ctx.go('daily'); };

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: `${parseYmd(first).getFullYear()}년 ${parseYmd(first).getMonth() + 1}월`,
      onPrev: () => ctx.setDate(addMonths(ctx.date, -1)),
      onNext: () => ctx.setDate(addMonths(ctx.date, 1)),
      actions: [
        h('button', { class: 'btn', onClick: () => openPeriodExport(first, last, '월간 교육활동 계획') }, '월간 계획 내보내기'),
      ],
    }),
    h('div', { class: 'month-dows' },
      ...WEEKDAY.map((w, i) => h('div', { class: `month-dow${i === 0 || i === 6 ? ' is-weekend' : ''}` }, w))),
    ...weeks.map((ws) => {
      const we = addDays(ws, 6);
      const bands = layoutBands(allSpans.filter((a) => a.date <= we && a.endDate >= ws), ws, we);
      const lanes = bands.length ? Math.max(...bands.map((b) => b.lane)) + 1 : 0;
      return h('div', { class: 'month-week', style: { '--bands': lanes } },
        h('div', { class: 'month-days' }, ...range(ws, we).map((day) => {
          const out = day.slice(0, 7) !== mm;
          const acts = activitiesOn(day).filter((a) => !isSpan(a));
          const rec = recurringOn(day);
          const cell = h('button', {
            class: `month-cell${out ? ' is-out' : ''}${day === today() ? ' is-today' : ''}${isWeekend(day) ? ' is-weekend' : ''}`,
            dataset: { day },
            onClick: () => goDay(day),
          },
            h('span', { class: 'month-num' }, parseYmd(day).getDate()),
            lanes ? h('span', { class: 'month-bandspace' }) : null,
            ...acts.slice(0, 3).map((a) => makeDraggable(h('span', {
              class: `month-item cat-${a.category}${a.status === 'pending' ? ' is-pending' : ''}`,
              title: canMove(a) ? `${a.title} — 끌어서 옮기기` : a.title,
            }, a.title), a)),
            acts.length > 3 ? h('span', { class: 'month-more' }, `+${acts.length - 3}`) : null,
            rec.length ? h('span', { class: 'month-rec' }, `상시 ${rec.length}`) : null);
          return makeDropTarget(cell, day, () => ctx.refresh());
        })),
        bandGrid(bands, { compact: true, onClick: (a) => goDay(a.date) }));
    }));
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
