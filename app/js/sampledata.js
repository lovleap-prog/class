// 둘러보기용 예시 자료. 처음 켰을 때 화면이 어떻게 보이는지 확인하는 용도다.
// 넣은 자료는 모두 sample:true 로 표시해서 한 번에 지울 수 있다.
import { newActivity, newRecurring, newAfterSchool, today, addDays, weekStart } from './model.js';
import { list, putMany, remove, currentUser } from './store.js';

export function hasSample() {
  return ['activities', 'recurring', 'afterschool'].some((c) => list(c).some((d) => d.sample));
}

export async function insertSample() {
  const mon = weekStart(today());
  const d = (n) => addDays(mon, n);
  const me = currentUser().name || '김민수';
  const approved = (o) => ({
    ...o, sample: true, status: 'approved',
    createdBy: o.createdBy || me, reviewedBy: me, reviewedAt: new Date().toISOString(),
  });

  const activities = [
    approved({ date: d(0), time: '1~2교시', title: '소방대피 훈련', target: '전교생', place: '운동장', owner: '박지현', dept: '생활인성부', category: 'safety' }),
    approved({ date: d(0), time: '4교시', title: '학부모 공개수업', target: '3학년', place: '각 교실', owner: '김서연', dept: '교무기획부', category: 'academic' }),
    approved({ date: d(1), time: '15:00', title: '교직원 다모임', target: '교직원', place: '회의실', owner: me, dept: '교무기획부', category: 'meeting' }),
    approved({ date: d(2), time: '3교시', title: '정보통신윤리교육', target: '5~6학년', place: '컴퓨터실', owner: '이수진', dept: '교무기획부', category: 'safety' }),
    approved({
      date: d(3), endDate: d(4), title: '가을 현장체험학습(경주)', target: '5학년',
      place: '', owner: '최영호', dept: '교육과정부', category: 'event',
      detail: '08:30 학교 출발 / 16:40 학교 도착 예정',
    }),
    // 승인 흐름을 볼 수 있도록 대기 건도 하나 넣는다.
    {
      date: d(4), time: '2교시', title: '학교폭력 예방교육', target: '4학년',
      place: '시청각실', owner: '박지현', dept: '생활인성부', category: 'safety',
      sample: true, status: 'pending', createdBy: '박지현',
    },
  ].map((o) => newActivity(o));

  const recurring = [
    { title: '아침 독서활동', freq: 'weekly', weekdays: [1, 2, 3, 4, 5], time: '08:40~09:00', target: '전교생', place: '각 교실', dept: '교무기획부', category: 'academic' },
    { title: '전교 학생 다모임', freq: 'monthlyNth', weekdays: [1], nth: [1], time: '4교시', target: '전교생', place: '강당', dept: '생활인성부', category: 'meeting' },
  ].map((o) => ({ ...newRecurring({ ...o, owner: me }), sample: true }));

  const afterschool = [
    { name: '창의로봇과학', teacher: '이수진', grade: '3~4학년', room: '과학실', weekdays: [1, 3], time: '15:00~16:40', capacity: '16', enrolled: '15', fee: '무료' },
    { name: '바이올린', teacher: '정미래', grade: '1~6학년', room: '음악실', weekdays: [2, 4], time: '15:00~16:00', capacity: '12', enrolled: '12', fee: '30,000원' },
    { name: '생활체육 배드민턴', teacher: '강도현', grade: '4~6학년', room: '체육관', weekdays: [1, 5], time: '16:00~17:00', capacity: '20', enrolled: '17', fee: '무료' },
    { name: '한글 또박또박', teacher: '윤하늘', grade: '1~2학년', room: '돌봄교실', weekdays: [3], time: '13:40~14:40', capacity: '10', enrolled: '8', fee: '무료' },
  ].map((o) => ({ ...newAfterSchool(o), sample: true, term: '2학기' }));

  await putMany('activities', activities);
  await putMany('recurring', recurring);
  await putMany('afterschool', afterschool);
  return activities.length + recurring.length + afterschool.length;
}

export async function removeSample() {
  let n = 0;
  for (const col of ['activities', 'recurring', 'afterschool']) {
    for (const doc of list(col).filter((x) => x.sample)) {
      await remove(col, doc.id);
      n++;
    }
  }
  return n;
}
