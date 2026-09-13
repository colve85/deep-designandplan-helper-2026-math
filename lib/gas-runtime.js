/**
 * gas-runtime.js — src/*.gs 를 Node 에서 그대로 실행하기 위한 런타임
 *
 * Apps Script 전역(Utilities, Session, PropertiesService …)을 흉내 내어
 * 같은 소스를 Vercel 서버리스 함수와 로컬 개발 서버, 검증 스크립트가
 * 함께 쓴다. Apps Script 에 배포할 때는 이 파일이 쓰이지 않는다.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');

/* ------------------------------------------------------------------ */
/* Apps Script 전역 흉내내기                                            */
/* ------------------------------------------------------------------ */

function Blob(bytes, type, name) { this._b = Buffer.from(bytes); this._t = type; this._n = name; }
Blob.prototype.getBytes = function () {
  const a = []; for (const v of this._b) a.push(v > 127 ? v - 256 : v); return a;
};
Blob.prototype.getName = function () { return this._n; };
Blob.prototype.setName = function (n) { this._n = n; return this; };
Blob.prototype.setContentType = function (t) { this._t = t; return this; };
Blob.prototype.getDataAsString = function () { return this._b.toString('utf8'); };

function toBuf(x) {
  if (x instanceof Blob) return x._b;
  if (typeof x === 'string') return Buffer.from(x, 'utf8');
  return Buffer.from(x.map(v => (v < 0 ? v + 256 : v)));
}

/** STORE/DEFLATE 를 모두 읽는 최소 zip 리더 */
function unzipEntries(buf) {
  const out = []; let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const csize = buf.readUInt32LE(i + 18);
    const nlen = buf.readUInt16LE(i + 26);
    const elen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nlen).toString('utf8');
    const start = i + 30 + nlen + elen;
    let data = buf.slice(start, start + csize);
    if (method === 8) data = zlib.inflateRawSync(data);
    out.push(new Blob(data, 'application/octet-stream', name));
    i = start + csize;
  }
  return out;
}

const Utilities = {
  base64Decode: s => {
    const b = Buffer.from(s, 'base64'); const a = [];
    for (const v of b) a.push(v > 127 ? v - 256 : v);
    return a;
  },
  base64Encode: b => toBuf(b).toString('base64'),
  newBlob: (d, t, n) => new Blob(toBuf(d), t, n),
  ungzip: b => new Blob(zlib.gunzipSync(toBuf(b)), 'application/zip', 'x'),
  unzip: b => unzipEntries(toBuf(b)),
  formatDate: (d) => {
    const dt = d instanceof Date ? d : new Date();
    const kst = new Date(dt.getTime() + 9 * 3600 * 1000);
    return kst.getUTCFullYear() + '. ' + (kst.getUTCMonth() + 1) + '. ' + kst.getUTCDate() + '.';
  }
};

/** 파일 로드 순서 — 전역 선언만 있으므로 순서에 민감하지 않다. */
const GAS_FILES = ['Code.gs', 'Stages.gs', 'UnitsCommonMath1.gs', 'UnitsCommonMath2.gs', 'UnitsExtendedMath.gs', 'UnitsOfficialMath.gs',
                   'HwpxTemplate.gs', 'Hwpx.gs', 'DocBuilder.gs', 'OperationPlan.gs', 'AchievementLevels.gs', 'Api.gs'];

/**
 * @param {string} runtime 'gas' 를 대체할 런타임 이름. 화면이 환경을 구별할 때 쓴다.
 */
function loadContext(runtime) {
  const ctx = vm.createContext({
    Utilities, console, Blob,
    GAS_RUNTIME_OVERRIDE: runtime || 'node',
    Session: { getScriptTimeZone: () => 'Asia/Seoul', getActiveUser: () => ({ getEmail: () => '' }) },
    PropertiesService: {
      getUserProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }),
      getScriptProperties: () => ({ getProperty: (k) => process.env[k] || null })
    },
    HtmlService: { createTemplateFromFile: () => ({ evaluate: () => ({}) }) },
    DriveApp: {}, UrlFetchApp: {}, Logger: { log: console.log }
  });
  for (const f of GAS_FILES) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* 화면 렌더 — Apps Script 템플릿 문법을 대신 처리한다                    */
/* ------------------------------------------------------------------ */

/** google.script.run 을 fetch 로 중계하는 브라우저 쪽 어댑터 */
const CLIENT_SHIM = `
<script>
window.google = { script: { run: (function make(state){
  state = state || {};
  return new Proxy({}, { get: function(_, k){
    if (typeof k !== 'string' || k === 'then' || k === 'toJSON') return undefined;
    if (k === 'withSuccessHandler') return function(f){ return make({ s:f, f:state.f }); };
    if (k === 'withFailureHandler') return function(f){ return make({ s:state.s, f:f }); };
    return function(){
      var args = Array.prototype.slice.call(arguments);
      fetch('/api', { method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ fn:k, args:args }) })
        .then(function(r){ return r.json(); })
        .then(function(j){ if (j.error) { if (state.f) state.f(new Error(j.error)); }
                           else if (state.s) state.s(j.result); })
        .catch(function(e){ if (state.f) state.f(e); });
    };
  }});
})() } };
</script>`;

function renderIndex(ctx) {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?=\s*appTitle\s*\?>/g, ctx.APP_TITLE);
  html = html.replace(/<\?=\s*appVersion\s*\?>/g, ctx.APP_VERSION);
  html = html.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, name) => {
    const part = fs.readFileSync(path.join(SRC, name + '.html'), 'utf8');
    return name === 'Script' ? CLIENT_SHIM + part : part;
  });
  return html;
}

/* ------------------------------------------------------------------ */
/* API 중계                                                            */
/* ------------------------------------------------------------------ */

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
function normalizeGeminiModel(value, fallback) { const model=String(value||fallback||'gemini-3.6-flash').trim().replace(/^models\//,''); return model||fallback||'gemini-3.6-flash'; }

/**
 * Apps Script 의 UrlFetchApp 은 동기 호출이라 Node 에서 그대로 쓸 수 없다.
 * 프롬프트 생성과 응답 파싱만 공용 코드에 맡기고 실제 호출은 여기서 한다.
 */
async function generate(ctx, req) {
  const key = String((req && req.apiKey) || process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    return { ok: false, error: 'NO_KEY',
             message: 'Gemini API 키가 없습니다. 설정에서 키를 입력하거나 붙여넣기 모드를 사용하세요.' };
  }
  const wantArray = req.kind === 'lessons';
  const model = String((req && req.model) || process.env.GEMINI_MODEL || ctx.DEFAULT_MODEL).trim();
  const prompt = wantArray ? ctx.api_buildLessonPrompt(req) : ctx.api_buildPrompt(req);

  let res;
  try {
    res = await fetch(GEMINI_URL + encodeURIComponent(model) +
                      ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 8192 }
      })
    });
  } catch (e) {
    return { ok: false, error: 'FETCH', message: '요청 중 오류가 발생했습니다: ' + e.message };
  }

  const body = await res.text();
  if (!res.ok) {
    return { ok: false, error: 'HTTP_' + res.status,
             message: 'Gemini 응답 오류(' + res.status + '). 키 또는 모델명을 확인하세요.\n' +
                      body.substring(0, 300) };
  }
  let text = '';
  try {
    const json = JSON.parse(body);
    const parts = json.candidates && json.candidates[0] && json.candidates[0].content &&
                  json.candidates[0].content.parts;
    if (parts) for (const p of parts) if (p.text) text += p.text;
  } catch (e) {
    return { ok: false, error: 'PARSE', message: '응답을 해석하지 못했습니다.' };
  }
  if (!text) return { ok: false, error: 'EMPTY', message: '빈 응답을 받았습니다. 다시 시도해 주세요.' };
  return { ok: true, raw: text, parsed: ctx.parseModelJson_(text, wantArray) };
}

async function extractOperationPlan(ctx, req) {
  const key=String((req&&req.apiKey)||process.env.GEMINI_API_KEY||'').trim();
  if(!key)return {ok:false,error:'NO_KEY',message:'PDF 분석에는 Gemini API 키가 필요합니다.'};
  const schema=ctx.api_operationSchema(); const shape={meta:{},sections:{}};
  schema.meta.forEach(c=>{shape.meta[c[0]]='';});
  schema.sections.forEach(s=>{if(s.key!=='schedule')shape.sections[s.key]=s.cols?[{}]:'';});
  const prompt='첨부한 지난 학기 수학과 교수학습 및 평가 운영 계획 PDF를 읽고 JSON으로 구조화하세요. 현재 새 계획의 Ⅰ. 교수학습-평가 계획(schedule)은 절대 출력하거나 변경하지 않습니다. 나머지 메타데이터와 Ⅱ~Ⅲ 및 별첨 내용을 최대한 보존해 옮기세요. 각 sections 항목은 PDF에 내용이 있으면 반드시 문자열 또는 한 개 이상의 행으로 채우고, PDF에서 확인할 수 없는 항목만 빈 문자열·빈 배열로 두세요. 표의 열 이름은 JSON 모양의 영문 키를 그대로 사용하세요. 날짜·시기·시수·누계는 학교마다 다르므로 추정하지 말고 빈 문자열로 두세요. 확인할 수 없는 규정도 빈 문자열로 두세요. 설명·코드블록 없이 아래 JSON 모양만 출력하세요.\n'+JSON.stringify(shape);
  try {
    const model=normalizeGeminiModel(req&&req.model,ctx.DEFAULT_MODEL);
    const res=await fetch(GEMINI_URL+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:'application/pdf',data:String((req&&req.pdfBase64)||'')}}]}],generationConfig:{temperature:0.1,maxOutputTokens:8192}})});
    const body=await res.text();if(!res.ok)return {ok:false,error:'HTTP_'+res.status,message:'PDF 분석 응답 오류('+res.status+', 모델 '+model+'). 모델명을 gemini-3.6-flash로 확인하세요.'};
    const json=JSON.parse(body);let text='';const parts=json.candidates&&json.candidates[0]&&json.candidates[0].content&&json.candidates[0].content.parts||[];parts.forEach(x=>{if(x.text)text+=x.text;});
    return {ok:true,parsed:ctx.parseModelJson_(text,false),source:'pdf'};
  } catch(e){return {ok:false,error:'PDF_PARSE',message:e.message};}
}

/** Apps Script 에만 있는 기능 — Node 환경에서는 안내만 돌려준다. */
const GAS_ONLY = {
  api_saveHwpxToDrive: '이 배포에서는 드라이브 저장을 지원하지 않습니다. [한글 문서로 내려받기]를 사용하세요.',
  api_saveSettings: '이 배포에서는 설정이 브라우저에 저장됩니다.',
};

/**
 * @param {Object} ctx loadContext() 결과
 * @param {{fn:string, args:Array}} call
 * @return {Promise<{result?:any, error?:string}>}
 */
async function handleApi(ctx, call) {
  const fn = call && call.fn;
  const args = (call && call.args) || [];
  try {
    if (fn === 'api_generate') return { result: await generate(ctx, args[0] || {}) };
    if (fn === 'api_extractOperationPlan') return { result: await extractOperationPlan(ctx, args[0] || {}) };
    if (GAS_ONLY[fn]) throw new Error(GAS_ONLY[fn]);
    if (typeof ctx[fn] !== 'function') throw new Error('없는 함수: ' + fn);
    return { result: ctx[fn].apply(null, args) };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { loadContext, renderIndex, handleApi, generate, extractOperationPlan,
                   Utilities, Blob, GAS_FILES, CLIENT_SHIM, SRC };
