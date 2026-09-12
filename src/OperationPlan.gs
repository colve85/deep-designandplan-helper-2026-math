/** 첨부 운영 계획의 항목을 재사용하는 학기별 작성·출력 양식. 일정 및 시수는 자동 산출하지 않는다. */
var OP_META = [
 ['year','학년도'],['semester','학기'],['school','학교명'],['subject','과목'],['curriculum','적용 교육과정'],['grade','학년'],['classes','학급'],['smallClass','5명 이하 과목 석차등급란 표기'],['credits','학점'],['cutoff','분할점수산출 유형'],['teacher','지도교사']
];
var OP_SECTIONS = [
 {key:'schedule',title:'Ⅰ. 교수학습-평가 계획',cols:[['time','시기'],['hours','시수'],['cumulative','누계'],['unit','단원명'],['standards','교육과정 성취기준'],['elements','평가 요소'],['methods','수업·평가 방법, 수업-평가 연계의 주안점'],['notes','비고']],weights:[0.6,0.5,0.5,1.3,2,1.6,2.5,0.8]},
 {key:'levels',title:'Ⅱ. 성취기준별 성취수준 (별첨 1)',cols:[['standard','성취기준'],['level','수준'],['description','성취수준 진술']],weights:[2,0.5,4]},
 {key:'purpose',title:'Ⅲ-1. 평가 목적'}, {key:'direction',title:'Ⅲ-2. 평가 방향'}, {key:'policy',title:'Ⅲ-3. 평가 방침'}, {key:'cautions',title:'Ⅲ-4. 평가 유의사항'},
 {key:'overview',title:'Ⅲ-5. 평가 개요표',cols:[['type','평가종류'],['area','횟수/영역'],['method','평가방법'],['max','영역만점'],['ratio','학기말 반영비율(%)'],['standards','교육과정 성취기준'],['base','기본점수'],['time','평가시기']]},
 {key:'ties',title:'동점자 처리 기준 순위',cols:[['rule','방안명'],['order','방안 순위'],['suborder','방안 내 순위']]},
 {key:'cutoffs',title:'Ⅲ-6. 기준 성취율과 성취도',cols:[['range','성취율'],['level','성취도']]},
 {key:'performance',title:'Ⅲ-7. 수행평가 영역별 세부기준',cols:[['area','영역'],['task','수행 과제'],['standards','교육과정 성취기준'],['criteria','평가기준'],['method','평가방법'],['cautions','학생 유의사항']]},
 {key:'scoring',title:'수행평가 채점기준표',cols:[['area','영역'],['element','평가 요소'],['description','수행수준(채점기준)'],['score','배점']],weights:[1,1.5,4,0.5]},
 {key:'absence',title:'Ⅲ-8. 평가 미응시자 및 학적 변동자 처리'},
 {key:'appeal',title:'Ⅲ-9. 이의신청 기간 및 절차'}, {key:'use',title:'Ⅲ-10. 평가 결과의 활용'},
 {key:'semesterLevels',title:'Ⅲ-11. 학기 단위 성취수준',cols:[['level','수준'],['description','학기 단위 성취수준 진술']]},
 {key:'minimum',title:'Ⅲ-12. 최소 성취수준 설정'},
 {key:'areaLevels',title:'별첨 1. 영역별 성취수준',cols:[['area','영역'],['level','수준'],['category','범주'],['description','성취수준 진술']]},
 {key:'supportOverview',title:'별첨 2. 최소 성취수준 보장지도·추가학습 운영 개요',cols:[['course','과목명'],['credits','학점 수'],['prevention','예방 지도 시수'],['supplement','보충 지도 시수'],['additional','추가학습 시수'],['recognition','이수 인정 기준 시수']]},
 {key:'prevention',title:'예방 지도 운영 계획',cols:[['time','시기'],['unit','단원(학습 내용)'],['method','지도 계획'],['periods','계획 차시'],['hours','시수']]},
 {key:'outside',title:'수업 시간 외 학생 수준과 요구에 따른 지도',cols:[['time','시기'],['method','방법'],['content','운영 내용'],['hours','시수']]},
 {key:'supplement',title:'보충 지도·추가학습 운영 계획',cols:[['hours','시수'],['content','학습 내용(단원)'],['method','운영 방법'],['time','운영 시기'],['notes','비고']]}
];
function api_operationSchema(){return {meta:OP_META,sections:OP_SECTIONS};}
function opText_(value){return value===undefined||value===null?'':String(value);}
function operationBlocks_(plan){
  if(!plan||!plan.meta||!plan.sections) throw new Error('운영 계획 자료가 없습니다.');
  var m=plan.meta,b=[{t:'title',text:(m.year?m.year+'학년도 ':'')+(m.semester?m.semester+'학기 ':'')+'수학과 교수학습 및 평가 운영 계획'}, {t:'h2',text:m.subject||'과목'}];
  b.push({t:'table',head:OP_META.slice(2).map(function(x){return x[1];}),rows:[OP_META.slice(2).map(function(x){return opText_(m[x[0]]);})]});
  b.push({t:'table',head:['학년도','학기'],rows:[[opText_(m.year),opText_(m.semester)]]});
  OP_SECTIONS.forEach(function(s){
    if(['schedule','levels','purpose','overview','performance','semesterLevels','areaLevels','supportOverview'].indexOf(s.key)>=0)b.push({t:'pagebreak'});
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
