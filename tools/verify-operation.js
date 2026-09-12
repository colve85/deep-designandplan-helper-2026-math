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
ui.opRender=ui.save=ui.toast=function(){};
for (const u of c.getAllUnits_()) {
  ui.state.unitId=u.id;ui.state.stages={0:{},1:{},2:{},3:{}};ui.state.lessons=[];
  ui.state.operationPlans=[ui.opEmpty()];ui.opActive=0;ui.opAppend();
  const p=ui.opCurrent();
  for(const k of ['year','semester','credits'])assert.equal(p.meta[k],'');
  assert(p.sections.schedule.length>0,u.id);
  if(u.id==='official-06-00') assert(p.sections.levels.length>0,u.id+' 공식 성취수준 미연결');
  for(const row of p.sections.schedule){
    for(const k of ['time','hours','cumulative'])assert.equal(row[k],'');
    for(const k of ['unit','standards','elements','methods'])assert(row[k]&&!row[k].includes('undefined'),u.id+' '+k);
  }
  assert.equal(p.sections.overview[0].ratio,'');
  assert.equal(p.sections.performance[0].cautions,'');
}
// PDF 모델이 표를 단일 객체 또는 sections 밖에 반환해도 병합한다.
let importedPlan=ui.opEmpty();
ui.opMergeImported(importedPlan,{sections:{purpose:'평가 목적',policy:'학교 규정 확인',levels:{standard:'[코드] 기준',level:'A',description:'설명'}}});
assert.equal(importedPlan.sections.purpose,'평가 목적');
assert.equal(importedPlan.sections.levels.length,1);
ui.state.stages[0].reconstructionTitle='직접 고친 단원 제목';
ui.state.stages[2].task='직접 고친 수행과제';
ui.state.operationPlans=[ui.opEmpty()];ui.opActive=0;ui.opAppend();
let p=ui.opCurrent();
assert(p.sections.schedule[0].unit.includes('직접 고친 단원 제목'));
assert.equal(p.sections.performance[0].task,'직접 고친 수행과제');
p.meta.year='2031';p.meta.semester='1';
Object.assign(p.sections.schedule[0],{time:'3월 둘째 주',hours:'0',cumulative:'학교 직접 입력',notes:'<수정> & 보존'});
p.sections.outside=[{time:'방과 후',method:'개별 지도',content:'보충 학습',hours:'5'}];
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
assert.equal(copy.sections.outside[0].time,'');assert.equal(copy.sections.outside[0].hours,'');assert.equal(copy.sections.outside[0].content,'보충 학습');
assert.equal(p.sections.schedule[0].time,'3월 둘째 주');
assert.equal(copy.sections.schedule[0].notes,'<수정> & 보존');
assert(!c.api_makeOperationHwpx(copy).name.includes('2031'));
console.log('운영 계획: 127단원 연결, 입력 보존, 일정 빈칸, 다른 학기 복사, JSON 및 HWPX 생성 PASS');
