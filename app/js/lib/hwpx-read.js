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

function readTable(tbl) {
  const rows = [];
  for (const tr of Array.from(tbl.children).filter((c) => local(c) === 'tr')) {
    const cells = [];
    for (const tc of Array.from(tr.children).filter((c) => local(c) === 'tc')) {
      const parts = [];
      (function walk(el) {
        for (const c of Array.from(el.children || [])) {
          if (local(c) === 'p') parts.push(paraText(c));
          else walk(c);
        }
      })(tc);
      // 줄바꿈을 살린다. 시간표는 한 칸에 여러 줄이 들어가고, 그 줄이 곧 항목 하나다.
      cells.push(parts.map((x) => x.trim()).filter(Boolean).join('\n'));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}
