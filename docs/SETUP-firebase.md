# Firebase 실시간 공유 설정 (30분)

학교 전체가 같은 자료를 보고, 어느 기기에서 고쳐도 바로 반영되게 만드는 단계입니다.
개발 경험이 없어도 따라 할 수 있게 적었습니다.

## 1. 프로젝트 만들기

1. https://console.firebase.google.com 접속 → **프로젝트 추가**
2. 이름은 아무거나 (예: `school-activity`). Google 애널리틱스는 **사용 안 함**으로 두면 됩니다.

## 2. 웹 앱 등록

1. 프로젝트 개요 화면에서 **웹(`</>`)** 아이콘 클릭
2. 앱 닉네임 입력 → 등록
3. 화면에 나오는 `firebaseConfig` 값을 복사해 둡니다.

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "school-activity.firebaseapp.com",
  projectId: "school-activity",
  storageBucket: "school-activity.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

> 이 값들은 비밀번호가 아닙니다. 웹앱에 그대로 들어가는 공개 식별자이고,
> 실제 보호는 아래 **보안 규칙**이 합니다.

## 3. 로그인 방식 켜기

**빌드 → Authentication → 시작하기 → Google** 사용 설정.
학교 구글 계정(Workspace)을 쓰면 아래 6번에서 도메인을 제한할 수 있습니다.

## 4. 데이터베이스 만들기

**빌드 → Firestore Database → 데이터베이스 만들기**
위치는 `asia-northeast3 (서울)` 을 고르세요. 모드는 **프로덕션 모드**.

## 5. 보안 규칙 붙여넣기

Firestore의 **규칙** 탭에 아래를 그대로 넣고 게시합니다.
`default` 자리에는 설정 탭에 적은 '학교 코드'를 씁니다(그대로 둬도 됩니다).

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function member(school) {
      return get(/databases/$(database)/documents/schools/$(school)/members/$(request.auth.uid)).data;
    }
    function isAdmin(school) {
      return request.auth != null && member(school).role == 'admin';
    }
    function signedIn() { return request.auth != null; }

    match /schools/{school}/members/{uid} {
      allow read: if signedIn();
      // 첫 로그인 때 본인 문서만 만들 수 있고, 역할은 teacher 로 고정
      allow create: if signedIn() && request.auth.uid == uid
                    && request.resource.data.role == 'teacher';
      // 역할 변경은 관리자만
      allow update, delete: if isAdmin(school);
    }

    match /schools/{school}/activities/{id} {
      allow read: if signedIn();
      // 교사는 '확인 대기' 상태로만 올릴 수 있다
      allow create: if signedIn() &&
        (isAdmin(school) || request.resource.data.status == 'pending');
      // 승인/반려와 남의 글 수정은 관리자만.
      // 교사는 아직 대기 중인 '자기 글'만 고칠 수 있다.
      allow update: if isAdmin(school) ||
        (signedIn()
         && resource.data.status == 'pending'
         && request.resource.data.status == 'pending'
         && resource.data.createdBy == member(school).name);
      allow delete: if isAdmin(school) ||
        (signedIn() && resource.data.status == 'pending'
         && resource.data.createdBy == member(school).name);
    }

    // 반복일정 · 방과후 시간표는 관리자만 고친다
    match /schools/{school}/recurring/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }
    match /schools/{school}/afterschool/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }

    // 개인 확인 체크 — 문서 id 가 그 사람의 uid 다.
    // 읽기도 본인만. 앱도 컬렉션 전체가 아니라 본인 문서 하나만 구독한다.
    match /schools/{school}/checks/{uid} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }

    // 개인 메모 — 문서 id 가 그 사람의 uid 다. 본인만 읽고 쓴다.
    match /schools/{school}/memos/{uid} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }

    // 공지사항 · 월별 중점지도 · 학사일정 · 시정표 — 읽기는 모두, 쓰기는 관리자만
    match /schools/{school}/notices/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }
    match /schools/{school}/academic/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }
    match /schools/{school}/bells/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }
    match /schools/{school}/daybell/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }
    match /schools/{school}/timetable/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }

    // 출장 — 본인이 신청하고, 승인·반려는 관리자만
    match /schools/{school}/trips/{id} {
      allow read: if signedIn();
      allow create: if signedIn() &&
        (isAdmin(school) || request.resource.data.status == 'pending');
      allow update: if isAdmin(school) ||
        (signedIn()
         && resource.data.status == 'pending'
         && request.resource.data.status == 'pending'
         && resource.data.applicant == member(school).name);
      allow delete: if isAdmin(school) ||
        (signedIn() && resource.data.status == 'pending'
         && resource.data.applicant == member(school).name);
    }

    // 업무분장 · 학습 사례 — 읽기는 모두, 쓰기는 관리자만
    match /schools/{school}/staff/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }
    match /schools/{school}/lessons/{id} {
      allow read: if signedIn();
      allow write: if isAdmin(school);
    }

    // 이력은 남기기만 하고 고치지 못하게
    match /schools/{school}/audit/{id} {
      allow read: if signedIn();
      allow create: if signedIn();
      allow update, delete: if false;
    }
  }
}
```

## 6. 앱에 값 넣기

방법은 둘 중 하나입니다.

**(가) 앱 화면에서** — 앱 실행 → **설정** 탭 → '자료 저장 방식'을
`Firebase 실시간 공유` 로 바꾸고 2번에서 복사한 값들을 붙여넣은 뒤 [설정 저장] → 새로 고침.
이 방법은 그 컴퓨터에만 적용됩니다.

**(나) 파일에 박아두기(권장)** — `app/js/config.js` 를 열어
`backend` 를 `'firestore'` 로 바꾸고 `firebase` 항목을 채워 저장합니다.
이러면 선생님들은 주소만 열면 되고 아무 설정도 하지 않아도 됩니다.

```js
const DEFAULTS = {
  backend: 'firestore',
  schoolId: 'default',
  ...
  firebase: {
    apiKey: 'AIza...',
    authDomain: 'school-activity.firebaseapp.com',
    projectId: 'school-activity',
    storageBucket: 'school-activity.appspot.com',
    messagingSenderId: '1234567890',
    appId: '1:1234567890:web:abcdef',
  },
  googleHostedDomain: 'goe.go.kr',   // 학교 구글 도메인만 로그인 허용 (선택)
};
```

## 7. 관리자 지정

1. 선생님이 먼저 앱에 들어가 구글 로그인을 합니다. → `members` 컬렉션에 본인 문서가 생깁니다.
2. Firebase 콘솔 → Firestore → `schools/default/members/{본인 uid}` 문서를 열어
   `role` 값을 `teacher` → **`admin`** 으로 바꿉니다.
3. 앱을 새로 고치면 승인함이 열립니다. 이후 다른 관리자는 앱에서 추가하지 말고 같은 방법으로 지정하세요.

## 8. 배포

앱은 정적 파일이라 아무 데나 올려도 됩니다.

**→ 넷리파이로 올리는 법은 `docs/DEPLOY-netlify.md` 에 따로 적어두었습니다.**
깃허브에 연결해두면 올릴 때마다 자동으로 배포되고, 명령어를 쓸 일이 없습니다.

다른 길도 있습니다.

- **GitHub Pages** — 저장소 Settings → Pages → Branch `main` / 폴더 `/ (root)`
  → 주소는 `https://<계정>.github.io/class/app/`
- **Firebase Hosting** — `npm i -g firebase-tools && firebase init hosting && firebase deploy`
  (public 폴더를 `app` 으로 지정)

**반드시 `https://` 주소여야 합니다.** 그래야 설치(PWA)와 구글 로그인이 됩니다.

### ⚠️ 어디에 올리든 — 승인된 도메인

배포 주소가 정해지면 **Authentication → Settings → 승인된 도메인** 에 그 주소를 넣어야 합니다.
넣지 않으면 구글 로그인 창이 뜨자마자 닫힙니다. 가장 흔한 실수입니다.

## 고친 것이 자동으로 반영되나

두 가지를 나눠서 봐야 합니다. **자료는 자동, 앱은 반자동**입니다.

### 자료(일정·승인·시간표) — 자동입니다

앱은 모든 자료를 파이어스토어의 `onSnapshot` 으로 **구독**합니다.
누가 어디서 고치든 서버가 밀어주기 때문에, 보고 있는 화면이 **새로 고침 없이** 바뀝니다.

| 이런 일이 생기면 | 다른 선생님 화면은 |
|---|---|
| 교사가 일정 등록 | 관리자 승인함에 곧바로 뜸 |
| 관리자가 승인 | 신청한 분 화면에서 '확인 대기' 가 사라짐 |
| 날짜를 끌어서 옮김 | 모두의 주간·월간이 같이 움직임 |
| 시간표·공지·학사일정 수정 | 즉시 |

휴대전화와 컴퓨터를 같이 켜 두고 한쪽에서 고쳐 보면 바로 확인됩니다.

> 개인 메모와 개인 확인 체크만 예외입니다. 본인 것만 오갑니다(아래 참고).

### 앱(기능 수정) — 다음에 열 때 반영됩니다

앱 파일은 **'네트워크 우선'** 으로 받습니다. 새 파일을 올리면 선생님들이 **다음에 앱을 열 때**
자동으로 받아갑니다. 따로 알려서 다시 깔게 할 필요가 없습니다.

앱을 하루 종일 켜 두는 분을 위해, 새 판이 올라오면 화면 아래에
**`새 버전이 나왔습니다 [새로고침]`** 이 뜹니다. 눌러야 바뀌고, [나중에] 로 미룰 수 있습니다.

**앱 파일을 고쳐 올릴 때는 `app/sw.js` 맨 위의 `VERSION` 을 한 칸 올려주세요.**

```js
const VERSION = 'v2';   // → 'v3' 으로
```

이걸 올려야 학교 컴퓨터에 남은 옛 파일이 버려집니다.
안 올리면 어떤 분은 새 화면, 어떤 분은 옛 화면을 보는 일이 생깁니다.

> 급할 때(한 분만 화면이 이상할 때)는 그 컴퓨터에서 **Ctrl+Shift+R** 로 강제 새로 고침하면 됩니다.

### 정리

| | 누가 반영하나 | 언제 |
|---|---|---|
| 일정·승인·시간표·공지 | 파이어스토어 | 즉시, 새로 고침 없이 |
| 앱 기능 수정 | 올린 파일 + 서비스워커 | 다음에 열 때 (켜 둔 화면은 알림 뒤 새로고침) |
| 보안 규칙 | 파이어베이스 콘솔에서 [게시] | 게시 즉시 |

보안 규칙은 앱 파일과 **따로** 갑니다. 규칙을 고쳤으면 콘솔에서 [게시] 를 눌러야 합니다.

## 개인 확인 체크에 대해

일일교육활동의 체크박스는 일정 문서를 건드리지 않고 `checks` 컬렉션에 사람별로 따로 저장합니다.
그래서 **내가 체크해도 다른 선생님 화면은 그대로**이고, 같은 사람이 컴퓨터와 휴대전화에서 봐도
체크는 따라갑니다.

읽기·쓰기 모두 **본인 문서로 제한**했습니다. 앱도 `checks` 컬렉션 전체가 아니라
로그인한 본인의 문서 하나만 구독합니다. 그래서 개발자 도구를 열어도 남의 체크는 나오지 않습니다.
("누가 무엇을 아직 안 했는지"가 교직원 사이에 드러나지 않도록 한 것입니다)

이 때문에 체크 구독은 다른 자료와 달리 **로그인이 끝난 뒤에** 시작됩니다.
로그인 직후 잠깐 체크가 비어 보였다가 채워질 수 있는데 정상입니다.

## 점검

- 선생님 컴퓨터와 휴대전화에서 각각 열어 같은 일정이 보이는지
- 교사 계정으로 등록했을 때 **확인 대기**로 들어가는지
- 관리자 계정에서 승인하면 교사 화면이 **새로 고치지 않아도** 바뀌는지
