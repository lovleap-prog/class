// 저장소 파사드 — 백엔드(로컬/Firestore)를 갈아끼울 수 있게 분리했다.
// 화면 코드는 이 파일의 API만 사용한다.
import { uid } from './model.js';

export const COLLECTIONS = ['activities', 'recurring', 'afterschool', 'audit', 'checks', 'staff', 'lessons', 'timetable'];

let backend = null;
let user = { name: '', role: 'teacher', dept: '', email: '' };

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

export const isAdmin = () => user.role === 'admin';

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
export const BACKUP_COLLECTIONS = COLLECTIONS.filter((c) => c !== 'checks');

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
