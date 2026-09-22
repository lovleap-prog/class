// 일일 · 주간 · 월간 화면
import { h, confirmDialog, toast } from '../lib/dom.js';
import {
  CATEGORY, STATUS, WEEKDAY, fmtK, today, addDays, addMonths,
  weekStart, sundayStart, monthStart, monthEnd, range, parseYmd, isWeekend, ymd, occursOn,
} from '../model.js';
import { activitiesOn, recurringOn, afterSchoolFor, dayBundle, clashesOn, timetableOn } from '../select.js';
import { clashLabel, bellList, defaultBell, bellById, dayBellId, bellFor, describeTime } from '../conflict.js';
import { openActivityForm } from '../ui/activityForm.js';
import { openDayExport, openPeriodExport } from '../ui/exporter.js';
import { holidayOn } from '../lib/holidays.js';
import { isAdmin, put, remove, audit, currentUser, list } from '../store.js';
import { isChecked, toggleCheck, clearChecks, countChecked } from '../checks.js';
import { makeDraggable, makeDropTarget, canMove } from '../dragmove.js';
import { noticeBox } from './notice.js';
import { boardBox } from './board.js';
import { memoPanel, memoComposer } from './memoview.js';
import { memosOn, memosBetween } from '../memo.js';
import { academicOn } from './academic.js';
import { tripsOn, openTripForm } from './trips.js';

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
export function activityCard(a, { compact = false, onChange, checkDate = '', showCheck = false, showStatus = false, clash = null } = {}) {
  const chips = [a.target, a.place, a.owner, a.dept].filter(Boolean);
  const canEdit = isAdmin() || a.createdBy === currentUser().name;
  const done = isChecked(checkDate, a);
  const card = h('div', { class: `card cat-${a.category}${a.status === 'pending' ? ' is-pending' : ''}${done ? ' is-done' : ''}${showCheck ? ' has-check' : ''}${clash ? ' is-clash' : ''}` },
    showCheck
      ? h('label', { class: 'card-check', title: done ? '확인 표시 해제' : '확인했으면 체크하세요 (나에게만 보입니다)' },
        h('input', {
          type: 'checkbox', checked: done,
          onChange: () => toggleCheck(checkDate, a),
        }))
      : null,
    h('div', { class: 'card-time' },
      describeTime(a) || '—',
      a.bellId && bellById(a.bellId)
        ? h('span', { class: 'bell-tag' }, bellById(a.bellId).name)
        : null),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title-row' },
        h('span', { class: 'card-title' }, a.title),
        a.isRecurring ? h('span', { class: 'badge st-rec' }, '상시') : statusBadge(a, { showAll: showStatus }),
        a.endDate ? h('span', { class: 'badge st-span' }, `~ ${fmtK(a.endDate, { year: false })}`) : null),
      chips.length ? h('div', { class: 'chips' }, ...chips.map((c) => h('span', { class: 'chip' }, c))) : null,
      clash ? h('p', { class: 'clash-note' }, '\u26A0 ', clashLabel(clash)) : null,
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

/**
 * 그 날 어떤 시정으로 움직이는지 고른다.
 * 1년에 몇 번 있는 일이라 기본은 건드리지 않고 그 날짜만 예외로 둔다.
 */
function dayBellPicker(day, onChange) {
  const bells = bellList();
  const def = defaultBell();
  const cur = dayBellId(day);
  if (bells.length < 2 && !cur) return null;      // 시정이 하나뿐이면 고를 것이 없다
  if (!isAdmin()) {
    return cur && bellById(cur)
      ? h('span', { class: 'bell-tag big' }, bellById(cur).name)
      : null;
  }
  const sel = h('select', {
    class: `input date-pick bell-pick${cur ? ' is-set' : ''}`,
    title: '이 날짜의 시정. 단축수업 날에 바꿔주세요.',
    onChange: async (e) => {
      const v = e.target.value;
      if (v) await put('daybell', { id: day, bellId: v });
      else {
        const row = list('daybell').find((x) => x.id === day);
        if (row) await remove('daybell', day);
      }
      toast(v ? `${fmtK(day, { year: false })} 는 '${bellById(v).name}' 으로 봅니다.` : '기본 시정으로 되돌렸습니다.', 'ok');
      if (onChange) onChange();
    },
  },
    h('option', { value: '' }, `${def.name} (기본)`),
    ...bells.filter((b) => b.id !== def.id).map((b) => h('option', { value: b.id, selected: cur === b.id }, b.name)));
  return sel;
}

/** 중복 목록에서 그 항목을 되찾는다. */
function findById(id, acts, slots) {
  const a = acts.find((x) => x.id === id);
  if (a) return a;
  const s = (slots || []).find((x) => `tt_${x.id}` === id);
  return s ? { ...s, time: `${s.period}교시` } : null;
}

/**
 * 반복일정 한 줄. 행사와 겹칠 때 '이 날만 제외' 할 수 있어야 한다.
 * 규칙 자체를 끄면 다른 주까지 사라지므로, 그 날짜만 예외로 넣는다.
 */
function recurringRow(a, day, clash, onChange) {
  const card = activityCard(a, { compact: true, checkDate: day, showCheck: true, clash });
  if (!isAdmin()) return card;
  const btn = h('button', {
    class: 'btn btn-sm btn-danger skip-btn',
    title: '이 날짜에만 이 반복일정을 빼고, 다음 주부터는 그대로 운영합니다',
    onClick: async (e) => {
      e.stopPropagation();
      const rule = list('recurring').find((r) => r.id === a.recurringId);
      if (!rule) return;
      if (!(await confirmDialog(`${fmtK(day, { year: false })} 에만 '${a.title}' 을(를) 빼시겠습니까?\n다른 날짜는 그대로 운영됩니다.`, { okText: '이 날만 빼기' }))) return;
      const next = { ...rule, exceptions: [...(rule.exceptions || []), day] };
      await put('recurring', next);
      await audit('반복제외', rule.id, rule, next);
      toast(`${fmtK(day, { year: false })} 에는 '${a.title}' 을(를) 뺐습니다.`, 'ok');
      if (onChange) onChange();
    },
  }, '이 날만 빼기');
  card.appendChild(h('div', { class: 'card-actions' }, btn));
  return card;
}

/** 그 날 교담·특별실 시간표를 한 줄로 */
function timetableStrip(slots, clash) {
  return h('div', { class: 'tt-strip' }, ...slots.map((s) => {
    const hits = clash.get(`tt_${s.id}`);
    return h('span', {
      class: `tt-chip kind-${s.kind}${hits ? ' is-clash' : ''}`,
      title: hits ? clashLabel(hits) : [s.target, s.place, s.owner, s.note].filter(Boolean).join(' · '),
    },
      h('span', { class: 'tt-chip-sub' }, `${s.period}교시`),
      hits ? h('span', { class: 'clash-mark' }, '\u26A0') : null,
      h('span', { class: 'tt-chip-title' }, s.title),
      s.note ? h('span', { class: 'tt-chip-note' }, s.note) : null);
  }));
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
  const slots = timetableOn(d);
  const clash = clashesOn(d);
  const acad = academicOn(d);
  const trips = tripsOn(d);
  const myMemos = memosOn(d);
  const rerender = () => ctx.refresh();
  const cl = (a) => clash.get(a.id) || null;

  return h('div', { class: 'view' },
    dateBar(ctx, {
      label: fmtK(d),
      onPrev: () => ctx.setDate(addDays(d, -1)),
      onNext: () => ctx.setDate(addDays(d, 1)),
      picker: h('span', { class: 'row gap' },
        h('input', { type: 'date', class: 'input date-pick', value: d, onChange: (e) => ctx.setDate(e.target.value) }),
        dayBellPicker(d, rerender)),
      actions: [
        h('button', { class: 'btn btn-primary', onClick: () => openActivityForm(null, { defaultDate: d, onSaved: rerender }) }, '+ 일정 추가'),
        h('button', { class: 'btn', onClick: () => openDayExport(d) }, '결재문구·한글파일'),
      ],
    }),

    (() => {
      const off = holidayOn(d);
      return off
        ? h('div', { class: 'holiday-bar' },
            h('span', { class: 'holiday-ico' }, '\u{1F6CC}'),
            h('div', {},
              h('b', {}, off),
              h('span', { class: 'muted small' },
                ' 수업이 없는 날입니다. 상시·반복 일정은 이 날 돌지 않습니다.')))
        : null;
    })(),

    pending.length
      ? section(`확인 대기 ${pending.length}건`, pending.map((a) => activityCard(a, { onChange: rerender, checkDate: d, clash: cl(a) })),
        isAdmin() ? h('button', { class: 'btn btn-sm', onClick: () => ctx.go('approvals') }, '승인함에서 처리') : null)
      : null,

    // 공지는 일일과 주간이 같은 것을 본다. 기간이 오늘에 걸치면 여기 뜬다.
    boardBox(d, d, { title: '공지사항', refresh: rerender }),

    acad.length
      ? h('section', { class: 'sec sec-acad' },
        h('div', { class: 'sec-head' },
          h('h3', {}, '\u{1F4C5} 학사일정'),
          h('button', { class: 'btn btn-sm', onClick: () => ctx.go('academic') }, '학사일정 전체')),
        h('div', { class: 'chips' }, ...acad.map((a) => h('span', { class: 'acad-pill' }, a.title))))
      : null,

    clash.size
      ? h('section', { class: 'sec sec-clash' },
        h('div', { class: 'sec-head' },
          h('h3', {}, `중복 ${clash.size}건`),
          h('span', { class: 'muted small' }, '겹쳐도 되는 것이면 그대로 두셔도 됩니다')),
        h('ul', { class: 'clash-list' },
          ...[...clash.entries()].map(([id, hits]) => {
            const me = hits[0].other && findById(id, [...approved, ...pending, ...rec, ...spans], slots);
            return h('li', {},
              h('strong', {}, me ? `${me.time || ''} ${me.title}` : id),
              ' — ', clashLabel(hits));
          })))
      : null,

    spans.length
      ? h('section', { class: 'sec sec-span' },
        h('div', { class: 'sec-head' }, h('h3', {}, `기간 운영 ${spans.length}건`),
          h('span', { class: 'muted small' }, '오늘을 포함해 여러 날 이어지는 활동입니다')),
        ...spans.map((a) => spanCard(a, d, rerender)))
      : null,

    section('교육활동', approved.map((a) => activityCard(a, { onChange: rerender, checkDate: d, showCheck: true, clash: cl(a) })),
      progressNode(d, [...spans, ...approved, ...rec], rerender)),
    section('상시·반복 운영', rec.map((a) => recurringRow(a, d, cl(a), rerender)),
      h('button', { class: 'btn btn-sm', onClick: () => ctx.go('recurring') }, '반복일정 관리')),

    slots.length
      ? section(`교과교담·특별실 ${slots.length}칸`,
        [timetableStrip(slots, clash)],
        h('button', { class: 'btn btn-sm', onClick: () => ctx.go('timetable') }, '시간표 관리'))
      : null,
    section('방과후학교', [afterSchoolTableNode(after)],
      h('button', { class: 'btn btn-sm', onClick: () => ctx.go('afterschool') }, '강좌 관리')),

    rejected.length ? section('반려된 일정', rejected.map((a) => activityCard(a, { onChange: rerender }))) : null,

    h('section', { class: 'sec' },
      h('div', { class: 'sec-head' },
        h('h3', {}, `\u{1F697} 출장 ${trips.length}건`),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn btn-sm', onClick: () => openTripForm({ date: d }, rerender) }, '+ 출장 신청'),
          h('button', { class: 'btn btn-sm', onClick: () => ctx.go('trips') }, '출장 현황'))),
      trips.length
        ? h('div', { class: 'trip-strip' }, ...trips.map((t) => h('span', {
          class: `trip-pill${t.needsSub ? ' need-sub' : ''}${t.status === 'pending' ? ' is-pending' : ''}`,
          title: [t.reason, t.place, t.needsSub ? `보결: ${t.subNote || '교시 미기재'}` : ''].filter(Boolean).join(' · '),
        },
          h('strong', {}, t.applicant),
          t.time ? h('span', { class: 'muted small' }, t.time) : null,
          t.needsSub ? h('span', { class: 'badge badge-sub' }, '보결') : null)))
        : h('div', { class: 'empty' }, '이 날짜에 등록된 출장이 없습니다.')),

    h('section', { class: 'sec sec-memo' },
      h('div', { class: 'sec-head' },
        h('h3', {}, `\u{1F4DD} 내 메모`),
        h('span', { class: 'muted small' }, '나에게만 보입니다')),
      memoPanel(rerender, {
        filter: () => myMemos,
        emptyText: '이 날짜에 걸린 내 메모가 없습니다. 아래에 적으면 이 날짜로 붙습니다.',
      }),
      memoComposer(rerender, { date: d })),
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
        h('button', { class: 'btn', onClick: () => openPeriodExport(from, to, '주간활동계획', 'weekly') }, '주간활동계획 내보내기'),
      ],
    }),
    boardBox(from, to, { title: '이번 주 공지사항', refresh: rerender }),

    (() => {
      const mine = memosBetween(from, to);
      return mine.length
        ? h('section', { class: 'sec sec-memo' },
          h('div', { class: 'sec-head' },
            h('h3', {}, '\u{1F4DD} 이번 주 내 메모'),
            h('span', { class: 'muted small' }, '나에게만 보입니다')),
          memoPanel(rerender, { filter: () => mine, compact: true }))
        : null;
    })(),

    weekBands(from, to, ctx),
    h('div', { class: 'week-grid' }, ...days.map((day) => {
      const b = dayBundle(day, { onlyApproved: false });
      const pend = b.activities.filter((a) => a.status === 'pending').length;
      const off = holidayOn(day);
      const col = h('div', {
        class: `week-col${day === today() ? ' is-today' : ''}`
          + `${isWeekend(day) ? ' is-weekend' : ''}${off ? ' is-holiday' : ''}`,
        dataset: { day },
      },
        h('button', {
          class: 'week-head', onClick: () => { ctx.setDate(day); ctx.go('daily'); },
          title: off ? `${off} — 수업 없음` : '이 날짜의 일일 화면으로',
        },
          h('span', { class: 'week-dow' }, WEEKDAY[parseYmd(day).getDay()]),
          h('span', { class: 'week-date' }, parseYmd(day).getDate()),
          off ? h('span', { class: 'week-off' }, off) : null,
          pend ? h('span', { class: 'dot-pending', title: `확인 대기 ${pend}건` }, pend) : null),
        h('div', { class: 'week-body' },
          // 기간 일정은 위쪽 띠에 이미 나와 있으므로 칸 안에서는 뺀다
          ...b.activities.filter((a) => !isSpan(a)).map((a) => activityCard(a, { compact: true, onChange: rerender, checkDate: day })),
          ...b.recurring.map((a) => activityCard(a, { compact: true, checkDate: day })),
          b.afterSchool.length
            ? h('div', { class: 'mini-after' }, `방과후 ${b.afterSchool.length}강좌`)
            : null,
          !b.activities.length && !b.recurring.length ? h('div', { class: 'empty sm' }, '—') : null));
      return makeDropTarget(col, day);
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
        h('button', { class: 'btn', onClick: () => openPeriodExport(first, last, '월중 교육활동계획', 'monthly') }, '월중계획 내보내기'),
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
          const off = holidayOn(day);
          const cell = h('button', {
            class: `month-cell${out ? ' is-out' : ''}${day === today() ? ' is-today' : ''}`
              + `${isWeekend(day) ? ' is-weekend' : ''}${off ? ' is-holiday' : ''}`,
            dataset: { day },
            onClick: () => goDay(day),
            title: off || '',
          },
            h('span', { class: 'month-num' }, parseYmd(day).getDate()),
            off ? h('span', { class: 'month-off', title: off }, off) : null,
            lanes ? h('span', { class: 'month-bandspace' }) : null,
            ...acts.slice(0, 3).map((a) => makeDraggable(h('span', {
              class: `month-item cat-${a.category}${a.status === 'pending' ? ' is-pending' : ''}`,
              title: canMove(a) ? `${a.title} — 끌어서 옮기기` : a.title,
            }, a.title), a)),
            acts.length > 3 ? h('span', { class: 'month-more' }, `+${acts.length - 3}`) : null,
            rec.length ? h('span', { class: 'month-rec' }, `상시 ${rec.length}`) : null);
          return makeDropTarget(cell, day);
        })),
        bandGrid(bands, { compact: true, onClick: (a) => goDay(a.date) }));
    }),

    noticeBox('focus', mm, {
      title: `${parseYmd(first).getMonth() + 1}월 중점지도 내용`,
      placeholder: '월간 주간교육활동 한글 문서에 들어가는 이 달의 중점지도 내용을 적으세요.',
      onChange: () => ctx.refresh(),
    }),

    (() => {
      const mine = memosBetween(first, last);
      return mine.length
        ? h('section', { class: 'sec sec-memo' },
          h('div', { class: 'sec-head' },
            h('h3', {}, '\u{1F4DD} 이 달 내 메모'),
            h('span', { class: 'muted small' }, '나에게만 보입니다')),
          memoPanel(() => ctx.refresh(), { filter: () => mine, compact: true }))
        : null;
    })());
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
