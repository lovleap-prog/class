// 설정 탭 — 사용자, 학교 정보, 저장 방식, 백업/복원, 설치 안내
import { h, toast, confirmDialog, download, clear } from '../lib/dom.js';
import { loadConfig, saveConfig, resetConfig } from '../config.js';
import { currentUser, setUser, exportAll, importAll, backendKind, list } from '../store.js';
import { ROLE } from '../model.js';
import { insertSample, removeSample, hasSample } from '../sampledata.js';
import { staffBox } from './staffbox.js';
import { bellsBox } from './bellsbox.js';

const field = (label, input, hint) =>
  h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input,
    hint ? h('span', { class: 'field-hint' }, hint) : null);

export function renderSettings(ctx) {
  const cfg = loadConfig();
  const me = currentUser();

  // ── 사용자 ──
  const nameIn = h('input', { class: 'input', value: me.name || '', placeholder: '예) 김민수' });
  const deptIn = h('input', { class: 'input', value: me.dept || '', placeholder: '예) 교무기획부' });
  const roleSel = h('select', { class: 'input' },
    ...Object.entries(ROLE).map(([k, v]) => h('option', { value: k, selected: me.role === k }, v)));

  // ── 학교 ──
  const schoolIn = h('input', { class: 'input', value: cfg.school.name || '' });
  const principalIn = h('input', { class: 'input', value: cfg.school.principal || '', placeholder: '예) 교장' });
  const contactIn = h('input', { class: 'input', value: cfg.school.contact || '' });

  // ── 저장 방식 ──
  const backendSel = h('select', { class: 'input' },
    h('option', { value: 'local', selected: cfg.backend === 'local' }, '이 컴퓨터에만 저장 (체험용, 동기화 없음)'),
    h('option', { value: 'firestore', selected: cfg.backend === 'firestore' }, 'Firebase 실시간 공유 (학교 전체)'));

  const fb = {};
  const fbFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const fbBox = h('div', { class: 'form-grid' },
    ...fbFields.map((k) => field(k, (fb[k] = h('input', { class: 'input', value: cfg.firebase[k] || '' })))),
    field('학교 구글 도메인(선택)', (fb.hd = h('input', { class: 'input', value: cfg.googleHostedDomain || '', placeholder: '예) goe.go.kr' })),
      '적어두면 그 도메인 계정만 로그인됩니다.'),
    field('학교 코드', (fb.schoolId = h('input', { class: 'input', value: cfg.schoolId || 'default' })),
      '한 프로젝트를 여러 학교가 함께 쓸 때 구분값'));
  const syncFb = () => { fbBox.style.display = backendSel.value === 'firestore' ? '' : 'none'; };
  backendSel.addEventListener('change', syncFb);
  setTimeout(syncFb, 0);

  // ── 바로가기 링크 (학교 노션 자료실 등) ──
  const linkRows = [];
  const linkBox = h('div', { class: 'link-rows' });
  const addLinkRow = (link = { label: '', url: '' }) => {
    const label = h('input', { class: 'input', value: link.label || '', placeholder: '예) 학교 자료실(노션)' });
    const url = h('input', { class: 'input', value: link.url || '', placeholder: 'https://www.notion.so/...' });
    const row = h('div', { class: 'link-row' }, label, url,
      h('button', {
        class: 'icon-btn danger', title: '이 줄 삭제',
        onClick: () => { row.remove(); const i = linkRows.indexOf(entry); if (i >= 0) linkRows.splice(i, 1); },
      }, '\u2715'));
    const entry = { label, url };
    linkRows.push(entry);
    linkBox.appendChild(row);
  };
  ((cfg.links && cfg.links.length) ? cfg.links : [{ label: '', url: '' }]).forEach(addLinkRow);

  // ── 한글 문서 ──
  const fontIn = h('input', { class: 'input', value: cfg.hwp.font });
  const sizeIn = h('input', { class: 'input', type: 'number', min: '8', max: '20', value: String(cfg.hwp.fontSize) });

  const fileIn = h('input', { type: 'file', class: 'sr-file', accept: '.json' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; fileIn.value = '';
    if (!f) return;
    try {
      const payload = JSON.parse(await f.text());
      const replace = await confirmDialog('기존 자료를 모두 지우고 복원할까요?\n[취소]를 누르면 기존 자료에 합쳐집니다.', { okText: '지우고 복원' });
      await importAll(payload, { replace });
      toast('복원했습니다.', 'ok');
      ctx.refresh();
    } catch (e) { toast('복원 실패: ' + e.message, 'warn'); }
  });

  const counts = ['activities', 'recurring', 'afterschool', 'audit'].map((c) => `${labelOf(c)} ${list(c).length}`).join(' · ');

  return h('div', { class: 'view view-narrow' },
    box('내 정보', h('div', { class: 'form-grid' },
      field('이름 *', nameIn, '결재 문구와 이력에 이 이름이 쓰입니다.'),
      field('부서/계', deptIn),
      h('div', { class: 'span2' }, field('역할', roleSel,
        '관리자만 승인·반려·오기재 수정을 할 수 있습니다.')))),

    box('학교 정보', h('div', { class: 'form-grid' },
      field('학교명', schoolIn),
      field('결재선 표기', principalIn),
      h('div', { class: 'span2' }, field('안내 문의처', contactIn, '메신저 안내문 맨 아래에 들어갑니다.')))),

    box('자료 저장 방식', h('div', {},
      h('div', { class: 'form-grid' }, h('div', { class: 'span2' }, field('저장 위치', backendSel))),
      h('p', { class: 'note' },
        '현재 연결: ', h('strong', {}, backendKind() === 'firestore' ? 'Firebase 실시간 공유' : '이 컴퓨터(로컬)'),
        ' — ', counts),
      fbBox,
      h('p', { class: 'muted small' }, '저장 위치를 바꾸면 새로 고침해야 적용됩니다. 설정 방법은 docs/SETUP-firebase.md 를 보세요.'))),

    box('담당자 자동 매칭 (업무분장표 · 과거 계획 학습)', staffBox(ctx)),

    box('바로가기 링크', h('div', {},
      h('p', { class: 'note' },
        '머리말 오른쪽에 버튼으로 걸립니다. 학교 노션 자료실, 업무포털 주소 등을 넣으세요. ',
        '새 창에서 열리며, ', h('strong', {}, '접근 권한이 없는 분은 그쪽에서 막히므로'),
        ' 링크가 보이는 것 자체는 문제되지 않습니다.'),
      linkBox,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn btn-sm', onClick: () => addLinkRow() }, '+ 줄 추가')),
      h('p', { class: 'muted small' },
        '여기서 넣은 값은 이 컴퓨터에만 저장됩니다. 모든 선생님에게 똑같이 보이게 하려면 ',
        h('code', {}, 'app/js/config.js'), ' 의 ', h('code', {}, 'links'), ' 를 고쳐 배포하세요.'))),

    box('시정표 (기본 · 단축 · 수업공개)', bellsBox(ctx)),

    box('결재용 한글 문서', h('div', { class: 'form-grid' },
      field('글꼴', fontIn),
      field('글자 크기(pt)', sizeIn))),

    box('둘러보기용 예시 자료', h('div', {},
      h('p', { class: 'note' },
        '이번 주 일정·반복일정·방과후 강좌 예시를 한 번에 넣어 화면이 어떻게 보이는지 확인할 수 있습니다. ',
        '예시 자료만 골라서 한 번에 지울 수 있으니 실제 자료와 섞이지 않습니다.'),
      h('div', { class: 'row gap' },
        h('button', {
          class: 'btn', onClick: async () => {
            if (hasSample() && !(await confirmDialog('이미 예시 자료가 들어 있습니다. 한 벌 더 넣을까요?'))) return;
            const n = await insertSample();
            toast(`예시 자료 ${n}건을 넣었습니다. [일일]·[주간] 탭을 보세요.`, 'ok');
            ctx.refresh();
          },
        }, '예시 자료 넣기'),
        h('button', {
          class: 'btn btn-danger', onClick: async () => {
            if (!hasSample()) return toast('지울 예시 자료가 없습니다.', 'warn');
            if (!(await confirmDialog('예시 자료만 골라서 지웁니다. 직접 입력하신 자료는 그대로 남습니다.', { danger: true, okText: '지우기' }))) return;
            const n = await removeSample();
            toast(`예시 자료 ${n}건을 지웠습니다.`, 'ok');
            ctx.refresh();
          },
        }, '예시 자료만 지우기')))),

    box('백업 · 복원', h('div', { class: 'row gap' },
      h('button', {
        class: 'btn', onClick: () => {
          const data = JSON.stringify(exportAll(), null, 2);
          download(`교육활동백업_${new Date().toISOString().slice(0, 10)}.json`, new Blob([data], { type: 'application/json' }));
        },
      }, '전체 내려받기(JSON)'),
      h('button', { class: 'btn', onClick: () => fileIn.click() }, '파일에서 복원'),
      fileIn,
      h('button', {
        class: 'btn btn-danger', onClick: async () => {
          if (!(await confirmDialog('설정을 초기값으로 되돌릴까요? (등록한 일정은 지워지지 않습니다)', { danger: true, okText: '초기화' }))) return;
          resetConfig(); toast('설정을 초기화했습니다. 새로 고쳐 주세요.', 'ok');
        },
      }, '설정 초기화'))),

    box('바탕화면에 설치하기', h('div', {},
      h('ol', { class: 'guide' },
        h('li', {}, '크롬 또는 엣지로 이 주소를 엽니다.'),
        h('li', {}, '주소창 오른쪽 끝의 ', h('strong', {}, '설치(⊕)'), ' 아이콘을 누릅니다. (엣지: ··· → 앱 → 이 사이트를 앱으로 설치)'),
        h('li', {}, '바탕화면에 아이콘이 생기고, 브라우저 주소창 없는 창으로 열립니다.'),
        h('li', {}, '휴대전화는 크롬/사파리에서 ', h('strong', {}, '홈 화면에 추가'), ' 를 누르면 됩니다.')),
      h('p', { class: 'muted small' }, '설치해도 자료는 서버에 있으므로, 어느 기기에서 고쳐도 모두에게 바로 반영됩니다(Firebase 사용 시).'))),

    h('div', { class: 'submit-bar' },
      h('button', {
        class: 'btn btn-primary',
        onClick: () => {
          if (!nameIn.value.trim()) return toast('이름을 입력해 주세요.', 'warn');
          setUser({ name: nameIn.value.trim(), dept: deptIn.value.trim(), role: roleSel.value });
          const next = loadConfig();
          next.school = { name: schoolIn.value.trim(), principal: principalIn.value.trim(), contact: contactIn.value.trim() };
          next.backend = backendSel.value;
          next.schoolId = fb.schoolId.value.trim() || 'default';
          next.googleHostedDomain = fb.hd.value.trim();
          next.links = linkRows
            .map((r) => ({ label: r.label.value.trim(), url: r.url.value.trim() }))
            .filter((l) => l.url)
            .map((l) => ({ label: l.label || l.url.replace(/^https?:\/\//, '').slice(0, 24), url: l.url }));
          for (const k of fbFields) next.firebase[k] = fb[k].value.trim();
          next.hwp = { font: fontIn.value.trim() || '함초롬바탕', fontSize: Number(sizeIn.value) || 11 };

          saveConfig(next);
          toast('저장했습니다.', 'ok');
          ctx.refresh();
        },
      }, '설정 저장')));
}

function box(title, node) {
  return h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', {}, title)), node);
}

const labelOf = (c) => ({ activities: '일정', recurring: '반복', afterschool: '방과후', audit: '이력' }[c] || c);
