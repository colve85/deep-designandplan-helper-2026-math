#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {loadContext} = require('../lib/gas-runtime');
const c = loadContext();
const ui = vm.createContext({window:{addEventListener(){}},document:{getElementById(){return {};},querySelectorAll(){return [];}},console,confirm(){return true;},setTimeout(){},clearTimeout(){}});
for (const file of ['Script.html','OperationScript.html']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],ui);
}
ui.BOOT=c.api_bootstrap();
const realRender=ui.opRender;
ui.opRender=ui.save=ui.toast=function(){};
assert(ui.opAllSubjects_().length>1);
assert(ui.opAllSubjects_().includes('중학교 수학'));
for (const u of c.getAllUnits_()) {
  ui.state.unitId=u.id;ui.state.stages={0:{},1:{},2:{},3:{}};ui.state.lessons=[];
  ui.state.operationPlans=[ui.opEmpty()];ui.opActive=0;ui.opAppend();
  const p=ui.opCurrent();
  for(const k of ['year','semester','credits'])assert.equal(p.meta[k],'');
  assert(p.sections.schedule.length>0,u.id);
  assert.equal(p.sections.schedule.length,17,u.id+' 17주 초안');
  for(const row of p.sections.schedule){
    for(const k of ['time','hours','cumulative'])assert.equal(row[k],'');
    for(const k of ['unit','standards','elements','methods'])assert(row[k]&&!row[k].includes('undefined'),u.id+' '+k);
    assert(row.methods.includes('수업-평가 연계의 주안점'));
  }
}
const calculus= c.api_bootstrap().units.filter(u=>u.subject==='미적분Ⅰ'&&/^official-/.test(u.id));
// 과목 전체 기준이 17주 표에 빠짐없이 들어가는지 확인한다.
ui.state.unitId='official-06-00';ui.state.operationPlans=[ui.opEmpty()];ui.opActive=0;ui.opAppend();
const coursePlan=ui.opCurrent(), joined=coursePlan.sections.schedule.map(r=>r.standards).join('\n');
assert.equal(coursePlan.sections.schedule.length,17);
for(const u of calculus)for(const s of u.standards)assert(joined.includes('['+s.code+']'),s.code+' 과목 전체 기준 누락');
assert(coursePlan.sections.schedule.some(r=>r.unit.includes('함수의 극한과 연속')));
// 이전 버전의 별도 섹션을 가진 저장 계획은 Ⅰ 표만 남긴다.
const oldPlan=ui.opEmpty();oldPlan.sections={schedule:[],purpose:'옛 내용',levels:[{standard:'옛 기준'}]};oldPlan.meta.subject='미적분Ⅰ';ui.state.operationPlans=[oldPlan];ui.opActive=0;ui.opMigratePlan_(oldPlan);
assert.deepEqual(Object.keys(ui.opCurrent().sections),['schedule']);assert.equal(ui.opCurrent().sections.schedule.length,17);
ui.state.stages[0].reconstructionTitle='직접 고친 단원 제목';
ui.state.operationPlans=[ui.opEmpty()];ui.opActive=0;ui.opAppend();
let p=ui.opCurrent();
assert.equal(p.sections.schedule.length,17);
p.meta.year='2031';p.meta.semester='1';
Object.assign(p.sections.schedule[0],{time:'3월 둘째 주',hours:'0',cumulative:'학교 직접 입력',notes:'<수정> & 보존'});
const restored=ui.opNormalize(JSON.parse(JSON.stringify(p)));
assert.deepEqual(JSON.parse(JSON.stringify(restored.sections)),JSON.parse(JSON.stringify(p.sections)));
const blocks=c.operationBlocks_(p);
const table=blocks.find(x=>x.t==='table'&&x.head[0]==='시기');
assert.equal(table.head.length,8);
assert.equal(table.rows[0][0],'3월 둘째 주');assert.equal(table.rows[0][1],'0');assert.equal(table.rows[0][2],'학교 직접 입력');
const output=c.api_makeOperationHwpx(p);
assert(output.name.startsWith('2031_1학기_'));assert(Buffer.from(output.b64,'base64').length>5000);
ui.opCopy();const copy=ui.opCurrent();
assert.equal(copy.meta.year,'');assert.equal(copy.meta.semester,'');
assert.equal(copy.sections.schedule[0].time,'');assert.equal(copy.sections.schedule[0].hours,'');assert.equal(copy.sections.schedule[0].cumulative,'');
assert.equal(p.sections.schedule[0].time,'3월 둘째 주');
assert.equal(copy.sections.schedule[0].notes,'<수정> & 보존');
assert(!c.api_makeOperationHwpx(copy).name.includes('2031'));
console.log('운영 계획: 127단원 연결, 입력 보존, 일정 빈칸, 다른 학기 복사, JSON 및 HWPX 생성 PASS');
for(const subject of ui.opAllSubjects_()){
 const official=c.getAllUnits_().filter(u=>u.subject===subject&&/^official-/.test(u.id));
 const rows=ui.opCourseRows_(subject);
 const allowed=new Set(official.map(u=>u.officialName||u.area));
 for(const row of rows)for(const title of row.unit.split('\n'))assert(allowed.has(title),subject+': '+title);
 const standards=rows.map(r=>r.standards).join('\n');
 for(const unit of official)for(const s of unit.standards)assert(standards.includes('['+s.code+']'),s.code);
 assert(!standards.includes('교사 재구성 목표'));
}
const legacy=ui.opEmpty();legacy.meta.subject='대수';
legacy._scheduleDraftVersion='2.8.0';
legacy.sections.schedule=[{unit:'성장률 자료를 지수·로그 함수로 모델링해 목표 시간 예측하기',hours:'4',elements:'교사 평가 요소'}];
ui.state.operationPlans=[legacy];ui.opActive=0;realRender();
assert.equal(legacy.sections.schedule[0].unit,'지수함수와 로그함수');
assert.equal(legacy.sections.schedule[0].hours,'4');
assert.equal(legacy.sections.schedule[0].elements,'교사 평가 요소');
console.log('전 과목 공식 단원명·기준 포함 및 기존 제목 교정/교사 입력 보존 PASS');
