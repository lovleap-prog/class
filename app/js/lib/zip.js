// 의존성 없는 ZIP 읽기/쓰기.
// 압축은 브라우저 내장 CompressionStream('deflate-raw') 를 쓴다.
// (hwpx · xlsx 가 모두 ZIP 컨테이너라 이 한 파일로 둘 다 처리한다.)

const SIG_EOCD = 0x06054b50;
const SIG_CEN  = 0x02014b50;
const SIG_LOC  = 0x04034b50;

const td = new TextDecoder('utf-8');
const te = new TextEncoder();

export function hasNativeDeflate() {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

// ── 읽기 ───────────────────────────────────────────────────
/** ArrayBuffer → { '경로': Uint8Array } */
export async function unzip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // EOCD 를 뒤에서부터 찾는다 (주석 최대 65535바이트).
  let eocd = -1;
  const minStart = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= minStart; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 형식이 아닙니다. (EOCD 없음)');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const out = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== SIG_CEN) break;
    const method   = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen  = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen   = dv.getUint16(p + 32, true);
    const locOff   = dv.getUint32(p + 42, true);
    const name     = td.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;

    if (dv.getUint32(locOff, true) !== SIG_LOC) continue;
    const lNameLen  = dv.getUint16(locOff + 26, true);
    const lExtraLen = dv.getUint16(locOff + 28, true);
    const start = locOff + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + compSize);

    if (name.endsWith('/')) continue;
    out[name] = method === 0 ? raw.slice() : await inflateRaw(raw);
  }
  return out;
}

export async function inflateRaw(bytes) {
  if (!hasNativeDeflate()) throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 크롬/엣지 최신판을 써 주세요.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function deflateRaw(bytes) {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const textOf = (bytes) => (bytes ? td.decode(bytes) : '');

// ── 쓰기 ───────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * entries: [{ name, data(string|Uint8Array), store?:boolean }]
 * store:true 인 항목은 무압축으로 넣는다(hwpx 의 mimetype 은 반드시 무압축 첫 항목).
 */
export async function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const data = typeof e.data === 'string' ? te.encode(e.data) : e.data;
    const name = te.encode(e.name);
    const crc = crc32(data);
    const store = !!e.store || !hasNativeDeflate();
    const body = store ? data : await deflateRaw(data);
    const method = store ? 0 : 8;

    const lh = new Uint8Array(30 + name.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, SIG_LOC, true);
    ldv.setUint16(4, 20, true);          // version needed
    ldv.setUint16(6, 0x0800, true);      // UTF-8 파일명 플래그
    ldv.setUint16(8, method, true);
    ldv.setUint16(10, 0, true);          // mod time
    ldv.setUint16(12, 0x0021, true);     // mod date (1996-01-01)
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, body.length, true);
    ldv.setUint32(22, data.length, true);
    ldv.setUint16(26, name.length, true);
    ldv.setUint16(28, 0, true);
    lh.set(name, 30);

    const ch = new Uint8Array(46 + name.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, SIG_CEN, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, method, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0x0021, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, body.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, name.length, true);
    cdv.setUint32(42, offset, true);
    ch.set(name, 46);

    locals.push(lh, body);
    centrals.push(ch);
    offset += lh.length + body.length;
  }

  const cenSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, SIG_EOCD, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, cenSize, true);
  edv.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, end], { type: 'application/zip' });
}
