// 앱 설정. 학교별로 이 파일만 고치면 된다.
// backend: 'local'  → 이 컴퓨터 브라우저에만 저장(설치·체험용, 동기화 없음)
//          'firestore' → 학교 전체 실시간 공유 (권장). docs/SETUP-firebase.md 참고
const DEFAULTS = {
  backend: 'local',
  schoolId: 'default',
  school: {
    name: '○○초등학교',
    principal: '',
    contact: '교무기획부',
  },
  // 'firestore' 를 쓸 때만 채우면 된다. Firebase 콘솔 > 프로젝트 설정 > 웹 앱.
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  // 학교 구글 계정만 로그인시키려면 도메인을 적는다. 예: 'goe.go.kr'
  googleHostedDomain: '',
  hwp: { font: '함초롬바탕', fontSize: 11 },
};

const LS_KEY = 'sam.config';

export function loadConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { saved = {}; }
  return deepMerge(structuredClone(DEFAULTS), saved);
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_KEY, JSON.stringify(cfg));
}

export function resetConfig() { localStorage.removeItem(LS_KEY); }

function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) base[k] = deepMerge(base[k] || {}, v);
    else if (v !== undefined) base[k] = v;
  }
  return base;
}

export { DEFAULTS };
