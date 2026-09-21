// 불러오기 탭 — hwpx / 엑셀 / CSV 파일이나 자유 형식 붙여넣기를 표로 바꿔 확인 후 등록.
// "각 계 담당자가 편한 형식으로 적어 보내면 자동으로 들어간다" 를 담당하는 화면.
import { h, toast, confirmDialog, clear } from '../lib/dom.js';
import { CATEGORY, newActivity, newAfterSchool, today, WEEKDAY } from '../model.js';
import { parseFreeText, parseTable } from '../lib/textparse.js';
import { readHwpx } from '../lib/hwpx-read.js';
import { readXlsx } from '../lib/xlsx-read.js';
import { putMany, audit, currentUser, isAdmin } from '../store.js';

const FIELDS = [
  ['date', '날짜', 'date'],
  ['time', '시간', 'text'],
  ['title', '활동명', 'text'],
  ['target', '대상', 'text'],
  ['place', '장소', 'text'],
  ['owner', '담당', 'text'],
  ['dept', '부서', 'text'],
];

export function renderImporter(ctx) {
  const st = ctx.state.importer || (ctx.state.importer = { rows: [], mode: 'activities', source: 'text' });
  const preview = h('div', { class: 'preview' });

  const paste = h('textarea', {
    class: 'input', rows: 8,
    placeholder: [
      '담당자가 보낸 내용을 그대로 붙여넣으세요. 형식은 자유롭습니다.',
      '',
      '예)',
      '9월 22일(월)',
      ' - 1~2교시 3학년 안전교육 (시청각실, 김민수 선생님)',
      ' - 전교생 아침독서 08:40',
      '9/24~9/26 5학년 현장체험학습 경주',
      '2026-09-23 교직원 협의회 15:00 회의실 교무기획부',
    ].join('\n'),
  });

  const yearInput = h('input', { class: 'input sm', type: 'number', value: String(new Date().getFullYear()), title: '연도가 없는 날짜에 적용할 연도' });
  const fileInput = h('input', { type: 'file', class: 'hidden', accept: '.hwpx,.xlsx,.csv,.tsv,.txt' });

  const setRows = (rows, source) => {
    st.rows = rows.map((r) => ({ ...r, _include: true }));
    st.source = source;
    drawPreview();
    if (!rows.length) toast('읽어들일 일정을 찾지 못했습니다. 형식을 확인해 주세요.', 'warn');
    else toast(`${rows.length}건을 읽었습니다. 내용을 확인한 뒤 등록하세요.`, 'ok');
  };

  const handleFile = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.hwpx')) {
        const { paragraphs, tables } = await readHwpx(file);
        const fromTables = tables.flatMap((t) => parseTable(t, { year: +yearInput.value }));
        const rows = fromTables.length ? fromTables : parseFreeText(paragraphs.join('\n'), { year: +yearInput.value });
        setRows(rows.map((r) => ({ ...r, source: 'hwpx' })), 'hwpx');
      } else if (name.endsWith('.xlsx')) {
        const grid = await readXlsx(file);
        setRows(parseTable(grid, { year: +yearInput.value }).map((r) => ({ ...r, source: 'xlsx' })), 'xlsx');
      } else if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
        const text = await file.text();
        if (name.endsWith('.txt')) {
          setRows(parseFreeText(text, { year: +yearInput.value }).map((r) => ({ ...r, source: 'text' })), 'text');
        } else {
          const sep = name.endsWith('.tsv') ? '\t' : ',';
          const grid = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => splitCsv(l, sep));
          setRows(parseTable(grid, { year: +yearInput.value }).map((r) => ({ ...r, source: 'csv' })), 'csv');
        }
      } else if (name.endsWith('.hwp')) {
        toast('구버전 .hwp 는 바로 읽을 수 없습니다. 한글에서 [다른 이름으로 저장] → "HWPX 문서"로 저장해 올려주세요.', 'warn');
      } else {
        toast('지원하지 않는 형식입니다. hwpx · xlsx · csv · txt 를 올려주세요.', 'warn');
      }
    } catch (e) {
      console.error(e);
      toast(e.message || '파일을 읽지 못했습니다.', 'warn');
    }
  };

  fileInput.addEventListener('change', () => { handleFile(fileInput.files[0]); fileInput.value = ''; });

  const drop = h('div', { class: 'drop' },
    h('div', { class: 'drop-icon' }, '\u{1F4C4}'),
    h('p', {}, h('strong', {}, '한글(.hwpx) · 엑셀(.xlsx) · CSV 파일'), '을 여기로 끌어다 놓거나'),
    h('button', { class: 'btn', onClick: () => fileInput.click() }, '파일 고르기'),
    fileInput,
    h('p', { class: 'muted small' }, '표가 있으면 표를, 없으면 문단 글을 해석합니다.'));

  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); });

  function drawPreview() {
    clear(preview);
    if (!st.rows.length) {
      preview.appendChild(h('div', { class: 'empty' }, '아직 읽어들인 내용이 없습니다.'));
      return;
    }
    const asMode = st.mode === 'afterschool';
    preview.appendChild(h('div', { class: 'sec-head' },
      h('h3', {}, `미리보기 ${st.rows.length}건`),
      h('div', { class: 'row gap' },
        h('div', { class: 'seg' },
          h('button', { class: `seg-btn${!asMode ? ' on' : ''}`, onClick: () => { st.mode = 'activities'; drawPreview(); } }, '교육활동으로 등록'),
          h('button', { class: `seg-btn${asMode ? ' on' : ''}`, onClick: () => { st.mode = 'afterschool'; drawPreview(); } }, '방과후 강좌로 등록')),
        h('button', { class: 'btn btn-sm', onClick: () => { st.rows = []; drawPreview(); } }, '비우기'))));

    preview.appendChild(asMode ? afterPreviewTable(st.rows) : activityPreviewTable(st.rows));

    const needDate = st.rows.filter((r) => r._include && !r.date).length;
    const autoApprove = h('input', { type: 'checkbox', checked: isAdmin() });

    preview.appendChild(h('div', { class: 'submit-bar' },
      needDate && !asMode ? h('span', { class: 'warn-text' }, `날짜가 비어 있는 행이 ${needDate}건 있습니다.`) : null,
      isAdmin() ? h('label', { class: 'check' }, autoApprove, '등록과 동시에 승인') : null,
      h('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          const rows = st.rows.filter((r) => r._include);
          if (!rows.length) return toast('등록할 행을 선택해 주세요.', 'warn');
          if (!asMode && rows.some((r) => !r.date)) return toast('날짜가 빈 행이 있습니다. 채우거나 체크를 해제해 주세요.', 'warn');
          if (!(await confirmDialog(`${rows.length}건을 등록할까요?`))) return;

          const me = currentUser();
          if (asMode) {
            const progs = rows.map((r) => newAfterSchool({
              name: r.title, time: r.time, grade: r.target, room: r.place,
              teacher: r.owner, note: r.detail || '', weekdays: guessWeekdays(r),
            }));
            await putMany('afterschool', progs);
            await audit('방과후일괄등록', `${progs.length}건`, null, { count: progs.length, source: st.source });
            toast(`방과후 강좌 ${progs.length}건을 등록했습니다.`, 'ok');
            ctx.go('afterschool');
          } else {
            const approve = isAdmin() && autoApprove.checked;
            const acts = rows.map((r) => newActivity({
              date: r.date, endDate: r.endDate || '', time: r.time || '',
              title: r.title, detail: r.detail || '', target: r.target || '',
              place: r.place || '', owner: r.owner || me.name, dept: r.dept || me.dept,
              category: r.category || 'academic',
              source: r.source || st.source,
              createdBy: me.name,
              status: approve ? 'approved' : 'pending',
              reviewedBy: approve ? me.name : '',
              reviewedAt: approve ? new Date().toISOString() : '',
              _raw: r._raw || '',
            }));
            await putMany('activities', acts);
            await audit('일괄등록', `${acts.length}건`, null, { count: acts.length, source: st.source, approved: approve });
            toast(approve ? `${acts.length}건을 등록·승인했습니다.` : `${acts.length}건을 제출했습니다. 승인함에서 확인하세요.`, 'ok');
            ctx.go(approve ? 'monthly' : 'approvals');
          }
          st.rows = [];
        },
      }, asMode ? '방과후 강좌로 등록' : '등록하기')));
  }

  drawPreview();

  // 구글시트 연동 (sheets/Code.gs 를 웹앱으로 배포한 주소)
  const urlIn = h('input', {
    class: 'input', value: localStorage.getItem('sam.sheetUrl') || '',
    placeholder: 'https://script.google.com/macros/s/.../exec',
  });
  const pullSheet = async () => {
    const url = urlIn.value.trim();
    if (!url) return toast('구글시트 웹앱 주소를 입력해 주세요.', 'warn');
    localStorage.setItem('sam.sheetUrl', url);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '시트를 읽지 못했습니다.');
      setRows(parseTable(data.rows, { year: +yearInput.value }).map((r) => ({ ...r, source: 'sheet' })), 'sheet');
    } catch (e) {
      console.error(e);
      toast('구글시트를 불러오지 못했습니다: ' + e.message + ' — 시트를 CSV로 내려받아 올리는 방법도 있습니다.', 'warn');
    }
  };

  return h('div', { class: 'view' },
    h('div', { class: 'import-grid' },
      h('section', { class: 'sec' },
        h('div', { class: 'sec-head' }, h('h3', {}, '1. 파일 올리기')),
        drop),
      h('section', { class: 'sec' },
        h('div', { class: 'sec-head' },
          h('h3', {}, '1. 또는 그냥 붙여넣기'),
          h('label', { class: 'check' }, '기준 연도', yearInput)),
        paste,
        h('div', { class: 'row gap' },
          h('button', {
            class: 'btn btn-primary',
            onClick: () => setRows(parseFreeText(paste.value, { year: +yearInput.value }).map((r) => ({ ...r, source: 'text' })), 'text'),
          }, '읽어들이기'),
          h('button', { class: 'btn', onClick: () => { paste.value = ''; } }, '지우기')))),

    h('section', { class: 'sec' },
      h('div', { class: 'sec-head' }, h('h3', {}, '1. 또는 구글시트에서 가져오기')),
      h('p', { class: 'note' },
        '각 계 담당자가 구글시트에 자유롭게 적어두면, 시트의 ',
        h('strong', {}, '[교육활동 → 정리하기]'),
        ' 를 누른 뒤 여기서 한 번에 받아올 수 있습니다. 설정 방법은 ',
        h('code', {}, 'docs/SETUP-sheets.md'), ' 를 보세요.'),
      h('div', { class: 'row gap' },
        urlIn,
        h('button', { class: 'btn btn-primary', onClick: pullSheet }, '가져오기'))),

    h('section', { class: 'sec' }, preview));
}

function activityPreviewTable(rows) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'tbl tbl-edit' },
      h('thead', {}, h('tr', {},
        h('th', {}, '등록'),
        ...FIELDS.map(([, label]) => h('th', {}, label)),
        h('th', {}, '분류'), h('th', {}, '원문'))),
      h('tbody', {}, ...rows.map((r) => h('tr', { class: r._include ? '' : 'row-off' },
        h('td', {}, h('input', {
          type: 'checkbox', checked: r._include,
          onChange: (e) => { r._include = e.target.checked; e.target.closest('tr').classList.toggle('row-off', !r._include); },
        })),
        ...FIELDS.map(([key, , type]) => h('td', {},
          h('input', {
            class: `cell ${!r[key] && key === 'date' ? 'cell-warn' : ''}`, type: type || 'text', value: r[key] || '',
            onChange: (e) => { r[key] = e.target.value.trim(); e.target.classList.toggle('cell-warn', key === 'date' && !r[key]); },
          }))),
        h('td', {}, h('select', {
          class: 'cell', onChange: (e) => { r.category = e.target.value; },
        }, ...Object.entries(CATEGORY).map(([k, v]) => h('option', { value: k, selected: r.category === k }, v)))),
        h('td', { class: 'raw' }, r._raw || ''))))));
}

function afterPreviewTable(rows) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'tbl tbl-edit' },
      h('thead', {}, h('tr', {}, ...['등록', '강좌명', '시간', '대상', '장소', '강사', '요일(추정)'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...rows.map((r) => h('tr', { class: r._include ? '' : 'row-off' },
        h('td', {}, h('input', {
          type: 'checkbox', checked: r._include,
          onChange: (e) => { r._include = e.target.checked; e.target.closest('tr').classList.toggle('row-off', !r._include); },
        })),
        ...['title', 'time', 'target', 'place', 'owner'].map((key) => h('td', {},
          h('input', { class: 'cell', value: r[key] || '', onChange: (e) => { r[key] = e.target.value.trim(); } }))),
        h('td', {}, guessWeekdays(r).map((w) => WEEKDAY[w]).join('·') || '—'))))));
}

/** 방과후 강좌 행에서 요일 추정: 원문에 '월수금' 같은 표기가 있으면 잡아낸다. */
function guessWeekdays(r) {
  const src = `${r._raw || ''} ${r.detail || ''} ${r.time || ''} ${r.title || ''}`;
  const found = new Set();
  const m = src.match(/[월화수목금토일]{2,}/);
  if (m) for (const ch of m[0]) found.add(WEEKDAY.indexOf(ch));
  else {
    for (let i = 1; i <= 5; i++) {
      if (new RegExp(`(?:^|[^가-힣])${WEEKDAY[i]}요일`).test(src)) found.add(i);
    }
  }
  return [...found].filter((i) => i >= 0).sort();
}

function splitCsv(line, sep) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export { today };
