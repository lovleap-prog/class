// hwpx(한글 2010 이상 표준 문서) 읽기 — 문단 텍스트와 표를 뽑아낸다.
// hwpx 는 ZIP + OWPML(XML) 이라 브라우저에서 바로 열 수 있다.
import { unzip, textOf } from './zip.js';

/** File → { paragraphs: string[], tables: string[][][] } */
export async function readHwpx(file) {
  const buf = await file.arrayBuffer();
  const sig = new Uint8Array(buf, 0, 4);
  if (!(sig[0] === 0x50 && sig[1] === 0x4b)) {
    throw new Error('HWPX 파일이 아닙니다. 구버전 .hwp 라면 한글에서 [다른 이름으로 저장] → 파일 형식 "HWPX 문서"로 저장한 뒤 올려주세요.');
  }
  const files = await unzip(buf);
  const sections = Object.keys(files)
    .filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort();
  if (!sections.length) throw new Error('문서 본문(Contents/section0.xml)을 찾지 못했습니다.');

  const paragraphs = [];
  const tables = [];
  for (const name of sections) {
    const doc = new DOMParser().parseFromString(textOf(files[name]), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('문서 XML을 해석하지 못했습니다.');
    walkSection(doc.documentElement, paragraphs, tables);
  }
  return { paragraphs: paragraphs.filter((s) => s.trim()), tables };
}

const local = (el) => (el.localName || el.nodeName.replace(/^.*:/, ''));

function walkSection(root, paragraphs, tables) {
  for (const child of Array.from(root.children || [])) {
    const name = local(child);
    if (name === 'p') {
      // 표가 들어 있는 문단은 표로만 처리한다(본문 중복 방지).
      const tbls = findTables(child);
      if (tbls.length) { for (const t of tbls) tables.push(readTable(t)); continue; }
      paragraphs.push(paraText(child));
    } else {
      walkSection(child, paragraphs, tables);
    }
  }
}

function findTables(el, acc = []) {
  for (const c of Array.from(el.children || [])) {
    if (local(c) === 'tbl') acc.push(c);
    else findTables(c, acc);
  }
  return acc;
}

/** 문단 안의 <hp:t> 들을 이어 붙인다. 줄바꿈 태그는 공백으로. */
function paraText(p) {
  let out = '';
  (function walk(el) {
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 3) { out += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      const n = local(c);
      if (n === 'tbl') continue;                 // 표는 따로 처리
      if (n === 'lineBreak' || n === 'br') { out += ' '; continue; }
      if (n === 'tab') { out += '\t'; continue; }
      walk(c);
    }
  })(p);
  return out.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * 표 한 장 → 2차원 배열.
 *
 * 한글 표는 칸이 병합되면 줄마다 칸 수가 달라진다. 순서대로 읽으면 열이 밀려서
 * '3월 4월 5월' 같은 머리글과 아래 자료가 어긋난다. 그래서 각 칸이 들고 있는
 * 주소(cellAddr)와 병합 크기(cellSpan)를 그대로 써서 격자에 앉힌다.
 *
 *   가로 병합 → 같은 값을 채운다. 열을 찾을 때 편하다.
 *   세로 병합 → 첫 줄에만 두고 아래는 비운다. 행사가 여러 날로 번지면 안 된다.
 *
 * 주소가 없는 표(다른 프로그램이 만든 것)는 차례대로 앉힌다.
 */
function readTable(tbl) {
  const trs = Array.from(tbl.children).filter((c) => local(c) === 'tr');
  const grid = [];
  const taken = new Set();

  const put = (r, c, v) => {
    while (grid.length <= r) grid.push([]);
    const row = grid[r];
    while (row.length <= c) row.push('');
    row[c] = v;
    taken.add(`${r},${c}`);
  };
  const attr = (el, name, dflt) => {
    const v = el && el.getAttribute(name);
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : dflt;
  };
  const childOf = (el, name) =>
    Array.from(el.children).find((c) => local(c) === name) || null;

  for (let ri = 0; ri < trs.length; ri++) {
    let autoCol = 0;
    for (const tc of Array.from(trs[ri].children).filter((c) => local(c) === 'tc')) {
      const text = cellText(tc);
      const addr = childOf(tc, 'cellAddr');
      const span = childOf(tc, 'cellSpan');
      const rowSpan = attr(span, 'rowSpan', 1);
      const colSpan = attr(span, 'colSpan', 1);

      const r = addr ? Number(addr.getAttribute('rowAddr')) || 0 : ri;
      let c = addr ? Number(addr.getAttribute('colAddr')) || 0 : autoCol;
      if (!addr) while (taken.has(`${r},${c}`)) c++;

      for (let dc = 0; dc < colSpan; dc++) put(r, c + dc, text);
      for (let dr = 1; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) put(r + dr, c + dc, '');
      }
      autoCol = c + colSpan;
    }
  }

  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  return grid.map((r) => {
    const row = r.slice();
    while (row.length < width) row.push('');
    return row;
  });
}

/** 칸 안의 글. 줄바꿈을 살린다. 안에 또 표가 있으면 들어가지 않는다. */
function cellText(tc) {
  const parts = [];
  (function walk(el) {
    for (const c of Array.from(el.children || [])) {
      const n = local(c);
      if (n === 'tbl') continue;
      if (n === 'p') parts.push(paraText(c));
      else walk(c);
    }
  })(tc);
  return parts.map((x) => x.trim()).filter(Boolean).join('\n');
}
