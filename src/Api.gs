/**********************************************************************
 * Api.gs — 화면에서 google.script.run 으로 부르는 함수들
 *
 *  api_bootstrap          초기 데이터
 *  api_getSettings        설정 조회
 *  api_saveSettings       설정 저장 (Gemini 키·모델)
 *  api_buildPrompt        단계별 프롬프트 생성 (자동·붙여넣기 공용)
 *  api_generate           Gemini 호출
 *  api_parsePasted        붙여넣은 결과 파싱
 *  api_checkAlignment     목표–증거–활동 정합성 점검
 *  api_makeHwpx           한글 문서 생성 (base64)
 *  api_saveHwpxToDrive    한글 문서를 내 드라이브에 저장
 **********************************************************************/

/* ------------------------------------------------------------------ */
/* 1. 초기 데이터                                                      */
/* ------------------------------------------------------------------ */

function api_bootstrap() {
  return {
    version: APP_VERSION,
    operationSchema: api_operationSchema(),
    runtime: runtimeName_(),
    credit: APP_CREDIT,
    stages: STAGES,
    units: getAllUnits_(),
    subjects: getSubjects_(),
    deepPrompts: DEEP_PROMPTS,
    framework: FRAMEWORK,
    lessonColumns: LESSON_COLUMNS,
    lessonPhases: LESSON_PHASES,
    settings: api_getSettings(),
    today: todayStr_()
  };
}

/** 지난 학기 운영 계획 PDF에서 현재 교수학습-평가 계획을 제외한 항목을 구조화한다. */
function api_extractOperationPlan(req) {
  var key=getApiKey_(req), model=normalizeGeminiModel_(req&&req.model);
  if(!key) return {ok:false,error:'NO_KEY',message:'PDF 분석에는 Gemini API 키가 필요합니다.'};
  var schema=api_operationSchema(), shape={meta:{},sections:{}};
  schema.meta.forEach(function(c){shape.meta[c[0]]='';});
  schema.sections.forEach(function(s){if(s.key==='schedule')return;shape.sections[s.key]=s.cols?[{}]:'';});
  var prompt='첨부한 지난 학기 수학과 교수학습 및 평가 운영 계획 PDF를 읽고 JSON으로 구조화하세요. 현재 새 계획의 Ⅰ. 교수학습-평가 계획(schedule)은 절대 출력하거나 변경하지 않습니다. PDF에서 확인되는 나머지 메타데이터와 Ⅱ~Ⅲ 및 별첨 내용을 최대한 보존해 옮기세요. 날짜·시기·시수·누계는 학교마다 다를 수 있으므로 새 값으로 추정하지 말고 빈 문자열로 두세요. 확인이 불가능한 학교 규정도 빈 문자열로 둡니다. 아래 JSON 모양을 지키고 설명이나 코드블록은 쓰지 마세요.\n'+JSON.stringify(shape);
  try {
    var res=UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),{method:'post',contentType:'application/json',payload:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'application/pdf',data:String(req.pdfBase64||'')}}]}],generationConfig:{temperature:0.1,maxOutputTokens:8192}}),muteHttpExceptions:true});
    var body=JSON.parse(res.getContentText());if(res.getResponseCode()>=300)throw new Error('Gemini 응답 오류('+res.getResponseCode()+', 모델 '+model+'): '+res.getContentText().substring(0,180));
    var text='';((body.candidates||[])[0].content.parts||[]).forEach(function(x){if(x.text)text+=x.text;});
    return {ok:true,parsed:parseModelJson_(text),source:'pdf'};
  } catch(e){return {ok:false,error:'PDF_PARSE',message:e.message};}
}

/* ------------------------------------------------------------------ */
/* 2. 설정                                                             */
/* ------------------------------------------------------------------ */

function api_getSettings() {
  var up = PropertiesService.getUserProperties();
  var sp = PropertiesService.getScriptProperties();
  var key = up.getProperty('GEMINI_API_KEY') || sp.getProperty('GEMINI_API_KEY') || '';
  var model = up.getProperty('GEMINI_MODEL') || sp.getProperty('GEMINI_MODEL') || DEFAULT_MODEL;
  return { hasKey: !!key, model: model };
}

/**
 * apiKey 를 넘기지 않으면(undefined·null) 저장된 키를 그대로 둔다.
 * 빈 문자열('')을 넘기면 저장된 키를 지운다.
 */
function api_saveSettings(payload) {
  var up = PropertiesService.getUserProperties();
  if (payload.apiKey !== undefined && payload.apiKey !== null) {
    if (String(payload.apiKey).trim() === '') up.deleteProperty('GEMINI_API_KEY');
    else up.setProperty('GEMINI_API_KEY', String(payload.apiKey).trim());
  }
  if (payload.model) up.setProperty('GEMINI_MODEL', String(payload.model).trim());
  return api_getSettings();
}

/**
 * 화면이 키를 함께 보내면(Vercel 배포처럼 서버에 키를 두지 않는 환경)
 * 그 값을 우선한다. Apps Script 배포에서는 사용자 속성의 키를 쓴다.
 */
function getApiKey_(req) {
  if (req && req.apiKey && String(req.apiKey).trim()) return String(req.apiKey).trim();
  var up = PropertiesService.getUserProperties();
  var sp = PropertiesService.getScriptProperties();
  return up.getProperty('GEMINI_API_KEY') || sp.getProperty('GEMINI_API_KEY') || '';
}

/* ------------------------------------------------------------------ */
/* 3. 프롬프트                                                         */
/* ------------------------------------------------------------------ */

function stageById_(id) {
  for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return STAGES[i];
  return null;
}

/**
 * 단계별 프롬프트를 만든다. 앞 단계에서 교사가 쓴 내용을 함께 넣어
 * 0→1→2→3 의 일관성이 유지되도록 한다.
 * @param {Object} req {stageId, meta, stages, lessons}
 */
function api_buildPrompt(req) {
  var stage = stageById_(req.stageId);
  if (!stage) throw new Error('알 수 없는 단계입니다.');

  var m = req.meta || {};
  var L = [];
  L.push('당신은 2022 개정 교육과정에 따라 백워드 설계로 "깊이 있는 수업·평가"를 설계하는 고등학교 수학과 수석교사입니다.');
  L.push('아래 단원에 대해 ' + stage.label + '(' + stage.name + ') 초안을 작성해 주세요.');
  L.push('');
  L.push('[단원 정보]');
  L.push('- 과목: ' + (m.subject || '') + ' / 영역: ' + (m.area || '') + ' / 단원: ' + (m.unit || ''));
  if (m.standards && m.standards.length) {
    L.push('- 성취기준:');
    for (var s = 0; s < m.standards.length; s++) {
      L.push('  · [' + m.standards[s].code + '] ' + m.standards[s].text);
    }
  }
  if (m.grade)   L.push('- 대상: ' + m.grade);
  if (m.periods) L.push('- 배당 차시: ' + m.periods);
  if (m.context) L.push('- 학급 상황·고려사항: ' + m.context);
  L.push('');

  L.push('[설계 원칙]');
  L.push('- 핵심 아이디어는 교육과정 원문과 단원에서 채택·재구성한 문장으로 구분합니다. 인간상·핵심역량·수학 교과 역량은 단원에 맞게 선택하고 관찰 행동을 연결합니다. 인간상 명칭은 자기주도적인 사람, 창의적인 사람, 교양 있는 사람, 더불어 사는 사람 중 선택합니다. 세 범주의 이름은 범주별로 한 번만 쓰고 하위 목표와 평가요소를 묶습니다.');
  L.push('- 내용 체계의 과정·기능은 여러 상황에 전이 가능한 수학적 행동으로 씁니다. 특정 수치·함수식·상품명은 수행과제와 차시 활동에만 제시하고, 교사 재구성을 공식 원문으로 표시하지 않습니다.');
  L.push('- 이 단계의 안내 질문: ' + stage.question);
  L.push('- ' + stage.intro);
  L.push('- ' + stage.mapping);
  L.push('- 활동이 아니라 목표와 증거를 먼저 정하는 역방향 순서를 지킵니다.');
  L.push('- 내용 요소의 나열이 아니라, 학생이 도달할 상태와 그 증거를 중심으로 씁니다.');
  L.push('- "계산할 수 있다" 수준에 머무르지 말고 이해·설명·판단이 드러나게 씁니다.');
  L.push('');
  L.push('[이 단계의 자가 점검 기준 — 초안이 이 기준을 통과하도록 작성]');
  for (var c = 0; c < stage.checklist.length; c++) L.push('- ' + stage.checklist[c]);
  L.push('');

  var prev = req.stages || {};
  var prevTexts = [];
  for (var p = 0; p < STAGES.length; p++) {
    var st = STAGES[p];
    if (st.id >= req.stageId) break;
    var data = prev[st.id] || {};
    var body = [];
    for (var f = 0; f < st.fields.length; f++) {
      var v = data[st.fields[f].key];
      if (v && String(v).trim()) body.push('  · ' + st.fields[f].label + ': ' + String(v).trim());
    }
    if (body.length) prevTexts.push('- ' + st.label + ' ' + st.name + '\n' + body.join('\n'));
  }
  if (prevTexts.length) {
    L.push('[앞 단계에서 교사가 이미 작성한 내용 — 반드시 일관되게 이어서 쓸 것]');
    L.push(prevTexts.join('\n'));
    L.push('');
  }

  if (req.stageId === 3 && req.lessons && req.lessons.length) {
    L.push('[교사가 구상 중인 차시별 수업 소재 — 이 흐름과 어긋나지 않게 쓸 것]');
    for (var i = 0; i < req.lessons.length; i++) {
      var r = req.lessons[i];
      if (!r || !(r.element || r.material)) continue;
      L.push('  · ' + (r.element || '') + (r.periods ? '(' + r.periods + ')' : '') +
             ' — 소재: ' + (r.material || '') + (r.goal ? ' / 목표: ' + r.goal : ''));
    }
    L.push('');
  }

  L.push('[출력 형식] 아래 JSON 한 개만 출력하세요. 설명·머리말·코드블록 표시 없이 JSON 만.');
  var shape = [];
  for (var g = 0; g < stage.fields.length; g++) {
    shape.push('  "' + stage.fields[g].key + '": "' + stage.fields[g].label +
               ' — ' + stage.fields[g].hint + '"');
  }
  L.push('{');
  L.push(shape.join(',\n'));
  L.push('}');
  L.push('');
  L.push('각 값은 줄바꿈(\\n)으로 구분된 2~4개의 문장 또는 항목으로 작성하고, 우리말 교육과정 용어를 사용하세요.');
  L.push('값 안에서 큰따옴표(")는 쓰지 말고 홑따옴표(\')나 낫표(「」)를 쓰세요. JSON 문법이 깨집니다.');
  return L.join('\n');
}

/**
 * 차시별 수업 소재를 표 형태로 제안받기 위한 프롬프트.
 */
function api_buildLessonPrompt(req) {
  var m = req.meta || {};
  var L = [];
  L.push('당신은 2022 개정 교육과정에 따라 백워드 설계로 수업을 설계하는 고등학교 수학과 수석교사입니다.');
  L.push('아래 단원의 내용 요소별로 실제 수업에 쓸 수 있는 소재와 백워드 설계 한 줄씩을 제안해 주세요.');
  L.push('');
  L.push('[단원] ' + (m.subject || '') + ' · ' + (m.area || '') + ' · ' + (m.unit || ''));
  if (m.standards && m.standards.length) {
    for (var s = 0; s < m.standards.length; s++) {
      L.push('  · [' + m.standards[s].code + '] ' + m.standards[s].text);
    }
  }
  if (m.periods) L.push('[배당 차시] ' + m.periods);
  if (m.context) L.push('[학급 상황] ' + m.context);
  L.push('');
  L.push('[작성 원칙]');
  L.push('- 소재는 학생이 실제로 마주할 수 있는 구체적인 자료·맥락이어야 합니다(학교·지역·생활 자료 우대).');
  L.push('- 누구나 출발할 수 있는 직관적 단서에서 시작해 협력적 정당화로 올라가도록 설계합니다.');
  L.push('- 도달 목표와 확인할 증거가 서로 대응해야 합니다.');
  L.push('- 최종 수행과제에서 거꾸로 물어 배치합니다: 수행하려면 무엇을 적용해야 하고, ' +
         '적용하려면 무엇을 탐색해야 하며, 탐색하고 싶어지려면 무엇을 발견해야 하는가.');
  L.push('- phase 는 ' + LESSON_PHASES.join(' / ') + ' 중 하나로 적습니다.');
  L.push('');
  L.push('[출력 형식] 아래 JSON 배열만 출력하세요. 3~5개 항목.');
  L.push('[{"phase":"탐색하기","element":"내용 요소","periods":"1차시","material":"수업 소재",' +
         '"open":"여는 질문","goal":"도달 목표","evidence":"확인할 증거",' +
         '"activity":"학생 활동","tool":"도구"}]');
  L.push('값 안에서 큰따옴표(")는 쓰지 말고 홑따옴표(\')나 낫표(「」)를 쓰세요. JSON 문법이 깨집니다.');
  return L.join('\n');
}

/* ------------------------------------------------------------------ */
/* 4. Gemini                                                           */
/* ------------------------------------------------------------------ */

function api_generate(req) {
  var prompt = (req.kind === 'lessons') ? api_buildLessonPrompt(req) : api_buildPrompt(req);
  return callGemini_(prompt, req.kind === 'lessons', req);
}

function callGemini_(prompt, wantArray, req) {
  var key = getApiKey_(req);
  if (!key) {
    return { ok: false, error: 'NO_KEY',
             message: 'Gemini API 키가 저장되어 있지 않습니다. 설정에서 키를 입력하거나 붙여넣기 모드를 사용하세요.' };
  }
  var model = (req && req.model && String(req.model).trim()) || api_getSettings().model || DEFAULT_MODEL;
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 3072 }
      })
    });
  } catch (err) {
    return { ok: false, error: 'FETCH', message: '요청 중 오류가 발생했습니다: ' + err };
  }

  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    return { ok: false, error: 'HTTP_' + code,
             message: 'Gemini 응답 오류(' + code + '). 키 또는 모델명을 확인하세요.\n' + body.substring(0, 300) };
  }

  var text = '';
  try {
    var json = JSON.parse(body);
    var parts = json.candidates && json.candidates[0] && json.candidates[0].content &&
                json.candidates[0].content.parts;
    if (parts) for (var i = 0; i < parts.length; i++) if (parts[i].text) text += parts[i].text;
  } catch (e2) {
    return { ok: false, error: 'PARSE', message: '응답을 해석하지 못했습니다.' };
  }
  if (!text) return { ok: false, error: 'EMPTY', message: '빈 응답을 받았습니다. 다시 시도해 주세요.' };

  return { ok: true, raw: text, parsed: parseModelJson_(text, wantArray) };
}

/**
 * 모델 출력에서 JSON 부분을 뽑아 객체(또는 배열)로 만든다. 실패하면 null.
 *
 * 모델은 값 안에 큰따옴표를 그대로 넣거나("…라고 말한다") 줄바꿈을 날것으로
 * 넣는 일이 잦다. 그대로 두면 JSON.parse 가 실패하므로 한 번 손본 뒤 다시 시도하고,
 * 그래도 안 되면 키-값만 긁어내는 마지막 수단을 쓴다.
 */
function parseModelJson_(text, wantArray) {
  var t = String(text === undefined || text === null ? '' : text);
  t = t.replace(/```+\s*(?:json)?/gi, ' ');           // 코드블록 표시 제거

  var got = sliceJson_(t, wantArray);
  if (got === null) {                                  // 기대한 모양이 아니면 반대쪽도 본다
    var other = sliceJson_(t, !wantArray);
    if (other === null) return null;
    var alt = parseBody_(other, !wantArray);
    if (alt === null) return null;
    if (wantArray) return (alt instanceof Array) ? alt : [alt];
    return (alt instanceof Array) ? (alt.length ? alt[0] : null) : alt;
  }
  return parseBody_(got, wantArray);
}

function sliceJson_(t, wantArray) {
  var open = wantArray ? '[' : '{', close = wantArray ? ']' : '}';
  var a = t.indexOf(open), b = t.lastIndexOf(close);
  if (a < 0 || b <= a) return null;
  return t.substring(a, b + 1);
}

function parseBody_(body, wantArray) {
  try { return JSON.parse(body); } catch (e) { /* 아래에서 손본다 */ }
  try { return JSON.parse(repairJson_(body)); } catch (e2) { /* 마지막 수단으로 */ }
  return looseExtract_(body, wantArray);
}

/**
 * 문자열 값 안에 섞여 들어온 큰따옴표와 날것의 줄바꿈을 이스케이프한다.
 * 닫는 따옴표인지 아닌지는 바로 뒤에 오는 구조 문자(, } ] :)로 판단한다.
 */
function repairJson_(s) {
  var out = '', inStr = false, i, c, j, nx;
  for (i = 0; i < s.length; i++) {
    c = s.charAt(i);
    if (!inStr) {
      out += c;
      if (c === '"') inStr = true;
      continue;
    }
    if (c === '\\') { out += c + (s.charAt(i + 1) || ''); i++; continue; }
    if (c === '"') {
      j = i + 1;
      while (j < s.length && ' \t\r\n'.indexOf(s.charAt(j)) >= 0) j++;
      nx = s.charAt(j);
      if (j >= s.length || nx === ',' || nx === '}' || nx === ']' || nx === ':') {
        out += c; inStr = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (c === '\n') { out += '\\n'; continue; }
    if (c === '\r') { continue; }
    if (c === '\t') { out += '\\t'; continue; }
    out += c;
  }
  return out;
}

/** 그래도 안 되면 "키": "값" 짝만 긁어낸다. */
function looseExtract_(body, wantArray) {
  var re = /"([A-Za-z0-9_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  var out = {}, m, found = false;
  while ((m = re.exec(body)) !== null) {
    out[m[1]] = m[2].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    found = true;
  }
  if (!found) return null;
  return wantArray ? [out] : out;
}

function api_parsePasted(payload) {
  var wantArray = payload && payload.kind === 'lessons';
  var text = (payload && payload.text) || '';
  var obj = parseModelJson_(text, wantArray);
  return { ok: !!obj, parsed: obj };
}

/* ------------------------------------------------------------------ */
/* 5. 정합성 점검 — 목표 → 증거 → 활동이 서로를 향하는가                  */
/* ------------------------------------------------------------------ */

/** 두 글자 이상의 낱말을 뽑는다(조사·기호는 버린다). */
function keywords_(text) {
  var raw = String(text || '').replace(/[^가-힣a-zA-Z0-9]+/g, ' ').split(' ');
  var stop = { '학생': 1, '이해': 1, '설명': 1, '수업': 1, '문제': 1, '활동': 1,
               '있다': 1, '한다': 1, '하는': 1, '것을': 1, '대해': 1, '통해': 1 };
  var seen = {}, out = [];
  for (var i = 0; i < raw.length; i++) {
    var w = raw[i];
    if (w.length < 2 || stop[w] || seen[w]) continue;
    seen[w] = 1; out.push(w);
  }
  return out;
}

function overlapRatio_(fromText, toText) {
  var a = keywords_(fromText);
  if (!a.length) return 1;
  var t = String(toText || '');
  var hit = 0;
  for (var i = 0; i < a.length; i++) if (t.indexOf(a[i]) >= 0) hit++;
  return hit / a.length;
}

/**
 * @param {Object} design {meta, stages, lessons}
 * @return {{score:number, items:Array}}
 */
function api_checkAlignment(design) {
  var d = (design && design.stages) || {};
  var lessons = (design && design.lessons) || [];
  var items = [];

  function stageText(id) {
    var st = stageById_(id), data = d[id] || {}, out = [];
    for (var i = 0; i < st.fields.length; i++) {
      var v = data[st.fields[i].key];
      if (v) out.push(String(v));
    }
    return out.join('\n');
  }
  function filled(id) { return stageText(id).replace(/\s/g, '').length > 0; }

  for (var s = 0; s < STAGES.length; s++) {
    if (!filled(STAGES[s].id)) {
      items.push({ level: 'warn', area: STAGES[s].label,
                   message: STAGES[s].label + '(' + STAGES[s].name + ')가 비어 있습니다.' });
    }
  }

  var goalText = ((d[1] || {}).understand || '') + '\n' + ((d[1] || {}).canDo || '');
  var evidenceText = ((d[2] || {}).task || '') + '\n' + ((d[2] || {}).evidence || '') +
                     '\n' + ((d[2] || {}).rubric || '');
  var learnText = ((d[3] || {}).flow || '') + '\n' + ((d[3] || {}).activity || '');

  if (goalText.trim() && evidenceText.trim()) {
    var r1 = overlapRatio_(goalText, evidenceText);
    items.push({
      level: r1 >= 0.18 ? 'ok' : 'warn', area: '1단계 → 2단계',
      message: r1 >= 0.18
        ? '목표의 표현이 평가 증거에도 나타납니다. (겹침 ' + Math.round(r1 * 100) + '%)'
        : '목표에 쓴 말이 평가 증거에서 거의 보이지 않습니다. 이 평가가 그 목표를 겨냥하는지 확인하세요. (겹침 ' +
          Math.round(r1 * 100) + '%)'
    });
  }
  if (evidenceText.trim() && learnText.trim()) {
    var r2 = overlapRatio_(evidenceText, learnText);
    items.push({
      level: r2 >= 0.1 ? 'ok' : 'warn', area: '2단계 → 3단계',
      message: r2 >= 0.1
        ? '평가 증거가 학습 경험에서 만들어지도록 설계되어 있습니다. (겹침 ' + Math.round(r2 * 100) + '%)'
        : '수업 활동이 평가 증거를 만들어 내는지 확인하세요. 활동을 먼저 떠올렸다면 그 활동이 무엇의 증거인지 되물어 봅니다. (겹침 ' +
          Math.round(r2 * 100) + '%)'
    });
  }

  var elementsText = (d[2] || {}).elements || '';
  var rubricText = (d[2] || {}).rubric || '';
  if (elementsText.trim() && rubricText.trim()) {
    var r3 = overlapRatio_(elementsText, rubricText);
    items.push({
      level: r3 >= 0.15 ? 'ok' : 'warn', area: '평가요소 → 루브릭',
      message: r3 >= 0.15
        ? '평가요소가 루브릭의 기술어로 이어졌습니다. (겹침 ' + Math.round(r3 * 100) + '%)'
        : '루브릭이 평가요소와 다른 말로 쓰여 있습니다. 요소를 세로축에 두고 수준별로 기술했는지 확인하세요. (겹침 ' +
          Math.round(r3 * 100) + '%)'
    });
  }

  var levels = rubricText.indexOf('미흡') >= 0 && rubricText.indexOf('매우 우수') < 0
    ? ['우수', '보통', '미흡'] : ['매우 우수', '우수', '보통', '향상 필요'];
  if (rubricText.trim()) {
    var missing = [];
    for (var lv = 0; lv < levels.length; lv++) {
      if (rubricText.indexOf(levels[lv]) < 0) missing.push(levels[lv]);
    }
    items.push({
      level: missing.length ? 'warn' : 'ok', area: '루브릭 수준',
      message: missing.length
        ? '루브릭에 ' + missing.join(' · ') + ' 수준이 보이지 않습니다. 선택한 3수준 또는 4수준을 병렬 구조로 써 보세요.'
        : levels.length + '수준이 모두 기술되어 있습니다. (명칭 존재 점검이며 수행 기술어의 질은 교사가 검토합니다.)'
    });
  }

  var rows = 0, noEvidence = 0, seenPhase = {};
  for (var i = 0; i < lessons.length; i++) {
    var r = lessons[i];
    if (!r || !(r.element || r.material)) continue;
    rows++;
    if (!r.evidence || !String(r.evidence).trim()) noEvidence++;
    if (r.phase) seenPhase[r.phase] = 1;
  }
  if (rows > 0) {
    var lack = [];
    for (var ph = 0; ph < LESSON_PHASES.length; ph++) {
      if (!seenPhase[LESSON_PHASES[ph]]) lack.push(LESSON_PHASES[ph]);
    }
    var last = LESSON_PHASES[LESSON_PHASES.length - 1];
    if (!seenPhase[last]) {
      items.push({ level: 'warn', area: '학습 단계',
        message: '최종 수행과제를 수행할 "' + last + '" 차시가 차시표에 없습니다. ' +
                 '모든 활동이 수렴할 자리를 먼저 잡아 보세요.' });
    } else if (lack.length >= 2) {
      items.push({ level: 'warn', area: '학습 단계',
        message: '차시표에 ' + lack.join(' · ') + ' 단계가 없습니다. ' +
                 '단원 전체를 설계했다면 네 단계가 모두 나타나야 합니다.' });
    } else if (lack.length === 1) {
      items.push({ level: 'ok', area: '학습 단계',
        message: lack[0] + ' 단계만 비어 있습니다. 단원 일부만 설계한 것이라면 그대로 두어도 됩니다.' });
    } else {
      items.push({ level: 'ok', area: '학습 단계',
        message: '발견 → 탐색 → 적용 → 수행이 모두 배치되어 있습니다.' });
    }
  }
  if (rows === 0) {
    items.push({ level: 'warn', area: '차시 설계',
                 message: '차시별 수업 설계표가 비어 있습니다. 내용 요소별 소재를 채워 보세요.' });
  } else if (noEvidence > 0) {
    items.push({ level: 'warn', area: '차시 설계',
                 message: rows + '개 차시 중 ' + noEvidence + '개에 "확인할 증거"가 비어 있습니다.' });
  } else {
    items.push({ level: 'ok', area: '차시 설계',
                 message: rows + '개 차시 모두 도달 증거가 적혀 있습니다.' });
  }

  var ok = 0;
  for (var k = 0; k < items.length; k++) if (items[k].level === 'ok') ok++;
  return { score: items.length ? Math.round(ok / items.length * 100) : 0, items: items };
}

/* ------------------------------------------------------------------ */
/* 6. 한글 문서                                                        */
/* ------------------------------------------------------------------ */

function api_makeHwpx(design) {
  var blocks = buildDesignBlocks_(design);
  return { name: hwpxFileName_(design), b64: hwpxFromBlocks(blocks) };
}

function api_saveHwpxToDrive(design) {
  var made = api_makeHwpx(design);
  var blob = Utilities.newBlob(Utilities.base64Decode(made.b64), 'application/hwp+zip', made.name);
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DRIVE_FOLDER);
  var file = folder.createFile(blob);
  return { name: made.name, url: file.getUrl(),
           download: 'https://drive.google.com/uc?export=download&id=' + file.getId() };
}
