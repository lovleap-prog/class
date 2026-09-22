// xlsx 첫 시트를 2차원 배열로 읽는다(수식 결과값 기준).
import { unzip, textOf } from './zip.js';

export async function readXlsx(file) {
  const files = await unzip(await file.arrayBuffer());
  const shared = files['xl/sharedStrings.xml'] ? parseShared(textOf(files['xl/sharedStrings.xml'])) : [];
  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!sheetName) throw new Error('엑셀 시트를 찾지 못했습니다.');
  return parseSheet(textOf(files[sheetName]), shared);
}

function parseShared(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) =>
    Array.from(si.getElementsByTagName('t')).map((t) => t.textContent).join(''));
}

function parseSheet(xml, shared) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rows = [];
  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const r = Number(row.getAttribute('r') || rows.length + 1) - 1;
    const cells = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const col = colIndex(c.getAttribute('r') || '');
      const type = c.getAttribute('t');
      let v = '';
      if (type === 'inlineStr') {
        v = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent).join('');
      } else {
        const vEl = c.getElementsByTagName('v')[0];
        const raw = vEl ? vEl.textContent : '';
        v = type === 's' ? (shared[Number(raw)] || '') : raw;
      }
      cells[col] = String(v).trim();
    }
    rows[r] = Array.from(cells, (x) => x || '');
  }
  return Array.from(rows, (x) => x || []).filter((r) => r.some((c) => c));
}

function colIndex(ref) {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
