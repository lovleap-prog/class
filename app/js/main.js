// 앱 진입점 — 탭 전환, 헤더, 첫 실행 안내, 위젯 모드
import { h, mount, clear, toast, openModal } from './lib/dom.js';
import { loadConfig } from './config.js';
import { initStore, on, loadSavedUser, currentUser, setUser, isAdmin, backendKind } from './store.js';
import { today, fmtK, weekStart, addDays, monthStart, monthEnd } from './model.js';
import { renderDaily, renderWeekly, renderMonthly } from './views/schedule.js';
import { renderRecurring } from './views/recurring.js';
import { renderTimetable } from './views/timetable.js';
import { renderAfterSchool } from './views/afterschool.js';
import { renderApprovals } from './views/approvals.js';
import { renderImporter } from './views/importer.js';
import { renderSettings } from './views/settings.js';
import { countPendingInRange, dayBundle } from './select.js';
import { isChecked, toggleCheck } from './checks.js';
import { openDayExport } from './ui/exporter.js';
import { ROLE } from './model.js';

const TABS = [
  ['daily', '일일', renderDaily],
  ['weekly', '주간', renderWeekly],
  ['monthly', '월간', renderMonthly],
  ['timetable', '시간표', renderTimetable],
  ['recurring', '반복일정', renderRecurring],
  ['afterschool', '방과후', renderAfterSchool],
  ['approvals', '승인함', renderApprovals],
  ['import', '불러오기', renderImporter],
  ['settings', '설정', renderSettings],
];

const state = {
  tab: 'daily',
  date: today(),
  state: {},   // 각 화면이 쓰는 임시 상태
};

const ctx = {
  get date() { return state.date; },
  get state() { return state.state; },
  setDate(d) { state.date = d; render(); },
  go(tab) { state.tab = tab; syncHash(); render(); },
  refresh() { render(); },
};

const app = document.getElementById('app');
const isWidget = new URLSearchParams(location.search).get('mode') === 'widget';

let cfg = loadConfig();

async function boot() {
  loadSavedUser();
  document.body.classList.toggle('widget', isWidget);

  try {
    const kind = await initStore(cfg);
    if (kind === 'firestore') document.body.classList.add('online');
  } catch (e) {
    console.error(e);
    toast('저장소 연결에 실패해 이 컴퓨터 저장으로 전환했습니다.', 'warn');
    await initStore({ ...cfg, backend: 'local' });
  }

  // 데이터가 바뀌면 화면을 다시 그린다(다른 선생님의 입력이 바로 보인다).
  on('*', () => render());

  readHash();
  render();
  // 위젯(작은 창)은 보기 전용이라 이름을 묻지 않는다.
  if (!isWidget && !currentUser().name) setTimeout(askName, 300);
  registerSW();
}

function readHash() {
  const m = location.hash.match(/^#\/(\w+)(?:\/(\d{4}-\d{2}-\d{2}))?/);
  if (!m) return;
  if (TABS.some(([k]) => k === m[1])) state.tab = m[1];
  if (m[2]) state.date = m[2];
}
function syncHash() {
  const next = `#/${state.tab}/${state.date}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}
window.addEventListener('hashchange', () => { readHash(); render(); });

function askName() {
  const nameIn = h('input', { class: 'input', placeholder: '예) 김민수' });
  const deptIn = h('input', { class: 'input', placeholder: '예) 교무기획부' });
  const roleSel = h('select', { class: 'input' },
    ...Object.entries(ROLE).map(([k, v]) => h('option', { value: k }, v)));
  openModal('처음 오셨네요. 이름을 알려주세요.', h('div', { class: 'form-grid' },
    h('div', { class: 'span2' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, '이름 *'), nameIn)),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '부서/계'), deptIn),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, '역할'), roleSel,
      h('span', { class: 'field-hint' }, '승인 권한이 필요하면 관리자를 고르세요.')),
    h('p', { class: 'span2 muted small' }, '나중에 [설정] 탭에서 바꿀 수 있습니다.')), [
    {
      label: '시작하기', class: 'btn-primary',
      onClick: (c) => {
        if (!nameIn.value.trim()) return toast('이름을 입력해 주세요.', 'warn');
        setUser({ name: nameIn.value.trim(), dept: deptIn.value.trim(), role: roleSel.value });
        c(); render();
      },
    },
  ]);
  setTimeout(() => nameIn.focus(), 50);
}

function header() {
  cfg = loadConfig();
  const me = currentUser();
  const from = monthStart(state.date), to = monthEnd(state.date);
  const pend = countPendingInRange(from, to);

  return h('header', { class: 'top' },
    h('div', { class: 'brand' },
      h('span', { class: 'logo' }, '\u{1F4DA}'),
      h('div', {},
        h('strong', {}, cfg.school.name || '학교 교육활동'),
        h('span', { class: 'sub' }, '일일 · 주간 · 월간 교육활동'))),
    h('div', { class: 'top-right' },
      ...linkButtons(cfg),
      h('span', { class: `conn ${backendKind()}` },
        backendKind() === 'firestore' ? '실시간 공유' : '이 컴퓨터 저장'),
      h('button', {
        class: 'btn btn-sm', title: '작은 창으로 띄우기 (바탕화면 한쪽에 두고 보기 좋습니다)',
        onClick: openWidget,
      }, '위젯 창'),
      h('button', {
        class: 'user-btn', title: '설정',
        onClick: () => ctx.go('settings'),
      }, `${me.name || '이름 설정'}${isAdmin() ? ' · 관리자' : ''}`)),
    h('nav', { class: 'tabs' },
      ...TABS.map(([key, label]) => h('button', {
        class: `tab${state.tab === key ? ' on' : ''}`,
        onClick: () => ctx.go(key),
      }, label,
        key === 'approvals' && pend ? h('span', { class: 'tab-badge' }, pend) : null))));
}

/**
 * 학교 자료실(노션) 같은 바로가기.
 * 접근 권한이 없는 분에게도 그냥 보여준다 — 눌러도 그쪽에서 막히기 때문에
 * 굳이 숨길 이유가 없고, 권한 있는 분이 찾기 쉬운 편이 낫다.
 */
function linkButtons(cfg) {
  return (cfg.links || [])
    .filter((l) => l && l.url)
    .map((l) => h('a', {
      class: 'link-btn',
      href: l.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: `${l.url}\n새 창에서 열립니다. 접근 권한이 있는 계정만 볼 수 있습니다.`,
    }, h('span', { class: 'link-ico' }, '\u{1F517}'), l.label || '바로가기'));
}

function openWidget() {
  const url = `${location.pathname}?mode=widget#/daily/${state.date}`;
  const w = window.open(url, 'sam-widget', 'width=430,height=760,menubar=no,toolbar=no,location=no');
  if (!w) toast('팝업이 차단됐습니다. 주소창의 차단 해제를 눌러주세요.', 'warn');
}

// ── 위젯(작은 창) 화면 ──────────────────────────────────────
function renderWidget() {
  const b = dayBundle(state.date, { onlyApproved: true });
  const items = [...b.activities, ...b.recurring];
  return h('div', { class: 'widget-wrap' },
    h('div', { class: 'widget-top' },
      h('button', { class: 'icon-btn', onClick: () => ctx.setDate(addDays(state.date, -1)) }, '‹'),
      h('strong', {}, fmtK(state.date)),
      h('button', { class: 'icon-btn', onClick: () => ctx.setDate(addDays(state.date, 1)) }, '›'),
      h('button', { class: 'btn btn-sm', onClick: () => ctx.setDate(today()) }, '오늘')),
    h('div', { class: 'widget-body' },
      items.length
        ? h('ul', { class: 'widget-list' }, ...items.map((a) => {
          const done = isChecked(state.date, a);
          return h('li', { class: done ? 'is-done' : '' },
            h('input', {
              type: 'checkbox', class: 'w-check', checked: done,
              title: '확인했으면 체크하세요 (나에게만 보입니다)',
              onChange: () => toggleCheck(state.date, a),
            }),
            h('span', { class: 'w-time' }, a.time || '—'),
            h('span', { class: 'w-title' }, a.title),
            a.isRecurring ? h('span', { class: 'badge st-rec' }, '상시') : null,
            a.place ? h('span', { class: 'w-place' }, a.place) : null);
        }))
        : h('div', { class: 'empty' }, '승인된 일정이 없습니다.'),
      b.afterSchool.length
        ? h('div', { class: 'widget-after' },
          h('h4', {}, `방과후 ${b.afterSchool.length}강좌`),
          h('ul', {}, ...b.afterSchool.map((p) => h('li', {}, `${p.time || ''} ${p.name}${p.room ? ` (${p.room})` : ''}`))))
        : null),
    h('div', { class: 'widget-foot' },
      ...linkButtons(cfg).slice(0, 1),
      h('button', { class: 'btn btn-sm', onClick: () => openDayExport(state.date) }, '결재문구'),
      h('button', {
        class: 'btn btn-sm',
        onClick: () => window.open(`${location.pathname}#/daily/${state.date}`, 'sam-main'),
      }, '전체 열기')));
}

function render() {
  syncHash();
  if (isWidget) { mount(app, renderWidget()); return; }
  const tab = TABS.find(([k]) => k === state.tab) || TABS[0];
  mount(app, header(), h('main', { class: 'main' }, tab[2](ctx)));
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // 파일로 직접 열면 설치가 안 된다
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 등록 실패', e));
}

boot();
export { ctx, state };
