// 결재 문구 / 메신저 안내 / 한글 파일 내보내기 모달
import { h, openModal, toast, copyText, download } from '../lib/dom.js';
import { neisApprovalText, messengerText, periodText } from '../lib/neis.js';
import { buildHwpx, buildHtmlForHwp } from '../lib/hwpx-write.js';
import { dayBundle, periodBundle, afterSchoolFor } from '../select.js';
import { fmtK, parseYmd, WEEKDAY } from '../model.js';
import { loadConfig } from '../config.js';

const fileDate = (d) => String(d).replace(/-/g, '');

export function openDayExport(date) {
  const cfg = loadConfig();
  const bundle = dayBundle(date);
  const school = { ...cfg.school };

  const opts = { includeRecurring: true, includeAfterSchool: true };
  const cbRec = h('input', { type: 'checkbox', checked: true });
  const cbAs  = h('input', { type: 'checkbox', checked: true });

  const out = h('textarea', { class: 'input mono', rows: 18, spellcheck: 'false' });
  const tabs = ['나이스 결재용', '메신저 안내용'];
  let mode = 0;

  const render = () => {
    opts.includeRecurring = cbRec.checked;
    opts.includeAfterSchool = cbAs.checked;
    const p = { ...bundle, school, options: opts };
    out.value = mode === 0 ? neisApprovalText(p) : messengerText(p);
  };

  const tabBar = h('div', { class: 'seg' },
    ...tabs.map((t, i) => h('button', {
      class: `seg-btn${i === 0 ? ' on' : ''}`,
      onClick: (e) => {
        mode = i;
        for (const b of e.currentTarget.parentNode.children) b.classList.remove('on');
        e.currentTarget.classList.add('on');
        render();
      },
    }, t)));

  cbRec.addEventListener('change', render);
  cbAs.addEventListener('change', render);

  const body = h('div', {},
    tabBar,
    h('div', { class: 'row gap' },
      h('label', { class: 'check' }, cbRec, '반복(상시) 일정 포함'),
      h('label', { class: 'check' }, cbAs, '방과후학교 포함')),
    out,
    h('p', { class: 'muted small' },
      '문구는 바로 고칠 수 있습니다. 고친 내용 그대로 복사·내려받기 됩니다.'));

  render();

  openModal(`${fmtK(date)} 내보내기`, body, [
    { label: '닫기', onClick: (c) => c() },
    {
      label: '복사',
      onClick: async () => {
        const ok = await copyText(out.value);
        toast(ok ? '복사했습니다. 나이스/메신저에 붙여넣으세요.' : '복사에 실패했습니다.', ok ? 'ok' : 'warn');
      },
    },
    {
      label: '한글용 HTML',
      onClick: () => {
        const html = buildHtmlForHwp({
          title: `${fmtK(date)} 일일교육활동`,
          paragraphs: out.value.split('\n').slice(1),
          tables: bundle.afterSchool.length ? [afterSchoolTable(date)] : [],
          font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
        });
        download(`일일교육활동_${fileDate(date)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
        toast('한글에서 [불러오기] → 파일 형식 "HTML 문서"로 열면 됩니다.', 'ok');
      },
    },
    {
      label: '한글(.hwpx)',
      class: 'btn-primary',
      onClick: async () => {
        try {
          const lines = out.value.split('\n');
          const blob = await buildHwpx(lines.slice(1).join('\n'), {
            title: `${fmtK(date)} 일일교육활동`,
            titleLine: lines[0],
            font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
          });
          download(`일일교육활동_${fileDate(date)}.hwpx`, blob);
          toast('내려받았습니다. 열리지 않으면 [한글용 HTML]을 쓰세요.', 'ok');
        } catch (e) {
          console.error(e);
          toast('한글 파일 생성에 실패했습니다: ' + e.message, 'warn');
        }
      },
    },
  ]);
}

function afterSchoolTable(date) {
  const rows = afterSchoolFor(date).map((c) => [c.time || '', c.name || '', c.grade || '', c.room || '', c.teacher || '', c.enrolled || '']);
  return { caption: `방과후학교 운영 현황 (${fmtK(date)})`, head: ['시간', '강좌명', '대상', '장소', '강사', '인원'], rows };
}

/** 주간·월간 내보내기 */
export function openPeriodExport(from, to, title) {
  const cfg = loadConfig();
  const days = periodBundle(from, to).filter((d) => d.activities.length || d.recurring.length || d.afterSchool.length);
  const out = h('textarea', { class: 'input mono', rows: 20, spellcheck: 'false' });
  out.value = periodText({ from, to, days, title });

  const body = h('div', {}, out,
    h('p', { class: 'muted small' }, '승인된 일정만 담깁니다. 대기 중인 건은 먼저 승인해 주세요.'));

  openModal(`${title} 내보내기`, body, [
    { label: '닫기', onClick: (c) => c() },
    { label: '복사', onClick: async () => { await copyText(out.value); toast('복사했습니다.', 'ok'); } },
    {
      label: '한글용 HTML',
      onClick: () => {
        const html = buildHtmlForHwp({
          title, paragraphs: out.value.split('\n').slice(1),
          font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
        });
        download(`${title.replace(/\s/g, '')}_${fileDate(from)}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
      },
    },
    {
      label: '한글(.hwpx)',
      class: 'btn-primary',
      onClick: async () => {
        const lines = out.value.split('\n');
        const blob = await buildHwpx(lines.slice(1).join('\n'), {
          title, titleLine: lines[0], font: cfg.hwp.font, fontSize: cfg.hwp.fontSize,
        });
        download(`${title.replace(/\s/g, '')}_${fileDate(from)}.hwpx`, blob);
      },
    },
  ]);
}

/** 방과후학교 시간표만 따로 표로 내보내기 */
export function openAfterSchoolExport(programs) {
  const cfg = loadConfig();
  const head = ['요일', '시간', '강좌명', '대상', '장소', '강사', '정원', '현원', '수강료', '비고'];
  const rows = programs.map((p) => [
    (p.weekdays || []).map((w) => WEEKDAY[w]).join('·'),
    p.time || '', p.name || '', p.grade || '', p.room || '', p.teacher || '',
    p.capacity || '', p.enrolled || '', p.fee || '', p.note || '',
  ]);
  const title = `방과후학교 운영 시간표${cfg.school.name ? ` - ${cfg.school.name}` : ''}`;
  const html = buildHtmlForHwp({ title, paragraphs: [], tables: [{ caption: '', head, rows }], font: cfg.hwp.font, fontSize: cfg.hwp.fontSize });

  openModal('방과후학교 시간표 내보내기', h('div', {},
    h('p', {}, `총 ${programs.length}개 강좌를 표로 내보냅니다.`),
    h('p', { class: 'muted small' }, '표가 들어간 문서는 HTML로 내보내 한글에서 여는 쪽이 서식이 가장 깨끗합니다.')), [
    { label: '닫기', onClick: (c) => c() },
    {
      label: 'CSV(엑셀)',
      onClick: () => {
        const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        download('방과후학교시간표.csv', new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      },
    },
    {
      label: '한글용 HTML',
      class: 'btn-primary',
      onClick: () => {
        download('방과후학교시간표.html', new Blob([html], { type: 'text/html;charset=utf-8' }));
        toast('한글에서 [불러오기] → "HTML 문서"로 열면 표 그대로 들어옵니다.', 'ok');
      },
    },
  ]);
}

export { parseYmd };
