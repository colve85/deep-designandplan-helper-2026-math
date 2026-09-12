/** 첨부 운영 계획의 항목을 재사용하는 학기별 작성·출력 양식. 일정 및 시수는 자동 산출하지 않는다. */
var OP_META = [
 ['year','학년도'],['semester','학기'],['school','학교명'],['subject','과목'],['curriculum','적용 교육과정'],['grade','학년'],['classes','학급'],['smallClass','5명 이하 과목 석차등급란 표기'],['credits','학점'],['cutoff','분할점수산출 유형'],['teacher','지도교사']
];
var OP_SECTIONS = [
 {key:'schedule',title:'Ⅰ. 교수학습-평가 계획 (한 학기 17주 초안)',cols:[['time','시기'],['hours','시수'],['cumulative','누계'],['unit','단원명'],['standards','교육과정 성취기준'],['elements','평가 요소'],['methods','수업·평가 방법, 수업-평가 연계의 주안점'],['notes','비고']],weights:[0.6,0.5,0.5,1.3,2,1.6,2.5,0.8]}
];
function api_operationSchema(){return {meta:OP_META,sections:OP_SECTIONS};}
function opText_(value){return value===undefined||value===null?'':String(value);}
function operationBlocks_(plan){
  if(!plan||!plan.meta||!plan.sections) throw new Error('운영 계획 자료가 없습니다.');
  var m=plan.meta,b=[{t:'title',text:(m.year?m.year+'학년도 ':'')+(m.semester?m.semester+'학기 ':'')+'수학과 교수학습 및 평가 운영 계획'}, {t:'h2',text:m.subject||'과목'}];
  b.push({t:'table',head:OP_META.slice(2).map(function(x){return x[1];}),rows:[OP_META.slice(2).map(function(x){return opText_(m[x[0]]);})]});
  b.push({t:'table',head:['학년도','학기'],rows:[[opText_(m.year),opText_(m.semester)]]});
  OP_SECTIONS.forEach(function(s){
    if(s.key==='schedule')b.push({t:'pagebreak'});
    b.push({t:'h1',text:s.title});
    if(s.cols){
      var rows=Array.isArray(plan.sections[s.key])?plan.sections[s.key]:[];
      if(!rows.length) rows=[{}];
      b.push({t:'table',head:s.cols.map(function(c){return c[1];}),weights:s.weights,rows:rows.map(function(row){return s.cols.map(function(c){return opText_(row[c[0]]);});})});
    }else b.push({t:'p',text:opText_(plan.sections[s.key])});
  });
  b.push({t:'hint',text:APP_CREDIT.doc});return b;
}
function api_makeOperationHwpx(plan){
  var name=[plan.meta.year,plan.meta.semester?plan.meta.semester+'학기':'',plan.meta.subject,'교수학습 및 평가 운영 계획'].filter(function(x){return x;}).join('_').replace(/[\\/:*?"<>|]/g,'')+'.hwpx';
  return {name:name,b64:hwpxFromBlocks(operationBlocks_(plan),{landscape:true})};
}
