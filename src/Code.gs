/**********************************************************************
 * Code.gs — 웹앱 진입점과 설정값
 *
 * 배포: 배포 > 새 배포 > 웹 앱
 *   실행 사용자: 웹 앱에 액세스하는 사용자 (교사마다 자기 API 키를 쓰게 하려면)
 *   액세스 권한: 필요한 범위로
 **********************************************************************/

var APP_TITLE   = '깊이 있는 수업·평가 설계 도우미';
var APP_VERSION = '2.7.1';
var DEFAULT_MODEL = 'gemini-2.5-flash';

/** 한글 문서를 드라이브에 저장할 때 사용할 폴더 이름 */
var DRIVE_FOLDER = '수업설계_한글문서';

/**
 * 제작 표기. 화면 왼쪽 아래, 사용 안내 창, 한글 문서 끝에 함께 쓰인다.
 * 다른 학교·다른 분이 쓰실 때는 이 세 줄만 고치면 된다.
 */
var APP_CREDIT = {
  training: '2026 전북형 깊이 있는 수업·평가 설계 연수',
  author:   '연수 자료 한윤석(성당중학교),                            설계 도구 제작  유경현(인월고등학교)',
  doc:      '2026 전북형 깊이 있는 수업·평가 설계 연수 · 설계 도구 제작 유경현(인월고등학교)'
};

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = APP_TITLE;
  t.appVersion = APP_VERSION;
  return t.evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Index.html 안에서 Style.html / Script.html 을 끼워 넣을 때 사용 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** 모든 과목의 단원을 하나의 배열로 합친다. 과목을 추가하려면 여기에 덧붙인다. */
function getAllUnits_() {
  var units = [].concat(UNITS_COMMON_MATH_1, UNITS_COMMON_MATH_2, UNITS_EXTENDED_MATH, UNITS_OFFICIAL_MATH);
  for (var i = 0; i < units.length; i++) decorateWorkbookFields_(units[i]);
  return units;
}

/**
 * 워크북 확장 양식은 공식 대조 단원뿐 아니라 기존·교사 재구성 단원에도
 * 항상 존재하도록 공통 기본값을 채운다. 교사는 화면에서 그대로 고쳐 쓸 수 있다.
 */
function extractContentCategory_(text, category) {
  var parts = { knowledge: [], process: [], values: [] }, current = null;
  String(text || '').split(/\r?\n/).forEach(function(line) {
    var match = line.match(/^\s*(?:[•·⋅\-]\s*)?\[?\s*(지식\s*[·⋅ㆍ・‧.]\s*이해|과정\s*[·⋅ㆍ・‧.]\s*기능|가치\s*[·⋅ㆍ・‧.]\s*태도)\s*\]?\s*(?:[（(][^）)]*[）)])?\s*(?:[:：—–-]\s*)?/);
    if (match) {
      current = /^지식/.test(match[1]) ? 'knowledge' : /^과정/.test(match[1]) ? 'process' : 'values';
      line = line.slice(match[0].length);
    }
    if (current && line.trim()) parts[current].push(line.trim());
  });
  return (parts[category] || []).join('\n');
}

function workbookQuestions_(text, kind) {
  var out=[], active=false;
  String(text||'').split(/\r?\n/).forEach(function(line){
    var m=line.match(/^\s*\[?(사실적?|개념적?|논쟁(?:적)?(?:·성찰)?|성찰|전이)\]?\s*(?:[:：—–-]\s*)?/);
    if(m){ active=(kind==='fact' ? /^사실/.test(m[1]) : kind==='concept' ? /^개념/.test(m[1]) : /논쟁|성찰/.test(m[1])); line=line.slice(m[0].length); }
    if(active && line.trim()) out.push(line.trim());
  });
  return out.join('\n');
}

function decorateWorkbookFields_(u) {
  u.ex=u.ex||{};
  var ex=u.ex, lessons=u.lessons||[];
  var knowledge=(u.officialContentElements||[]).join('\n') || extractContentCategory_(ex.categories,'knowledge') || extractContentCategory_(ex.canDo,'knowledge');
  var process=(u.officialProcess||[]).join('\n') || extractContentCategory_(ex.categories,'process') || extractContentCategory_(ex.canDo,'process');
  var values=(u.officialValues||[]).join('\n') || extractContentCategory_(ex.categories,'values') || extractContentCategory_(ex.canDo,'values');
  var concepts=knowledge.split(/\n|[,，]|\s[·⋅]\s/).map(function(v){return v.trim();}).filter(function(v){return !!v;});
  if(!concepts.length) concepts=lessons.map(function(l){return l.element;}).filter(function(v){return !!v;});
  var keyConcept=concepts.slice(0,3).join(', ') || u.area;
  var std=(u.standards||[]).map(function(s){return '['+s.code+'] '+s.text;}).join('\n');
  var first=lessons[0]||{}, last=lessons[lessons.length-1]||{};
  var basis=ex.understand||ex.bigIdea;
  // Generated examples are recomputed from source fields, never from old generated values.
  ex.curriculumCoreIdea=(u.officialCoreIdeas||[]).join('\n') || '[출처 확인 필요] 이 예시에는 교육과정 핵심 아이디어 원문이 별도로 연결되어 있지 않습니다. 아래 문장은 교사 재구성 참고 문장입니다.\n'+ex.bigIdea;
  ex.achievementStandards=std+'\n[해설 확인 상태] 이 단원의 성취기준 해설 원문은 별도로 수록되어 있지 않습니다. 공식 문서의 해당 코드 해설과 대조해야 합니다.';
  ex.standardConsiderations='[교사 설계 참고 — 교육과정 적용 시 고려 사항 원문 아님]\n'+(ex.support||'표·식·그림을 비교하며 학생의 설명을 확인한다.')+'\n평가에서는 '+(last.evidence||ex.evidence);
  ex.knowledgeUnderstanding=knowledge;
  ex.processFunction=process;
  ex.valuesAttitudes=values;
  ex.reconstructionTitle=u.name;
  ex.conceptLens='[교사 설계 제안]\n개념 렌즈: 관계와 타당성\n탐구할 관계: '+keyConcept+' 사이의 연결\n정당화할 수행: '+(last.goal||process);
  ex.reconstructedCoreIdea=ex.bigIdea;
  ex.transfer='[전이 과제 예시]\n'+(lessons.filter(function(l){return /적용/.test(l.phase);}).map(function(l){return l.material+'\n학생 수행: '+l.goal;}).join('\n\n') || '「'+u.name+'」에서 자료의 수치나 조건 하나를 바꾼다. 원래 설명이 유지되는지 비교하고 바꿔야 할 결론을 근거로 설명한다.');
  ex.macroConcept='[교사 설계 제안]\n상위 개념: 관계와 타당성\n하위 개념: '+keyConcept;
  ex.strands=concepts.map(function(concept,i){
    var lesson=lessons.filter(function(l){return String(l.element).indexOf(concept)>=0;})[0];
    return '스트랜드 '+(i+1)+' — '+concept+'\nKNOW: '+concept+'의 의미와 성립 조건\nDO: '+(lesson?lesson.goal:process)+'\nUNDERSTAND: '+basis;
  }).join('\n\n');
  ex.factualQuestions=workbookQuestions_(ex.guiding,'fact') || concepts.map(function(v){return v+'의 뜻과 사용 조건은 무엇인가?';}).join('\n');
  ex.conceptualQuestions=workbookQuestions_(ex.guiding,'concept') || ex.essential;
  ex.debatableQuestions=workbookQuestions_(ex.guiding,'debate') || '「'+u.name+'」의 결과를 언제 신뢰할 수 있는가? 자료나 가정이 바뀌면 판단도 바뀌어야 하는가?\n'+keyConcept+'을 사용한 설명과 다른 방법의 설명 중 무엇이 더 설득력 있는가?';
  ex.grasps=/G 목표:/.test(ex.task) ? ex.task : 'G 목표: '+u.name+'\nR 역할: 수학적 근거를 제시하는 설명자\nA 청중: 동료 학생\nS 상황: '+first.material+'\nP 수행·산출물: '+ex.task+'\nS 성공 기준: '+ex.elements;
  ex.whyLearning='What — 주요 수행: '+u.name+'\nWhy — 도달할 이해: '+basis+'\nHow — 탐구 방법: '+(first.activity||ex.activity);
  ex.sixEvidence='[교사 평가 설계 예시]\n설명하기: '+keyConcept+'의 조건과 풀이의 근거를 설명한다.\n해석하기: '+first.material+'에서 표현과 실제 맥락이 어떻게 대응하는지 해석한다.\n적용하기: '+(last.goal||process)+'\n관점 가지기: 다른 풀이와 비교해 장점과 적용 한계를 설명한다.\n감정 이입하기: 동료가 어려워하는 표현을 찾아 그 관점에서 설명을 고쳐 쓴다.\n자기 지식 가지기: 최초 예측과 수정 결과를 비교해 자신의 오류와 다음 학습 과제를 기록한다.';
  ex.rubricCriteria='[교사 제안 — 공식 성취수준 아님]\n'+[
    ['지식·이해',keyConcept+'의 의미와 조건을 설명하기'],
    ['과정·기능',process],
    ['가치·태도',values]
  ].map(function(row){return row[0]+' — 평가 내용: '+row[1]+'\n우수: 위 수행을 스스로 하고, 근거와 조건을 제시하며 새로운 사례 또는 동료 의견을 검토한다.\n만족: 위 수행의 핵심을 보여 주며, 질문이나 피드백을 받아 근거 또는 조건을 보완한다.\n미도달: 제시된 자료에서 관련 개념·근거를 찾아 표시하고 안내를 받아 수행의 일부를 완성한다.';}).join('\n\n');
  ex.lessonPlan=lessons.map(function(l,i){return (l.periods||String(i+1)+'차시')+' · '+l.phase+' · '+l.element+'\n학습 경험: '+l.activity+'\n확인할 증거: '+l.evidence;}).join('\n\n');
  ex.assessmentFeedbackPlan=lessons.map(function(l,i){return (l.periods||String(i+1)+'차시')+' ['+(/수행/.test(l.phase)?'총괄':/발견/.test(l.phase)?'진단·형성':'형성')+'평가]\n증거: '+l.evidence+'\n피드백: 「'+l.goal+'」에 대한 근거를 묻고 수정 전후 설명을 비교한다.';}).join('\n\n');
  ex.reflectionPrompts='의미: '+keyConcept+'을 배우기 전과 후에 무엇을 다르게 설명할 수 있는가?\n탐구: 「'+u.name+'」의 결론을 뒷받침하는 가장 강한 근거는 무엇인가?\n비교: 친구의 풀이와 나의 풀이가 다른 까닭은 무엇인가?\n한계: 조건이 달라지면 어떤 설명을 수정해야 하는가?\n성장: 피드백을 반영해 바꾼 부분과 다음에 탐구할 질문은 무엇인가?';
  ex.learningEnvironment='도구·자료: '+lessons.map(function(l){return l.tool;}).filter(function(v,i,a){return v&&a.indexOf(v)===i;}).join(', ')+'\n지원: '+ex.support;
}

function getSubjects_() {
  var units = getAllUnits_(), seen = {}, out = [];
  for (var i = 0; i < units.length; i++) {
    if (!seen[units[i].subject]) { seen[units[i].subject] = true; out.push(units[i].subject); }
  }
  return out;
}

function getUnitById_(id) {
  var units = getAllUnits_();
  for (var i = 0; i < units.length; i++) if (units[i].id === id) return units[i];
  return null;
}

function todayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy. M. d.');
}

/**
 * 실행 환경 이름. Apps Script 에서는 'gas',
 * Node(Vercel·로컬 개발 서버)에서는 lib/gas-runtime.js 가 넣어 준 값이 쓰인다.
 * 화면은 이 값으로 드라이브 저장·API 키 보관 방식을 구별한다.
 */
function runtimeName_() {
  return (typeof GAS_RUNTIME_OVERRIDE !== 'undefined') ? GAS_RUNTIME_OVERRIDE : 'gas';
}
