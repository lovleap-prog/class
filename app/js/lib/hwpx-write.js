// 결재용 한글 문서(.hwpx) 생성 — OWPML 최소 구성.
// 표 없이 '문단' 으로만 구성한다. 나이스 일일교육활동 결재 본문이 원래 줄글 형식이고,
// hwpx 표 구조(hp:tbl)는 스펙이 까다로워 호환성 위험이 커서 의도적으로 제외했다.
// 표가 필요한 방과후학교 시간표는 exportHtmlForHwp() 로 내보낸다(한글이 HTML을 표째로 연다).
import { zip } from './zip.js';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\u0000/g, '');

const XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'];

function fontfaces(hangul, latin) {
  return `<hh:fontfaces itemCnt="${LANGS.length}">` + LANGS.map((lang) => {
    const face = lang === 'LATIN' ? latin : hangul;
    return `<hh:fontface lang="${lang}" fontCnt="1">` +
      `<hh:font id="0" face="${esc(face)}" type="TTF" isEmbedded="0">` +
      `<hh:typeInfo familyType="FCAT_UNKNOWN" serifStyle="OSS_UNKNOWN" weight="0" proportion="0" contrast="0" strokeVariation="0" armStyle="0" letterform="0" midline="0" xHeight="0"/>` +
      `</hh:font></hh:fontface>`;
  }).join('') + `</hh:fontfaces>`;
}

/** 글자 모양: 0=본문, 1=제목(굵게·크게), 2=작은 글씨 */
function charProperties(baseSize) {
  const pr = (id, height, bold) =>
    `<hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">` +
    `<hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    `<hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
    `<hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    `<hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>` +
    `<hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>` +
    (bold ? '<hh:bold/>' : '') +
    `</hh:charPr>`;
  return `<hh:charProperties itemCnt="3">${pr(0, baseSize, false)}${pr(1, Math.round(baseSize * 1.35), true)}${pr(2, Math.round(baseSize * 0.85), false)}</hh:charProperties>`;
}

/** 문단 모양: 0=왼쪽, 1=가운데 */
function paraProperties() {
  const pr = (id, align) =>
    `<hh:paraPr id="${id}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">` +
    `<hh:align horizontal="${align}" vertical="BASELINE"/>` +
    `<hh:heading type="NONE" idRef="0" level="0"/>` +
    `<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>` +
    `<hh:autoSpacing eAsianEng="0" eAsianNum="0"/>` +
    `<hh:switch><hh:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
    `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:case>` +
    `<hh:default>` +
    `<hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin>` +
    `<hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:default></hh:switch>` +
    `<hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/>` +
    `</hh:paraPr>`;
  return `<hh:paraProperties itemCnt="2">${pr(0, 'JUSTIFY')}${pr(1, 'CENTER')}</hh:paraProperties>`;
}

function headerXml(opt) {
  const base = Math.round((opt.fontSize || 11) * 100);
  return XMLH +
    `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" version="1.4" secCnt="1">` +
    `<hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>` +
    `<hh:refList>` +
    fontfaces(opt.font || '함초롬바탕', opt.fontLatin || '함초롬바탕') +
    `<hh:borderFills itemCnt="2">` +
      borderFill(1, 'NONE') + borderFill(2, 'SOLID') +
    `</hh:borderFills>` +
    charProperties(base) +
    `<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>` +
    `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">` +
      [1, 2, 3, 4, 5, 6, 7].map((l) =>
        `<hh:paraHead start="1" level="${l}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^${l}.</hh:paraHead>`).join('') +
    `</hh:numbering></hh:numberings>` +
    paraProperties() +
    `<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>` +
    `</hh:refList>` +
    `<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument>` +
    `</hh:head>`;
}

function borderFill(id, type) {
  const line = (dir) => `<hh:${dir} type="${type}" width="0.12 mm" color="#000000"/>`;
  return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">` +
    `<hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>` +
    line('leftBorder') + line('rightBorder') + line('topBorder') + line('bottomBorder') +
    `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>`;
}

const LINESEG = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray>';

function secPr() {
  return `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">` +
    `<hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0" strtnum="0"/>` +
    `<hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>` +
    `<hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/>` +
    `<hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>` +
    `<hp:pagePr landscape="WIDELY" width="59528" height="84188" gutterType="LEFT_ONLY">` +
      `<hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr>` +
    `<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
      `<hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>` +
      `<hp:noteSpacing betweenNotes="850" belowLine="567" aboveLine="850"/>` +
      `<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>` +
    `<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>` +
      `<hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>` +
      `<hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>` +
      `<hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>` +
    ['BOTH', 'EVEN', 'ODD'].map((t) =>
      `<hp:pageBorderFill type="${t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">` +
      `<hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`).join('') +
    `</hp:secPr>`;
}

/** 문단 하나. kind: 'title' | 'body' | 'small' */
function para(id, text, kind = 'body', first = false) {
  const charPr = kind === 'title' ? 1 : kind === 'small' ? 2 : 0;
  const paraPr = kind === 'title' ? 1 : 0;
  const inner = first
    ? `${secPr()}<hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl>`
    : '';
  const t = text ? `<hp:t>${esc(text)}</hp:t>` : '<hp:t></hp:t>';
  return `<hp:p id="${id}" paraPrIDRef="${paraPr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">` +
    `<hp:run charPrIDRef="${charPr}">${inner}${t}</hp:run>${LINESEG}</hp:p>`;
}

function sectionXml(blocks) {
  const body = blocks.map((b, i) => para(i, b.text, b.kind, i === 0)).join('');
  return XMLH +
    `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core">` +
    body + `</hs:sec>`;
}

const CONTAINER = XMLH +
  `<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">` +
  `<ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>`;

const MANIFEST = XMLH +
  `<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" version="1.0">` +
  `<odf:file-entry odf:full-path="/" odf:media-type="application/hwp+zip"/>` +
  `<odf:file-entry odf:full-path="Contents/content.hpf" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="Contents/header.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="Contents/section0.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="settings.xml" odf:media-type="application/xml"/>` +
  `<odf:file-entry odf:full-path="version.xml" odf:media-type="application/xml"/>` +
  `</odf:manifest>`;

const VERSION = XMLH +
  `<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" ` +
  `major="5" minor="0" micro="5" buildNumber="0" os="10" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="9, 0, 0, 0"/>`;

const SETTINGS = XMLH +
  `<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="http://www.hancom.co.kr/hwpml/2011/config-item">` +
  `<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`;

function contentHpf(title) {
  return XMLH +
    `<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" version="" unique-identifier="" id="">` +
    `<opf:metadata><opf:title>${esc(title)}</opf:title><opf:language>ko</opf:language>` +
    `<opf:meta name="creator" content="학교 교육활동 관리"/></opf:metadata>` +
    `<opf:manifest>` +
    `<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>` +
    `<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>` +
    `<opf:item id="settings" href="settings.xml" media-type="application/xml"/>` +
    `</opf:manifest>` +
    `<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>` +
    `</opf:package>`;
}

/**
 * 줄글 텍스트 → .hwpx Blob
 * @param {string} text  줄바꿈으로 구분된 본문
 * @param {object} opt   { title, font, fontSize, titleLine }
 */
export async function buildHwpx(text, opt = {}) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const blocks = [];
  if (opt.titleLine) { blocks.push({ text: opt.titleLine, kind: 'title' }); blocks.push({ text: '', kind: 'body' }); }
  for (const l of lines) blocks.push({ text: l, kind: 'body' });
  if (!blocks.length) blocks.push({ text: '', kind: 'body' });

  return zip([
    // mimetype 은 반드시 첫 항목 + 무압축이어야 한다.
    { name: 'mimetype', data: 'application/hwp+zip', store: true },
    { name: 'version.xml', data: VERSION },
    { name: 'settings.xml', data: SETTINGS },
    { name: 'META-INF/container.xml', data: CONTAINER },
    { name: 'META-INF/manifest.xml', data: MANIFEST },
    { name: 'Contents/content.hpf', data: contentHpf(opt.title || '교육활동') },
    { name: 'Contents/header.xml', data: headerXml(opt) },
    { name: 'Contents/section0.xml', data: sectionXml(blocks) },
  ]);
}

/**
 * 한글이 확실히 여는 폴백: A4 서식이 들어간 HTML.
 * 한글에서 [불러오기] → 파일 형식 'HTML 문서' 로 열면 표까지 그대로 들어온다.
 */
export function buildHtmlForHwp({ title, paragraphs = [], tables = [], font = '함초롬바탕', fontSize = 11 }) {
  const tableHtml = tables.map((t) => `
  <h2>${esc(t.caption || '')}</h2>
  <table>
    <thead><tr>${(t.head || []).map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${(t.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 15mm; }
  body { font-family: "${esc(font)}", "맑은 고딕", serif; font-size: ${fontSize}pt; line-height: 1.6; color:#000; }
  h1 { font-size: ${(fontSize * 1.5).toFixed(0)}pt; text-align: center; margin: 0 0 18pt; }
  h2 { font-size: ${(fontSize * 1.1).toFixed(0)}pt; margin: 16pt 0 6pt; }
  p  { margin: 0 0 2pt; white-space: pre-wrap; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 12pt; }
  th, td { border: 1px solid #000; padding: 4pt 6pt; font-size: ${(fontSize * 0.95).toFixed(0)}pt; text-align: center; }
  th { background: #eee; }
</style></head>
<body>
<h1>${esc(title)}</h1>
${paragraphs.map((p) => `<p>${esc(p) || '&nbsp;'}</p>`).join('\n')}
${tableHtml}
</body></html>`;
}
