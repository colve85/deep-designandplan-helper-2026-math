/**********************************************************************
 * DocBuilder.gs — 설계 내용을 한글 문서 블록으로 바꾼다.
 *
 * Hwpx.gs 가 이해하는 블록 형식만 사용한다.
 *   {t:'title'|'h1'|'h2'|'p'|'hint'|'bullet'|'spacer'|'pagebreak', text}
 *   {t:'table', head:[...]|null, rows:[[...]], weights:[...]}
 **********************************************************************/

var CIRCLED = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫'];

function hwpxFileName_(design) {
  var m = (design && design.meta) || {};
  var base = [m.subject, m.unit].filter(function (x) { return x; }).join('_') || '수업설계';
  base = base.replace(/[\\\/:*?"<>|]/g, '');
  return base + '_깊이있는수업평가설계안.hwpx';
}

function buildDesignBlocks_(design) {
  var m = (design && design.meta) || {};
  var data = (design && design.stages) || {};
  var lessons = (design && design.lessons) || [];
  var alignment = (design && design.alignment) || null;
  var b = [];

  /* ---- 표지 정보 ---- */
  b.push({ t: 'title', text: '깊이 있는 수업·평가 설계안' });
  b.push({ t: 'hint', text: [m.subject, m.area, m.unit].filter(function (x) { return x; }).join('  ·  ') });
  b.push({ t: 'spacer' });

  b.push({ t: 'table', head: null, weights: [1, 2, 1, 2], rows: [
    ['학교', m.school || '', '교사', m.teacher || ''],
    ['과목', m.subject || '', '대상', m.grade || ''],
    ['영역', m.area || '', '차시', m.periods || ''],
    ['단원', m.unit || '', '작성일', m.date || todayStr_()]
  ] });
  b.push({ t: 'spacer' });

  if (m.standards && m.standards.length) {
    b.push({ t: 'h2', text: '관련 성취기준' });
    var srows = [];
    for (var i = 0; i < m.standards.length; i++) {
      srows.push(['[' + m.standards[i].code + ']', m.standards[i].text]);
    }
    b.push({ t: 'table', head: ['코드', '성취기준'], weights: [1, 4], rows: srows });
    b.push({ t: 'spacer' });
  }

  /* ---- 0~3단계 ---- */
  for (var s = 0; s < STAGES.length; s++) {
    var st = STAGES[s];
    var d = data[st.id] || {};
    b.push({ t: 'h1', text: st.label + '  ' + st.name });
    b.push({ t: 'hint', text: '생각해볼 질문 : ' + st.question });
    b.push({ t: 'hint', text: st.mapping });
    var rows = [];
    for (var f = 0; f < st.fields.length; f++) {
      var fld = st.fields[f];
      var v = d[fld.key];
      rows.push([fld.label, (v && String(v).trim()) ? String(v).trim() : '']);
    }
    b.push({ t: 'table', head: null, weights: [1, 3], rows: rows });
    b.push({ t: 'spacer' });
  }

  /* ---- 차시별 수업 설계 ---- */
  var used = [];
  for (var k = 0; k < lessons.length; k++) {
    var r = lessons[k];
    if (r && (r.element || r.material)) used.push(r);
  }
  if (used.length) {
    b.push({ t: 'pagebreak' });
    b.push({ t: 'h1', text: '차시별 수업 설계 (내용 요소 × 수업 소재)' });
    b.push({ t: 'hint', text: '각 차시는 도달 목표 → 확인할 증거 → 학생 활동의 순서로 설계되었습니다.' });
    b.push({ t: 'spacer' });

    b.push({ t: 'table', head: ['학습 단계', '차시', '내용 요소', '수업 소재'],
             weights: [0.9, 0.7, 1.5, 2.9],
             rows: used.map(function (r) {
               return [r.phase || '', r.periods || '', r.element || '', r.material || ''];
             }) });
    b.push({ t: 'spacer' });

    for (var j = 0; j < used.length; j++) {
      var L = used[j];
      var mark = (CIRCLED[j] || (j + 1) + '.') + ' ';
      b.push({ t: 'h2', text: mark + (L.element || '') +
               (L.periods ? '  (' + L.periods + ')' : '') +
               (L.phase ? '  · ' + L.phase : '') });
      b.push({ t: 'table', head: null, weights: [1, 3], rows: [
        ['수업 소재', L.material || ''],
        ['여는 질문', L.open || ''],
        ['도달 목표', L.goal || ''],
        ['확인할 증거', L.evidence || ''],
        ['학생 활동', L.activity || ''],
        ['도구', L.tool || '']
      ] });
      b.push({ t: 'spacer' });
    }
  }

  /* ---- 설계 점검 ---- */
  if (alignment && alignment.items && alignment.items.length) {
    b.push({ t: 'h1', text: '설계 점검' });
    b.push({ t: 'hint', text: '목표 → 증거 → 학습 경험이 서로를 향하고 있는지 자동으로 살펴본 결과입니다.' });
    b.push({ t: 'table', head: ['구분', '점검 결과'], weights: [1, 4],
             rows: alignment.items.map(function (it) {
               return [it.area, (it.level === 'ok' ? '[양호] ' : '[확인] ') + it.message];
             }) });
    b.push({ t: 'spacer' });
  }

  /* ---- 자가 점검 체크리스트 ---- */
  b.push({ t: 'h1', text: '자가 점검 체크리스트' });
  for (var c = 0; c < STAGES.length; c++) {
    var cs = STAGES[c];
    b.push({ t: 'h2', text: cs.label + '  ' + cs.name });
    for (var q = 0; q < cs.checklist.length; q++) {
      b.push({ t: 'bullet', text: '☐  ' + cs.checklist[q] });
    }
  }

  if (m.note) {
    b.push({ t: 'spacer' });
    b.push({ t: 'h2', text: '메모' });
    b.push({ t: 'p', text: m.note });
  }

  /* ---- 제작 표기 ---- */
  b.push({ t: 'spacer' });
  b.push({ t: 'hint', text: APP_CREDIT.doc });
  return b;
}

/* ------------------------------------------------------------------ */
/* 점검용 — 스크립트 편집기에서 직접 실행                                */
/* ------------------------------------------------------------------ */

function test_makeHwpx() {
  var u = getAllUnits_()[1];
  var design = {
    meta: { school: '인월고등학교', teacher: '유경현', subject: u.subject, area: u.area,
            unit: u.name, grade: '1학년', periods: '4차시', date: todayStr_(),
            standards: u.standards },
    stages: { 0: u.ex, 1: u.ex, 2: u.ex, 3: u.ex },
    lessons: u.lessons
  };
  design.alignment = api_checkAlignment(design);
  var out = api_makeHwpx(design);
  Logger.log(out.name + ' / base64 길이 ' + out.b64.length);
}
