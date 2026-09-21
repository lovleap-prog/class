/**
 * 학교 교육활동 관리 — 구글 시트 연동 스크립트 (Google Apps Script)
 *
 * 쓰임새
 *  1) 각 계 담당자가 '자유입력' 시트(또는 구글 설문지)에 편한 형식으로 적는다.
 *  2) [교육활동] 메뉴 → [정리하기] 를 누르면 '정리됨' 시트에 표준 열로 정돈된다.
 *  3) 웹앱으로 배포하면 앱의 [불러오기] 탭에서 주소만 넣어 그대로 받아올 수 있다.
 *
 * 설치
 *  - 구글 시트 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *  - 배포 → 새 배포 → 유형 '웹 앱' → 실행 계정 '나', 액세스 권한 '링크가 있는 모든 사용자'
 *  - 생성된 /exec 주소를 앱 [불러오기] 탭의 '구글시트에서 가져오기'에 넣는다.
 *    (학교 밖 공개가 부담스러우면 액세스를 '같은 조직'으로 두고, 대신 CSV를 내려받아 올린다)
 */

var SHEET_RAW = '자유입력';
var SHEET_OUT = '정리됨';
var HEADERS = ['날짜', '종료일', '시간', '활동명', '대상', '장소', '담당', '부서', '비고'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('교육활동')
    .addItem('자유입력 → 정리하기', 'normalizeSheet')
    .addItem('시트 처음 만들기', 'setupSheets')
    .addToUi();
}

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName(SHEET_RAW)) {
    var raw = ss.insertSheet(SHEET_RAW);
    raw.getRange(1, 1, 1, 3).setValues([['작성자', '부서/계', '내용(형식 자유)']]);
    raw.getRange(2, 1, 1, 3).setValues([[
      '김민수', '교무기획부',
      '9월 22일(월)\n - 1~2교시 3학년 안전교육 (시청각실)\n - 전교생 아침독서 08:40',
    ]]);
    raw.setFrozenRows(1);
  }
  if (!ss.getSheetByName(SHEET_OUT)) {
    var out = ss.insertSheet(SHEET_OUT);
    out.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    out.setFrozenRows(1);
  }
  SpreadsheetApp.getUi().alert('시트를 만들었습니다. "' + SHEET_RAW + '" 시트에 자유롭게 적은 뒤 [교육활동 → 정리하기]를 누르세요.');
}

/** 자유입력 시트를 읽어 표준 열로 정돈한다. */
function normalizeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var raw = ss.getSheetByName(SHEET_RAW);
  if (!raw) { setupSheets(); return; }
  var out = ss.getSheetByName(SHEET_OUT) || ss.insertSheet(SHEET_OUT);

  var values = raw.getDataRange().getValues().slice(1); // 머리글 제외
  var year = new Date().getFullYear();
  var rows = [];

  values.forEach(function (r) {
    var owner = String(r[0] || '').trim();
    var dept = String(r[1] || '').trim();
    var text = String(r[2] || '');
    parseFreeText(text, year).forEach(function (item) {
      rows.push([
        item.date, item.endDate, item.time, item.title,
        item.target, item.place, item.owner || owner, dept, item.raw,
      ]);
    });
  });

  out.clear();
  out.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  if (rows.length) out.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
  out.setFrozenRows(1);
  out.autoResizeColumns(1, HEADERS.length);
  SpreadsheetApp.getUi().alert(rows.length + '건을 정리했습니다. "' + SHEET_OUT + '" 시트를 확인하세요.');
}

/** 웹앱: 정리됨 시트를 JSON 으로 돌려준다. (앱의 '구글시트에서 가져오기'가 이 주소를 부른다) */
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = (e && e.parameter && e.parameter.sheet) || SHEET_OUT;
  var sh = ss.getSheetByName(name);
  var payload = { ok: false, rows: [], error: '' };

  if (!sh) {
    payload.error = '시트를 찾을 수 없습니다: ' + name;
  } else {
    var values = sh.getDataRange().getDisplayValues();
    payload.ok = true;
    payload.sheet = name;
    payload.rows = values;
  }
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 자유 형식 해석 (앱의 textparse.js 와 같은 규칙의 축약판) ─────────────
var PLACES = ['체육관', '강당', '운동장', '시청각실', '다목적실', '도서관', '도서실', '과학실',
  '컴퓨터실', '음악실', '미술실', '실과실', '영어실', '급식실', '보건실', '상담실', '방송실',
  '교실', '회의실', '교무실', '돌봄교실'];

function pad2(n) { return ('0' + n).slice(-2); }

function parseFreeText(text, year) {
  var out = [];
  var curDate = '';
  var curMonth = new Date().getMonth() + 1;

  String(text).split(/\r?\n/).forEach(function (rawLine) {
    var raw = rawLine.replace(/ /g, ' ').trim();
    if (!raw) return;
    var line = raw.replace(/^\s*(?:[-*•·○●□■]|\(?\d{1,2}[.)](?!\d)|[가-힣][.)](?=\s)|[①-⑳])\s*/, '').trim();
    if (!line) return;

    var date = '', endDate = '';
    var m = line.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
    if (m) {
      date = m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
      curMonth = Number(m[2]);
      line = cut(line, m);
    } else {
      m = line.match(/(?:^|[\s([{])(\d{1,2})\s*[/.월]\s*(\d{1,2})\s*일?(?!\s*(?:학년|반|교시|명|층|회|번))\s*(?:[~-]\s*(?:(\d{1,2})\s*[/.월]\s*)?(\d{1,2})\s*일?)?/);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) {
        date = year + '-' + pad2(m[1]) + '-' + pad2(m[2]);
        if (m[4]) endDate = year + '-' + pad2(m[3] || m[1]) + '-' + pad2(m[4]);
        curMonth = Number(m[1]);
        line = cut(line, m);
      } else {
        m = line.match(/(?:^|[\s([{])(\d{1,2})\s*(?:일(?!\s*(?:반|정|과))|\(\s*[월화수목금토일]\s*\))/);
        if (m) { date = year + '-' + pad2(curMonth) + '-' + pad2(m[1]); line = cut(line, m); }
      }
    }
    if (date) curDate = date; else date = curDate;
    if (!line || /^[([{]?\s*[월화수목금토일]\s*[)\]}]?$/.test(line)) return;

    var time = '';
    m = line.match(/(\d{1,2})\s*:\s*(\d{2})\s*(?:[~-]\s*(\d{1,2})\s*:\s*(\d{2}))?/);
    if (m) { time = m[3] ? pad2(m[1]) + ':' + m[2] + '~' + pad2(m[3]) + ':' + m[4] : pad2(m[1]) + ':' + m[2]; line = cut(line, m); }
    else {
      m = line.match(/(\d)\s*[~-]\s*(\d)\s*교시/) || line.match(/(\d)\s*교시/) || line.match(/(아침활동|아침|조회|중식|점심|방과\s*후|종례|창체)/);
      if (m) { time = m[0].replace(/\s+/g, ''); line = cut(line, m); }
    }

    var place = '';
    for (var i = 0; i < PLACES.length; i++) {
      // '각 교실' 처럼 앞에 붙는 수식어까지 함께 가져간다.
      var hit = line.match(new RegExp('(?:(?:각|전|제\\s*\\d+|\\d+)\\s*)?' + PLACES[i]));
      if (hit) { place = hit[0].trim(); line = cut(line, hit); break; }
    }

    var target = '';
    m = line.match(/전\s*교\s*생|전\s*학\s*년/) || line.match(/(\d)\s*학년\s*(\d)\s*반/) ||
        line.match(/(\d)\s*[~-]\s*(\d)\s*학년/) || line.match(/(\d)\s*학년/);
    if (m) { target = m[0].replace(/\s+/g, ' ').trim(); line = cut(line, m); }

    var owner = '';
    m = line.match(/담당\s*[:：]?\s*([가-힣]{2,4})/) || line.match(/([가-힣]{2,4})\s*(?:선생님|교사)(?![가-힣])/);
    if (m) { owner = m[1]; line = cut(line, m); }

    var title = line.replace(/[([{]\s*[,·\s]*[)\]}]/g, ' ')
      .replace(/^[\s,.:;·\-~|/()[\]]+/, '').replace(/[\s,.:;·\-~|/]+$/, '')
      .replace(/\s{2,}/g, ' ').trim();
    if (!title) return;

    out.push({ date: date, endDate: endDate, time: time, title: title, target: target, place: place, owner: owner, raw: raw });
  });
  return out;
}

function cut(line, m) {
  return (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length))
    .replace(/\(\s*[월화수목금토일]\s*\)/, ' ')
    .replace(/^[\s,.:·\-~)\]]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
