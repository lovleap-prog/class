// 저장소 파사드 — 백엔드(로컬/Firestore)를 갈아끼울 수 있게 분리했다.
// 화면 코드는 이 파일의 API만 사용한다.
import { uid } from './model.js';

export const COLLECTIONS = [
  'activities', 'recurring', 'afterschool', 'audit', 'checks',
  'staff', 'lessons', 'timetable',
  'bells',    // 시정표 (기본 / 단축 / 수업공개 …)
  'daybell',  // 날짜별로 어떤 시정을 쓰는지. 문서 id 가 날짜다.
  'notices',  // 공지사항 · 월별 중점지도
  'academic', // 학사일정 (1학기 / 2학기)
  'trips',    // 출장 신청
  'memos',    // 개인 메모. 사람마다 문서 하나. 본인만 읽는다.
  'members',  // 로그인한 사람 명단. 승인 전에는 아무것도 못 본다. (Firestore 전용)
  'board',    // 공지 — 기간을 정해 붙여 둔다. 관리자와 '공지 권한' 받은 사람이 쓴다.
];

let backend = null;
// approved: 관리자가 명단에서 승인했는가. 로컬 저장에서는 늘 참이다(혼자 쓰는 것이므로).
let user = { name: '', role: 'teacher', dept: '', email: '', uid: '', approved: true, canNotice: false };

export function currentUser() { return user; }
export function setUser(u) {
  user = { ...user, ...u };
  localStorage.setItem('sam.user', JSON.stringify(user));
  emit('user');
}

export function loadSavedUser() {
  try {
    const raw = localStorage.getItem('sam.user');
    if (raw) user = { ...user, ...JSON.parse(raw) };
  } catch { /* 저장값이 깨졌으면 기본값 사용 */ }
  return user;
}

export const isAdmin = () => user.role === 'admin' && user.approved !== false;

/** 자료를 볼 수 있는 사람인가. 승인 전에는 화면을 잠근다. */
export const isApproved = () => user.approved !== false;

/**
 * 공지를 쓸 수 있는가.
 * 관리자 말고도, 교무행정사처럼 관리자가 따로 권한을 준 사람이 쓴다.
 * 공문 접수·안내장 수합을 담임 선생님들께 알리는 일은 그분들이 하기 때문이다.
 */
export const canPost = () => isApproved() && (user.role === 'admin' || user.canNotice === true);

// ── 이벤트 버스 ─────────────────────────────────────────────
const listeners = new Map();
export function on(topic, cb) {
  if (!listeners.has(topic)) listeners.set(topic, new Set());
  listeners.get(topic).add(cb);
  return () => listeners.get(topic).delete(cb);
}
export function emit(topic) {
  for (const cb of listeners.get(topic) || []) cb();
  for (const cb of listeners.get('*') || []) cb(topic);
}

// ── 초기화 ─────────────────────────────────────────────────
export async function initStore(cfg) {
  if (cfg.backend === 'firestore' && cfg.firebase && cfg.firebase.apiKey) {
    const mod = await import('./store-firestore.js');
    backend = await mod.createFirestoreBackend(cfg);
  } else {
    backend = createLocalBackend();
  }
  await backend.ready();
  return backend.kind;
}

export function backendKind() { return backend ? backend.kind : 'none'; }

// ── 로그인 (Firestore 일 때만 뜻이 있다) ─────────────────────
/** 구글 로그인 창을 연다. */
export async function signIn() {
  if (backend && backend.signIn) return backend.signIn();
  throw new Error('이 저장 방식에는 로그인이 없습니다.');
}
export async function signOut() {
  if (backend && backend.signOut) return backend.signOut();
}
/** 로그인해야 하는 방식인데 아직 로그인하지 않았는가 */
export function needsSignIn() {
  return !!(backend && backend.signedIn) && !backend.signedIn();
}
/** 명단의 한 사람을 고친다(승인·역할). 관리자만. */
export async function setMember(uid2, patch) {
  if (!backend || !backend.setMember) throw new Error('이 저장 방식에는 명단이 없습니다.');
  await backend.setMember(uid2, patch);
  emit('members');
}

// ── 데이터 API ─────────────────────────────────────────────
export function list(col) { return backend.list(col); }

export async function put(col, doc) {
  const rec = { ...doc, updatedAt: new Date().toISOString() };
  if (!rec.id) rec.id = uid(col.slice(0, 3));
  await backend.put(col, rec);
  emit(col);
  return rec;
}

export async function putMany(col, docs) {
  const now = new Date().toISOString();
  const recs = docs.map((d) => ({ ...d, id: d.id || uid(col.slice(0, 3)), updatedAt: now }));
  await backend.putMany(col, recs);
  emit(col);
  return recs;
}

export async function remove(col, id) {
  await backend.remove(col, id);
  emit(col);
}

export function get(col, id) { return list(col).find((d) => d.id === id) || null; }

/** 변경 이력 기록 — '오기재 수정'의 근거를 남긴다. */
export async function audit(action, target, before, after) {
  await backend.put('audit', {
    id: uid('log'), at: new Date().toISOString(),
    by: user.name || '(이름없음)', role: user.role,
    action, targetId: target, before: slim(before), after: slim(after),
  });
  emit('audit');
}

function slim(o) {
  if (!o) return null;
  const { history, ...rest } = o;
  return rest;
}

/** 백업 대상. 개인 체크(checks)는 사람마다 다른 값이라 백업에 넣지 않는다. */
// 명단(members)도 뺀다. 로그인 계정에 딸린 것이라 백업 파일로 옮길 성질이 아니다.
export const BACKUP_COLLECTIONS = COLLECTIONS.filter(
  (c) => c !== 'checks' && c !== 'memos' && c !== 'members');

/** 업무분장표를 통째로 갈아끼운다. */
export async function replaceAllStaff(docs) {
  await backend.replace('staff', docs);
  emit('staff');
}

export function exportAll() {
  const data = {};
  for (const c of BACKUP_COLLECTIONS) data[c] = list(c);
  return { exportedAt: new Date().toISOString(), version: 1, data };
}

export async function importAll(payload, { replace = false } = {}) {
  const data = payload && payload.data ? payload.data : payload;
  for (const c of BACKUP_COLLECTIONS) {
    if (!Array.isArray(data[c])) continue;
    if (replace) await backend.replace(c, data[c]);
    else await backend.putMany(c, data[c]);
    emit(c);
  }
}

// ── 로컬 백엔드 (브라우저 저장소 + 탭 간 동기화) ──────────────
function createLocalBackend() {
  const KEY = (c) => `sam.col.${c}`;
  const cache = {};
  const chan = 'BroadcastChannel' in window ? new BroadcastChannel('sam-sync') : null;

  const read = (c) => {
    try { return JSON.parse(localStorage.getItem(KEY(c)) || '[]'); }
    catch { return []; }
  };
  const write = (c) => {
    localStorage.setItem(KEY(c), JSON.stringify(cache[c]));
    if (chan) chan.postMessage({ col: c });
  };

  if (chan) {
    chan.onmessage = (e) => {
      const c = e.data && e.data.col;
      if (!c) return;
      cache[c] = read(c);
      emit(c);
    };
  }
  // 다른 창에서의 변경 (BroadcastChannel 미지원 브라우저 대비)
  window.addEventListener('storage', (e) => {
    const c = COLLECTIONS.find((x) => KEY(x) === e.key);
    if (c) { cache[c] = read(c); emit(c); }
  });

  return {
    kind: 'local',
    async ready() { for (const c of COLLECTIONS) cache[c] = read(c); },
    list(c) { return cache[c] || []; },
    async put(c, doc) {
      const arr = cache[c] || (cache[c] = []);
      const i = arr.findIndex((d) => d.id === doc.id);
      if (i >= 0) arr[i] = doc; else arr.push(doc);
      write(c);
    },
    async putMany(c, docs) {
      const arr = cache[c] || (cache[c] = []);
      for (const doc of docs) {
        const i = arr.findIndex((d) => d.id === doc.id);
        if (i >= 0) arr[i] = doc; else arr.push(doc);
      }
      write(c);
    },
    async remove(c, id) {
      cache[c] = (cache[c] || []).filter((d) => d.id !== id);
      write(c);
    },
    async replace(c, docs) { cache[c] = docs.slice(); write(c); },
  };
}
