// Firestore 백엔드 — 실시간 동기화 + 구글 로그인.
// 설정에서 backend:'firestore' 이고 firebase 키가 채워졌을 때만 동적으로 불러온다.
import { COLLECTIONS, emit, setUser } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

export async function createFirestoreBackend(cfg) {
  const [appMod, dbMod, authMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);

  const app = appMod.initializeApp(cfg.firebase);
  const db = dbMod.getFirestore(app);
  const auth = authMod.getAuth(app);
  const schoolId = cfg.schoolId || 'default';
  const base = (c) => dbMod.collection(db, 'schools', schoolId, c);

  // 오프라인에서도 열리도록 로컬 캐시를 켠다(여러 탭 동시 사용 허용).
  try { await dbMod.enableMultiTabIndexedDbPersistence(db); } catch { /* 이미 켜졌거나 미지원 */ }

  const cache = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  let firstLoad;
  let stopChecks = null;   // 개인 체크 구독 해제 함수

  // 개인 체크는 남이 읽을 수 없어야 하므로 컬렉션 전체가 아니라 '내 문서 하나'만 구독한다.
  // (파이어스토어는 권한 없는 문서가 섞일 수 있는 질의를 통째로 거부하기 때문에,
  //  읽기 규칙을 본인으로 좁히려면 구독도 문서 단위여야 한다)
  function watchMyChecks(uid) {
    if (stopChecks) { stopChecks(); stopChecks = null; }
    cache.checks = [];
    emit('checks');
    if (!uid) return;
    stopChecks = dbMod.onSnapshot(
      dbMod.doc(db, 'schools', schoolId, 'checks', uid),
      (snap) => {
        cache.checks = snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
        emit('checks');
      },
      (err) => console.error('[firestore] checks', err),
    );
  }

  async function signIn() {
    const provider = new authMod.GoogleAuthProvider();
    if (cfg.googleHostedDomain) provider.setCustomParameters({ hd: cfg.googleHostedDomain });
    await authMod.signInWithPopup(auth, provider);
  }

  async function resolveMember(u) {
    // schools/{id}/members/{uid} 문서의 role 로 권한을 정한다.
    const ref = dbMod.doc(db, 'schools', schoolId, 'members', u.uid);
    const snap = await dbMod.getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    if (!data) {
      // 최초 로그인: 대기 상태로 등록해 두고 관리자가 역할을 부여한다.
      await dbMod.setDoc(ref, {
        email: u.email || '', name: u.displayName || u.email || '',
        role: 'teacher', dept: '', joinedAt: new Date().toISOString(),
      });
    }
    setUser({
      uid: u.uid,
      email: u.email || '',
      name: (data && data.name) || u.displayName || u.email || '',
      role: (data && data.role) || 'teacher',
      dept: (data && data.dept) || '',
    });
  }

  authMod.onAuthStateChanged(auth, async (u) => {
    if (u) { await resolveMember(u); watchMyChecks(u.uid); emit('auth'); }
    else { setUser({ uid: '', role: 'teacher' }); watchMyChecks(null); emit('auth'); }
  });

  function watch() {
    // checks 는 로그인이 끝난 뒤 watchMyChecks() 가 따로 구독한다.
    const shared = COLLECTIONS.filter((c) => c !== 'checks');
    const waits = shared.map((c) => new Promise((res) => {
      let done = false;
      dbMod.onSnapshot(base(c), (snap) => {
        cache[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        emit(c);
        if (!done) { done = true; res(); }
      }, (err) => {
        console.error('[firestore]', c, err);
        if (!done) { done = true; res(); }
      });
    }));
    return Promise.all(waits);
  }

  return {
    kind: 'firestore',
    signIn,
    signOut: () => authMod.signOut(auth),
    async ready() { firstLoad = watch(); await firstLoad; },
    list(c) { return cache[c] || []; },
    async put(c, doc) {
      const { id, ...rest } = doc;
      await dbMod.setDoc(dbMod.doc(db, 'schools', schoolId, c, id), rest, { merge: false });
    },
    async putMany(c, docs) {
      // 배치 한도(500)에 맞춰 잘라서 쓴다.
      for (let i = 0; i < docs.length; i += 400) {
        const batch = dbMod.writeBatch(db);
        for (const d of docs.slice(i, i + 400)) {
          const { id, ...rest } = d;
          batch.set(dbMod.doc(db, 'schools', schoolId, c, id), rest);
        }
        await batch.commit();
      }
    },
    async remove(c, id) { await dbMod.deleteDoc(dbMod.doc(db, 'schools', schoolId, c, id)); },
    async replace(c, docs) {
      const existing = cache[c].map((d) => d.id);
      const keep = new Set(docs.map((d) => d.id));
      for (const id of existing) if (!keep.has(id)) await this.remove(c, id);
      await this.putMany(c, docs);
    },
  };
}
