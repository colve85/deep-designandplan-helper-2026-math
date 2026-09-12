/**********************************************************************
 * Hwpx.gs — 한글(.hwpx) 문서 생성 모듈
 *
 * 설계안 블록 배열을 받아 한컴오피스 한글에서 바로 열리는 .hwpx 파일을
 * 만들어 base64 문자열로 돌려준다.
 *
 * 원리
 *  1) HWPX_TPL_B64 : 스타일(글자모양/문단모양/테두리)이 미리 정의된
 *     빈 hwpx 파일을 gzip → base64 로 넣어 둔 것.
 *  2) 실행 시 ungzip → unzip 하여 부품(header.xml 등)을 얻고,
 *     Contents/section0.xml 만 새로 만들어 갈아 끼운다.
 *  3) 다시 zip 으로 묶는다. mimetype 을 맨 앞에 무압축(STORE)으로 넣어야
 *     한글이 정상 인식하므로 Utilities.zip 대신 자체 ZIP 라이터를 쓴다.
 *
 * 블록 형식 (buildDesignBlocks 참고)
 *   {t:'title',    text:'...'}
 *   {t:'h1',       text:'...'}
 *   {t:'h2',       text:'...'}
 *   {t:'p',        text:'...'}
 *   {t:'hint',     text:'...'}
 *   {t:'bullet',   text:'...'}
 *   {t:'table',    head:['..','..'], rows:[['..','..']], weights:[1,3]}
 *   {t:'spacer'}
 *   {t:'pagebreak'}
 **********************************************************************/

/* 템플릿에 정의해 둔 서식 ID (mktemplate 단계에서 확정된 값) */
var HWPX_CHAR = {
  title: 7,   // 16pt 굵게 #1F3864
  h1:    8,   // 13pt 굵게 #1F3864
  h2:    9,   // 11pt 굵게 #2F5597
  body: 10,   // 10.5pt
  bold: 11,   // 10.5pt 굵게
  hint: 12,   // 9.5pt 회색
  thead:13,   // 10pt 굵게 #1F3864
  tbody: 1    // 10pt
};
var HWPX_PARA = {
  title: 20,  // 가운데 정렬
  head:  21,  // 제목용(위 여백 + 다음 문단과 붙임)
  body:  22,  // 본문
  cell:  23,  // 표 안
  indent:24   // 들여쓴 본문
};
var HWPX_BF = { head: 3, cell: 4 };   // 표 머리행 / 일반 칸 테두리·채우기
var HWPX_TEXT_WIDTH = 42520;          // 본문 영역 가로 폭(HWPUNIT)

/* ------------------------------------------------------------------ */
/* 1. 공개 함수                                                        */
/* ------------------------------------------------------------------ */

/**
 * 블록 배열 → .hwpx 바이트(base64)
 * @param {Array} blocks
 * @return {string} base64
 */
function hwpxFromBlocks(blocks, options) {
  var parts = hwpxLoadTemplateParts_();
  var tplSection = hwpxBytesToString_(parts['Contents/section0.xml']);
  var cut = tplSection.indexOf('</hp:p>');
  if (cut < 0) throw new Error('템플릿 section0.xml 구조를 읽을 수 없습니다.');
  var prefix = tplSection.substring(0, cut + 7);   // secPr 이 들어 있는 첫 문단까지

  if (options && options.landscape) {
    prefix = prefix.replace('width="59528" height="84186"', 'width="84186" height="59528"');
  }
  var ctx = { id: 100000, textWidth: options && options.landscape ? 67178 : HWPX_TEXT_WIDTH };
  var body = [];
  for (var i = 0; i < blocks.length; i++) {
    body.push(hwpxBlockXml_(blocks[i], ctx));
  }
  parts['Contents/section0.xml'] = hwpxStringToBytes_(prefix + body.join('') + '</hs:sec>');
  parts['Preview/PrvText.txt'] = hwpxStringToBytes_(hwpxPreviewText_(blocks));

  var order = hwpxPartOrder_(parts);
  var zipBytes = hwpxZipStore_(order, parts);
  return Utilities.base64Encode(zipBytes);
}

/* ------------------------------------------------------------------ */
/* 2. 템플릿 로딩                                                      */
/* ------------------------------------------------------------------ */

function hwpxLoadTemplateParts_() {
  var gz = Utilities.newBlob(Utilities.base64Decode(HWPX_TPL_B64.join('')),
                             'application/x-gzip', 'tpl.gz');
  var zipBlob = Utilities.ungzip(gz);
  zipBlob.setContentType('application/zip');
  var blobs = Utilities.unzip(zipBlob);
  var parts = {};
  for (var i = 0; i < blobs.length; i++) {
    parts[blobs[i].getName()] = blobs[i].getBytes();
  }
  return parts;
}

function hwpxPartOrder_(parts) {
  var fixed = ['mimetype', 'version.xml', 'META-INF/container.xml',
               'META-INF/container.rdf', 'META-INF/manifest.xml',
               'Contents/content.hpf', 'Contents/header.xml',
               'Contents/section0.xml', 'settings.xml',
               'Preview/PrvText.txt', 'Preview/PrvImage.png'];
  var order = [], seen = {};
  for (var i = 0; i < fixed.length; i++) {
    if (parts[fixed[i]]) { order.push(fixed[i]); seen[fixed[i]] = true; }
  }
  for (var k in parts) { if (!seen[k]) order.push(k); }
  return order;
}

/* ------------------------------------------------------------------ */
/* 3. 블록 → OWPML 조각                                                */
/* ------------------------------------------------------------------ */

function hwpxBlockXml_(b, ctx) {
  switch (b.t) {
    case 'title':  return hwpxPara_(b.text, HWPX_CHAR.title, HWPX_PARA.title, ctx, false);
    case 'h1':     return hwpxPara_(b.text, HWPX_CHAR.h1,   HWPX_PARA.head,  ctx, false);
    case 'h2':     return hwpxPara_(b.text, HWPX_CHAR.h2,   HWPX_PARA.head,  ctx, false);
    case 'hint':   return hwpxPara_(b.text, HWPX_CHAR.hint, HWPX_PARA.body,  ctx, false);
    case 'bullet': return hwpxPara_('· ' + b.text, HWPX_CHAR.body, HWPX_PARA.indent, ctx, false);
    case 'spacer': return hwpxPara_('', HWPX_CHAR.body, HWPX_PARA.body, ctx, false);
    case 'pagebreak': return hwpxPara_('', HWPX_CHAR.body, HWPX_PARA.body, ctx, true);
    case 'table':  return hwpxTable_(b, ctx);
    default:       return hwpxPara_(b.text, HWPX_CHAR.body, HWPX_PARA.body, ctx, false);
  }
}

/** 여러 줄 텍스트는 문단을 나눠 출력한다. */
function hwpxPara_(text, charPr, paraPr, ctx, pageBreak) {
  var lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    out.push('<hp:p id="' + (ctx.id++) + '" paraPrIDRef="' + paraPr +
             '" styleIDRef="0" pageBreak="' + (pageBreak && i === 0 ? 1 : 0) +
             '" columnBreak="0" merged="0"><hp:run charPrIDRef="' + charPr + '">' +
             (lines[i] === '' ? '<hp:t/>' : '<hp:t>' + hwpxEsc_(lines[i]) + '</hp:t>') +
             '</hp:run></hp:p>');
  }
  return out.join('');
}

/** 표 안 칸의 문단 (subList 내부용) */
function hwpxCellPara_(text, charPr, ctx) {
  var lines = String(text === undefined || text === null ? '' : text).split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    out.push('<hp:p id="' + (ctx.id++) + '" paraPrIDRef="' + HWPX_PARA.cell +
             '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
             '<hp:run charPrIDRef="' + charPr + '">' +
             (lines[i] === '' ? '<hp:t/>' : '<hp:t>' + hwpxEsc_(lines[i]) + '</hp:t>') +
             '</hp:run></hp:p>');
  }
  return out.join('');
}

function hwpxTable_(b, ctx) {
  var head = b.head || [];
  var rows = b.rows || [];
  var colCnt = head.length ? head.length : (rows[0] ? rows[0].length : 1);
  var weights = b.weights && b.weights.length === colCnt ? b.weights : null;
  var total = 0, i, j;
  if (weights) { for (i = 0; i < weights.length; i++) total += weights[i]; }
  var widths = [];
  var used = 0;
  for (i = 0; i < colCnt; i++) {
    var w = weights ? Math.floor((ctx.textWidth || HWPX_TEXT_WIDTH) * weights[i] / total)
                    : Math.floor((ctx.textWidth || HWPX_TEXT_WIDTH) / colCnt);
    widths.push(w); used += w;
  }
  widths[colCnt - 1] += ((ctx.textWidth || HWPX_TEXT_WIDTH) - used);   // 반올림 오차 보정

  var allRows = [];
  if (head.length) allRows.push({ cells: head, head: true });
  for (i = 0; i < rows.length; i++) allRows.push({ cells: rows[i], head: false });

  var trs = [], heights = [], totalH = 0;
  for (i = 0; i < allRows.length; i++) {
    var r = allRows[i];
    var h = hwpxRowHeight_(r.cells, widths);
    heights.push(h); totalH += h;
    var tcs = [];
    for (j = 0; j < colCnt; j++) {
      var txt = r.cells[j] === undefined ? '' : r.cells[j];
      var bf = r.head ? HWPX_BF.head : HWPX_BF.cell;
      var cp = r.head ? HWPX_CHAR.thead : HWPX_CHAR.tbody;
      tcs.push('<hp:tc name="" header="' + (r.head ? 1 : 0) +
        '" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="' + bf + '">' +
        '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER"' +
        ' linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0"' +
        ' hasTextRef="0" hasNumRef="0">' + hwpxCellPara_(txt, cp, ctx) + '</hp:subList>' +
        '<hp:cellAddr colAddr="' + j + '" rowAddr="' + i + '"/>' +
        '<hp:cellSpan colSpan="1" rowSpan="1"/>' +
        '<hp:cellSz width="' + widths[j] + '" height="' + h + '"/>' +
        '<hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>');
    }
    trs.push('<hp:tr>' + tcs.join('') + '</hp:tr>');
  }

  var tbl = '<hp:tbl id="' + (ctx.id++) + '" zOrder="0" numberingType="TABLE"' +
    ' textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None"' +
    ' pageBreak="CELL" repeatHeader="1" rowCnt="' + allRows.length + '" colCnt="' + colCnt +
    '" cellSpacing="0" borderFillIDRef="' + HWPX_BF.cell + '" noAdjust="0">' +
    '<hp:sz width="' + (ctx.textWidth || HWPX_TEXT_WIDTH) + '" widthRelTo="ABSOLUTE" height="' + totalH +
    '" heightRelTo="ABSOLUTE" protect="0"/>' +
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0"' +
    ' holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP"' +
    ' horzAlign="LEFT" vertOffset="0" horzOffset="0"/>' +
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/>' +
    '<hp:inMargin left="510" right="510" top="141" bottom="141"/>' +
    trs.join('') + '</hp:tbl>';

  return '<hp:p id="' + (ctx.id++) + '" paraPrIDRef="' + HWPX_PARA.body +
         '" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' +
         '<hp:run charPrIDRef="' + HWPX_CHAR.body + '">' + tbl + '</hp:run></hp:p>';
}

/** 칸 글자 수로 줄 수를 어림잡아 행 높이를 정한다(한글이 열 때 다시 조정). */
function hwpxRowHeight_(cells, widths) {
  var maxLines = 1;
  for (var j = 0; j < widths.length; j++) {
    var txt = String(cells[j] === undefined ? '' : cells[j]);
    var perLine = Math.max(4, Math.floor((widths[j] - 1020) / 500)); // 한 줄에 들어갈 글자 수 추정
    var segs = txt.split(/\r?\n/);
    var lines = 0;
    for (var k = 0; k < segs.length; k++) {
      lines += Math.max(1, Math.ceil(hwpxWidthCount_(segs[k]) / perLine));
    }
    if (lines > maxLines) maxLines = lines;
  }
  return 500 + maxLines * 1150;
}

/** 한글은 2, 영숫자는 1로 글자 폭을 센다. */
function hwpxWidthCount_(s) {
  var n = 0;
  for (var i = 0; i < s.length; i++) n += (s.charCodeAt(i) > 127 ? 2 : 1);
  return Math.ceil(n / 2);
}

function hwpxEsc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hwpxPreviewText_(blocks) {
  var out = [];
  for (var i = 0; i < blocks.length && out.length < 30; i++) {
    if (blocks[i].text) out.push(String(blocks[i].text));
  }
  return out.join('\n').substring(0, 1000) || ' ';
}

/* ------------------------------------------------------------------ */
/* 4. ZIP(무압축) 라이터                                               */
/* ------------------------------------------------------------------ */

var HWPX_CRC_TABLE = null;
function hwpxCrcTable_() {
  if (HWPX_CRC_TABLE) return HWPX_CRC_TABLE;
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  HWPX_CRC_TABLE = t;
  return t;
}

function hwpxCrc32_(bytes) {
  var t = hwpxCrcTable_(), c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) {
    c = t[(c ^ (bytes[i] & 0xFF)) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function hwpxPush16_(a, v) { a.push(v & 0xFF, (v >>> 8) & 0xFF); }
function hwpxPush32_(a, v) {
  a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
}

/**
 * 모든 항목을 STORE(무압축)로 담은 zip 바이트 배열을 만든다.
 * mimetype 을 맨 앞에 두면 한글이 hwpx 로 인식한다.
 */
function hwpxZipStore_(order, parts) {
  var out = [], central = [], offset = 0;
  for (var i = 0; i < order.length; i++) {
    var name = order[i];
    var data = parts[name];
    var nameBytes = hwpxStringToBytes_(name);
    var crc = hwpxCrc32_(data);
    var local = [];
    hwpxPush32_(local, 0x04034B50);
    hwpxPush16_(local, 10);          // version needed
    hwpxPush16_(local, 0x0800);      // flag: UTF-8 파일명
    hwpxPush16_(local, 0);           // method: stored
    hwpxPush16_(local, 0); hwpxPush16_(local, 0);  // time, date
    hwpxPush32_(local, crc);
    hwpxPush32_(local, data.length);
    hwpxPush32_(local, data.length);
    hwpxPush16_(local, nameBytes.length);
    hwpxPush16_(local, 0);
    for (var a = 0; a < nameBytes.length; a++) local.push(nameBytes[a] & 0xFF);

    var cen = [];
    hwpxPush32_(cen, 0x02014B50);
    hwpxPush16_(cen, 20); hwpxPush16_(cen, 10);
    hwpxPush16_(cen, 0x0800); hwpxPush16_(cen, 0);
    hwpxPush16_(cen, 0); hwpxPush16_(cen, 0);
    hwpxPush32_(cen, crc);
    hwpxPush32_(cen, data.length);
    hwpxPush32_(cen, data.length);
    hwpxPush16_(cen, nameBytes.length);
    hwpxPush16_(cen, 0); hwpxPush16_(cen, 0);
    hwpxPush16_(cen, 0); hwpxPush16_(cen, 0);
    hwpxPush32_(cen, 0);
    hwpxPush32_(cen, offset);
    for (var b = 0; b < nameBytes.length; b++) cen.push(nameBytes[b] & 0xFF);

    for (var c = 0; c < local.length; c++) out.push(local[c]);
    for (var d = 0; d < data.length; d++) out.push(data[d] & 0xFF);
    offset += local.length + data.length;
    central.push(cen);
  }

  var cenStart = offset, cenSize = 0;
  for (var e = 0; e < central.length; e++) {
    for (var f = 0; f < central[e].length; f++) out.push(central[e][f]);
    cenSize += central[e].length;
  }
  var end = [];
  hwpxPush32_(end, 0x06054B50);
  hwpxPush16_(end, 0); hwpxPush16_(end, 0);
  hwpxPush16_(end, order.length); hwpxPush16_(end, order.length);
  hwpxPush32_(end, cenSize);
  hwpxPush32_(end, cenStart);
  hwpxPush16_(end, 0);
  for (var g = 0; g < end.length; g++) out.push(end[g]);

  for (var h = 0; h < out.length; h++) {
    if (out[h] > 127) out[h] = out[h] - 256;   // Apps Script 는 부호 있는 바이트
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 5. 문자열 ↔ 바이트                                                  */
/* ------------------------------------------------------------------ */

function hwpxStringToBytes_(s) {
  return Utilities.newBlob(s, 'text/plain', 'x').getBytes();
}
function hwpxBytesToString_(bytes) {
  return Utilities.newBlob(bytes, 'text/plain', 'x').getDataAsString('UTF-8');
}
