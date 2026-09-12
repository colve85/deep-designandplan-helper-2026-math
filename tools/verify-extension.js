#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {loadContext} = require('../lib/gas-runtime');
const c = loadContext();
assert.equal(c.getSubjects_().length, 21);
assert.equal(c.getAllUnits_().length, 127);
assert.equal(c.UNITS_EXTENDED_MATH.length, 35);
assert.equal(c.UNITS_OFFICIAL_MATH.length, 74);
assert.equal(c.UNITS_OFFICIAL_MATH.reduce((n,u)=>n+u.officialContentElements.length,0),194);
assert(c.UNITS_OFFICIAL_MATH.some(u=>u.subject==='중학교 수학'));
assert(c.UNITS_OFFICIAL_MATH.some(u=>u.subject==='전문 수학'));
assert(c.UNITS_OFFICIAL_MATH.every(u=>u.standardStatus==='official-source-linked'));
assert(c.UNITS_OFFICIAL_MATH.every(u=>u.officialContentElements.length>=1));
for (const u of c.UNITS_EXTENDED_MATH) {
  assert.equal(u.standardStatus, 'draft');
  assert(u.standards.every(s=>s.code.includes('교사 재구성')));
  assert.deepEqual(Array.from(new Set(u.lessons.map(l=>l.phase))), Array.from(c.LESSON_PHASES));
  assert(u.ex.task.includes('교사용 예상 결과'));
  const result=c.api_checkAlignment({stages:{0:u.ex,1:u.ex,2:u.ex,3:u.ex},lessons:u.lessons});
  assert.equal(result.items.find(i=>i.area==='루브릭 수준').level,'ok');
  const prompt=c.api_buildPrompt({stageId:2,meta:{subject:u.subject,unit:u.name,standards:u.standards},stages:{0:u.ex,1:u.ex},lessons:u.lessons});
  assert(prompt.includes(u.subject));
  assert(prompt.includes('공식 성취기준 원문'));
}
// Regression: workbook's complete 3-level rubric passes; incomplete versions do not.
for (const [rubric, expected] of [['우수: 설명 보통: 계산 미흡: 표시','ok'],['매우 우수: 설명 우수: 계산 보통: 표시 향상 필요: 관찰','ok'],['우수: 설명 보통: 계산','warn']]) {
  const result=c.api_checkAlignment({stages:{2:{rubric}},lessons:[]});
  assert.equal(result.items.find(i=>i.area==='루브릭 수준').level,expected);
}
// Execute the actual frontend functions with a minimal DOM to test data flow.
const nodes={};
function node(id){return nodes[id]||(nodes[id]={value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}}});}
const ui=vm.createContext({window:{addEventListener(){}},document:{getElementById:node,querySelectorAll(){return[];}},console,setTimeout(){},clearTimeout(){},localStorage:{getItem(){return null;},setItem(){}},confirm(){return true;}});
const script=fs.readFileSync(path.join(__dirname,'../src/Script.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
vm.runInContext(script,ui);
ui.BOOT=c.api_bootstrap();
ui.render=function(){};
ui.save=function(){};
const a=c.UNITS_EXTENDED_MATH[0],b=c.UNITS_EXTENDED_MATH[6];
ui.state.unitId=a.id;
ui.state.stages[0].bigIdea='기본수학 작성 내용';
ui.state.lessons=[a.lessons[0]];
node('selUnit').value=b.id;
ui.onUnitChange();
assert.equal(ui.state.lessons.length,0);
assert.equal(ui.state.stages[0].bigIdea,undefined);
ui.state.stages[0].bigIdea='대수 작성 내용';
node('selUnit').value=a.id;ui.onUnitChange();
assert.equal(ui.state.stages[0].bigIdea,'기본수학 작성 내용');
assert.equal(ui.state.lessons.length,1);
ui.renderStandards();
node('stdEdit').value='TEST-01 | 직접 입력한 기준의 검증용 문장';
node('stdApply').onclick();
assert.equal(ui.selectedStandards(a)[0].code,'TEST-01');
const req=ui.buildRequest(2,'stage');
assert.equal(req.meta.standards[0].code,'TEST-01');
const payload=ui.designPayload();
assert.equal(payload.meta.standards[0].code,'TEST-01');
assert(c.api_buildPrompt(req).includes('직접 입력한 기준의 검증용 문장'));
assert(JSON.stringify(c.buildDesignBlocks_(payload)).includes('직접 입력한 기준의 검증용 문장'));
const saved=JSON.parse(JSON.stringify(ui.state));
assert.equal(saved.standardOverrides[a.id][0].code,'TEST-01');
assert.equal(saved.unitDrafts[b.id].stages[0].bigIdea,'대수 작성 내용');
// Representative answer checks, independent calculations.
assert.equal(2*(12-2*2)**2,128);
assert.equal(90/(90+180),1/3);
assert.equal(Math.ceil(24*1.1/1.5),18);
assert.equal([0,1,3,3].reduce((a,b)=>a+b)/4,1.75);
console.log('확장 검증 통과: 21과목군·127단원, 공식 74영역·194내용요소, 루브릭, 과목 전환, 성취기준→프롬프트·문서·저장');
// Regression: actual example-fill action must keep three categories separate.
const categoryFields=['knowledgeUnderstanding','processFunction','valuesAttitudes'];
for(const unit of c.getAllUnits_()){
  ui.state.unitId=unit.id;
  ui.state.stages={0:{},1:{},2:{},3:{}};
  ui.fillExample(0,false);
  const filled=ui.state.stages[0];
  for(const field of categoryFields){
    assert(filled[field].trim(),unit.id+': empty '+field);
    assert(!/입력하세요/.test(filled[field]),unit.id+': placeholder '+field);
    assert(!/(지식|과정|가치)\s*[·⋅]\s*(이해|기능|태도)\s*[:：—\]]/.test(filled[field]),unit.id+': mixed labels '+field);
    assert.equal(filled[field],unit.ex[field]);
  }
  assert.equal(new Set(categoryFields.map(k=>filled[k])).size,3,unit.id+': duplicated categories');
  const blocks=JSON.stringify(c.buildDesignBlocks_(ui.designPayload()));
  for(const field of categoryFields) assert(blocks.includes(JSON.stringify(filled[field]).slice(1,-1)),unit.id+': export missing '+field);
}
const limit=c.getUnitById_('math22-10').ex;
assert.equal(limit.knowledgeUnderstanding,'함수의 극한, 좌극한과 우극한, 연속');
assert.equal(limit.processFunction,'표·식·그래프를 이용하여 함수의 극한을 탐구하고, 좌극한·우극한·함숫값을 비교하여 연속성 판단하기');
assert.equal(limit.valuesAttitudes,'자신의 예측을 자료와 비교하고 다른 풀이의 근거를 검토하여 수정한다.');
assert.equal(c.extractContentCategory_('[지식⋅이해] 개념\n[과정⋅기능] 비교\n근거 설명\n[가치⋅태도] 존중','process'),'비교\n근거 설명');
// Filling only empty fields preserves teacher edits; replacing examples repairs old fills.
ui.state.unitId='math22-10';
ui.state.stages[0].knowledgeUnderstanding='교사가 수정한 개념';
ui.fillExample(0,true);
assert.equal(ui.state.stages[0].knowledgeUnderstanding,'교사가 수정한 개념');
ui.fillExample(0,false);
assert.equal(ui.state.stages[0].knowledgeUnderstanding,limit.knowledgeUnderstanding);
console.log('범주 분리 회귀 검증 통과: 127단원 실제 예시 채우기·문서 출력·교사 수정 보존');
// Exercise every stage/field through the same actions as the UI, including legacy drafts.
let checkedFields=0;
for (const unit of ui.BOOT.units) {
  ui.state.unitId=unit.id;
  ui.state.stages={0:{},1:{},2:{},3:{}};
  ui.state.lessons=[];
  ui.fillExample(null,false);
  for(const stage of ui.BOOT.stages) for(const field of stage.fields){
    const value=ui.state.stages[stage.id][field.key];
    assert(typeof value==='string' && value.trim(),unit.id+': empty '+field.key);
    assert(!/undefined|\bnull\b/.test(value),unit.id+': broken value '+field.key);
    assert(!/하위 개념:\s*$/.test(value),unit.id+': empty concepts');
    checkedFields++;
  }
  const ex=unit.ex;
  for(const facet of ['설명하기','해석하기','적용하기','관점 가지기','감정 이입하기','자기 지식 가지기']) assert(ex.sixEvidence.includes(facet+':'),unit.id+': missing facet');
  for(const category of ['지식·이해','과정·기능','가치·태도']) assert(ex.rubricCriteria.includes(category+' — 평가 내용:'));
  for(const level of ['우수:','만족:','미도달:']) assert.equal(ex.rubricCriteria.split(level).length-1,3);
  for(const tag of ['KNOW:','DO:','UNDERSTAND:']) assert(ex.strands.includes(tag));
  assert.notEqual(ex.reflectionPrompts,ex.feedback);
  assert.notEqual(ex.sixEvidence,ex.evidence);
  assert.notEqual(ex.factualQuestions,ex.debatableQuestions);
  const serialized=JSON.parse(JSON.stringify(ui.state));
  const blocks=JSON.stringify(c.buildDesignBlocks_(ui.designPayload()));
  for(const stage of ui.BOOT.stages) for(const field of stage.fields){
    assert.equal(serialized.stages[stage.id][field.key],ex[field.key]);
    assert(blocks.includes(JSON.stringify(ex[field.key]).slice(1,-1)),unit.id+': missing export '+field.key);
  }
  // Old drafts can omit whole stages. The blank-fill action preserves the existing text.
  ui.state.stages={0:{bigIdea:'교사가 직접 쓴 문장'}};
  ui.fillExample(null,true);
  assert.equal(ui.state.stages[0].bigIdea,'교사가 직접 쓴 문장');
  assert(ui.state.stages[3].reflectionPrompts);
}
// Missing source data must report a failure, not show an unconditional success.
const testUnit=ui.BOOT.units[0], oldExample=testUnit.ex.strands;
ui.state.unitId=testUnit.id; ui.state.stages={1:{}};
delete testUnit.ex.strands;
ui.fillExample(1,false);
assert(node('checkHost').innerHTML.includes('단원 그물'));
assert(node('toast').textContent.includes('누락된 항목'));
testUnit.ex.strands=oldExample;
console.log('전체 예시 검증 통과: '+checkedFields+'개 필드, 6증거·3수준·스트랜드·저장·문서·옛 초안 빈칸 보완');
assert(!c.STAGES[0].fields.some(f=>f.key==='bigIdea'));
assert(c.STAGES[0].fields.some(f=>f.key==='curriculumCoreIdea'));
assert(c.STAGES[0].fields.some(f=>f.key==='reconstructedCoreIdea'));
for(const u of c.getAllUnits_()){
  for(const key of ['canDo','elements'])for(const label of ['지식·이해','과정·기능','가치·태도']){
    assert(u.ex[key].split('['+label+']').length-1<=1,u.id+' repeated '+key+' '+label);
  }
  assert(/인간상: (자기주도적인 사람|창의적인 사람|교양 있는 사람|더불어 사는 사람)/.test(u.ex.competency));
  assert(u.ex.competency.includes('핵심역량:'));
  assert(u.ex.competency.includes('수학 교과 역량:'));
}
ui.state.stages={0:{bigIdea:'이전 교사 작성 핵심 아이디어'}};ui.migrateCoreIdea();
assert.equal(ui.state.stages[0].reconstructedCoreIdea,'이전 교사 작성 핵심 아이디어');
ui.state.stages[0].reconstructedCoreIdea='수정한 핵심 아이디어';ui.migrateCoreIdea();
assert.equal(ui.state.stages[0].reconstructedCoreIdea,'수정한 핵심 아이디어');
console.log('2.7.4: 인간상 포함·범주명 반복 제거·핵심 아이디어 이전 입력 보존 PASS');
const clipped=c.api_parsePasted({stageId:2,text:'{"task":"완성된 수행과제","evidence":"활동지\\n동료 검토","plan":"3차시 평가 후 10'});
assert(clipped.ok&&clipped.partial);
assert.equal(clipped.parsed.task,'완성된 수행과제');
assert.equal(clipped.parsed.evidence,'활동지\n동료 검토');
assert(!('plan' in clipped.parsed));
ui.state.stages={2:{plan:'교사 기존 계획'}};ui.applyParsed(2,clipped.parsed);
assert.equal(ui.state.stages[2].plan,'교사 기존 계획');
assert(!c.api_parsePasted({stageId:2,text:'{"unrelated":"잘못된 단계"}'}).ok);
const complete=JSON.stringify(Object.fromEntries(c.STAGES[2].fields.map(f=>[f.key,'검증 문장'])));
assert.equal(c.api_parsePasted({stageId:2,text:complete}).partial,false);
assert.equal(c.api_parsePasted({stageId:2,text:JSON.stringify(complete)}).partial,false);
console.log('2.7.5: 잘린 응답 부분 복구·미완성 값 제외·교사 입력 보존 PASS');
const limitUnit=c.getAllUnits_().find(u=>u.id==='official-06-00');
assert(limitUnit,'미적분Ⅰ 함수의 극한과 연속 단원 없음');
assert.equal(limitUnit.standards.length,4);
assert(limitUnit.ex.achievementLevels.includes('[12미적Ⅰ-01-01]'));
assert(limitUnit.ex.achievementLevels.includes('A —'));
assert(!limitUnit.ex.achievementStandards.includes('[12미적Ⅰ-02-'));
console.log('2.7.6: 영역별 공식 성취기준 필터·성취수준 A~E 연결 PASS');
